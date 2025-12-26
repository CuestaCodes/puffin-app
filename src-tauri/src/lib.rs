//! Puffin Desktop Application Entry Point
//!
//! This module initializes the Tauri application with required plugins:
//! - single-instance: Prevents multiple app instances
//! - sql: Native SQLite database access
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

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when a second instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
