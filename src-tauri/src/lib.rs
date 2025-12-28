//! Puffin Desktop Application Entry Point
//!
//! This module initializes the Tauri application with required plugins:
//! - single-instance: Prevents multiple app instances
//! - sql: Native SQLite database access
//! - deep-link: Handles OAuth callbacks via puffin:// protocol
//! - log: Debug logging (development builds only)
//!
//! # Security Notes
//!
//! The CSP in tauri.conf.json includes `'unsafe-inline'` for styles because:
//! - Tailwind CSS and many UI libraries inject inline styles dynamically
//! - Next.js uses inline styles for critical CSS optimization
//! - This is a common requirement for React/CSS-in-JS applications
//!
//! Future improvement: Consider nonce-based CSP for stricter security.

use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tiny_http::{Response, Server};
use url::Url;

/// Result of the OAuth flow
#[derive(serde::Serialize)]
pub struct OAuthResult {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub redirect_uri: Option<String>,
}

/// Find an available port for the OAuth callback server
fn find_available_port() -> Option<u16> {
    // Try ports in the range 49152-65535 (dynamic/private ports)
    for port in 49152..65535 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Some(port);
        }
    }
    None
}

/// Start OAuth flow with a local callback server
/// Returns the authorization code or an error
#[tauri::command]
async fn start_oauth_flow(
    app: tauri::AppHandle,
    auth_url_base: String,
    client_id: String,
    scope: String,
    state: String,
) -> Result<OAuthResult, String> {
    // Find an available port
    let port = find_available_port().ok_or("No available port found")?;
    let redirect_uri = format!("http://127.0.0.1:{}", port);

    // Build the full OAuth URL
    let mut auth_url = Url::parse(&auth_url_base).map_err(|e| e.to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &scope)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", &state);

    // Start the callback server in a separate thread
    let (tx, rx) = mpsc::channel::<OAuthResult>();

    let server_port = port;
    let redirect_uri_clone = redirect_uri.clone();
    thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", server_port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                let _ = tx.send(OAuthResult {
                    code: None,
                    state: None,
                    error: Some(format!("Failed to start server: {}", e)),
                    redirect_uri: Some(redirect_uri_clone.clone()),
                });
                return;
            }
        };

        // Wait for a single request (with timeout)
        // Set server timeout
        let timeout = Duration::from_secs(300); // 5 minute timeout

        match server.recv_timeout(timeout) {
            Ok(Some(request)) => {
                let url_str = format!("http://127.0.0.1{}", request.url());
                let parsed = Url::parse(&url_str);

                let result = match parsed {
                    Ok(url) => {
                        let params: std::collections::HashMap<_, _> =
                            url.query_pairs().into_owned().collect();

                        OAuthResult {
                            code: params.get("code").cloned(),
                            state: params.get("state").cloned(),
                            error: params.get("error").cloned(),
                            redirect_uri: Some(redirect_uri_clone.clone()),
                        }
                    }
                    Err(e) => OAuthResult {
                        code: None,
                        state: None,
                        error: Some(format!("Failed to parse callback URL: {}", e)),
                        redirect_uri: Some(redirect_uri_clone.clone()),
                    },
                };

                // Send a response to the browser
                let html = if result.code.is_some() {
                    r#"<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center; height: 100vh;
               margin: 0; background: #1a1a2e; color: #eee; }
        .container { text-align: center; padding: 2rem; }
        .success { color: #10b981; font-size: 3rem; margin-bottom: 1rem; }
        h1 { margin: 0 0 1rem 0; }
        p { color: #888; }
    </style>
</head>
<body>
    <div class="container">
        <div class="success">✓</div>
        <h1>Authentication Successful</h1>
        <p>You can close this window and return to Puffin.</p>
    </div>
</body>
</html>"#
                } else {
                    r#"<!DOCTYPE html>
<html>
<head>
    <title>Authentication Failed</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               display: flex; justify-content: center; align-items: center; height: 100vh;
               margin: 0; background: #1a1a2e; color: #eee; }
        .container { text-align: center; padding: 2rem; }
        .error { color: #ef4444; font-size: 3rem; margin-bottom: 1rem; }
        h1 { margin: 0 0 1rem 0; }
        p { color: #888; }
    </style>
</head>
<body>
    <div class="container">
        <div class="error">✗</div>
        <h1>Authentication Failed</h1>
        <p>Please close this window and try again in Puffin.</p>
    </div>
</body>
</html>"#
                };

                let response = Response::from_string(html)
                    .with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                            .unwrap(),
                    );
                let _ = request.respond(response);

                let _ = tx.send(result);
            }
            Ok(None) => {
                let _ = tx.send(OAuthResult {
                    code: None,
                    state: None,
                    error: Some("OAuth timeout - no callback received".to_string()),
                    redirect_uri: Some(redirect_uri_clone.clone()),
                });
            }
            Err(e) => {
                let _ = tx.send(OAuthResult {
                    code: None,
                    state: None,
                    error: Some(format!("Server error: {}", e)),
                    redirect_uri: Some(redirect_uri_clone.clone()),
                });
            }
        }
    });

    // Open the OAuth URL in the default browser
    if let Err(e) = open::that(auth_url.as_str()) {
        return Err(format!("Failed to open browser: {}", e));
    }

    // Focus the main window after a short delay to let the browser open
    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(500));
        if let Some(window) = handle.get_webview_window("main") {
            let _ = window.set_focus();
        }
    });

    // Wait for the callback result
    match rx.recv_timeout(Duration::from_secs(300)) {
        Ok(result) => Ok(result),
        Err(_) => Err("OAuth timeout - no response received".to_string()),
    }
}

/// Get the redirect URI for OAuth configuration
#[tauri::command]
fn get_oauth_redirect_uri() -> String {
    // Return a placeholder - the actual port is determined at runtime
    "http://127.0.0.1".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![start_oauth_flow, get_oauth_redirect_uri])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Emit ready event
            let _ = app.emit("app-ready", ());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
