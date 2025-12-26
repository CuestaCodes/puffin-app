/**
 * API Client Service
 *
 * Provides a unified interface for data access that works in both:
 * - Development mode: Uses fetch() to Next.js API routes
 * - Tauri mode: Uses @tauri-apps/plugin-sql directly
 *
 * Components should import from this module instead of using fetch() directly.
 */

/**
 * Check if we're running in Tauri context.
 * This is a client-side only check.
 */
export function isTauriContext(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__TAURI__;
}

/**
 * API Response type for consistent error handling.
 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Make an API request that routes based on environment.
 *
 * In Tauri mode, this uses the Tauri database service.
 * In dev mode, this uses fetch() to API routes.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  // In Tauri mode, route to Tauri handlers
  if (isTauriContext()) {
    return handleTauriRequest<T>(endpoint, options);
  }

  // In dev mode, use fetch
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      return {
        error: error.error || error.message || 'Request failed',
        status: response.status,
      };
    }

    const data = await response.json();
    return { data, status: response.status };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      status: 0,
    };
  }
}

// Track if handlers have been initialized
let handlersInitialized = false;

/**
 * Initialize Tauri handlers lazily.
 */
async function ensureHandlersInitialized(): Promise<void> {
  if (handlersInitialized) return;

  // Dynamic import to avoid bundling issues in non-Tauri builds
  const { initializeTauriHandlers } = await import('./handlers');
  initializeTauriHandlers();
  handlersInitialized = true;
}

/**
 * Handle API requests in Tauri mode by routing to appropriate database operations.
 */
async function handleTauriRequest<T>(
  endpoint: string,
  options: RequestInit
): Promise<ApiResponse<T>> {
  // Ensure handlers are registered
  await ensureHandlersInitialized();

  const method = options.method?.toUpperCase() || 'GET';
  const body = options.body ? JSON.parse(options.body as string) : undefined;

  // Parse the endpoint to determine the handler
  const url = new URL(endpoint, 'http://localhost');
  const path = url.pathname;
  const params = Object.fromEntries(url.searchParams);

  try {
    // Route to appropriate handler based on path
    const handler = getHandler(path);
    if (!handler) {
      return { error: `No handler for ${path}`, status: 404 };
    }

    const result = await handler({ method, body, params, path });
    return { data: result as T, status: 200 };
  } catch (error) {
    console.error(`Tauri handler error for ${path}:`, error);
    return {
      error: error instanceof Error ? error.message : 'Handler error',
      status: 500,
    };
  }
}

/**
 * Handler function type for Tauri routes.
 */
type RouteHandler = (ctx: {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}) => Promise<unknown>;

/**
 * Route registry for Tauri handlers.
 * Handlers are lazily loaded to avoid circular dependencies.
 */
const routeHandlers: Record<string, () => Promise<RouteHandler>> = {};

/**
 * Register a handler for a route pattern.
 */
export function registerHandler(pattern: string, handler: () => Promise<RouteHandler>): void {
  routeHandlers[pattern] = handler;
}

/**
 * Get the handler for a given path.
 */
function getHandler(path: string): RouteHandler | null {
  // Try exact match first
  if (routeHandlers[path]) {
    // Return a wrapper that loads the handler lazily
    return async (ctx) => {
      const handlerFn = await routeHandlers[path]();
      return handlerFn(ctx);
    };
  }

  // Try pattern matching for dynamic routes like /api/transactions/[id]
  for (const pattern of Object.keys(routeHandlers)) {
    const regex = patternToRegex(pattern);
    const match = path.match(regex);
    if (match) {
      return async (ctx) => {
        // Extract path parameters
        const paramNames = extractParamNames(pattern);
        const pathParams: Record<string, string> = {};
        paramNames.forEach((name, index) => {
          pathParams[name] = match[index + 1];
        });

        const handlerFn = await routeHandlers[pattern]();
        return handlerFn({ ...ctx, params: { ...ctx.params, ...pathParams } });
      };
    }
  }

  return null;
}

/**
 * Convert a route pattern like /api/transactions/[id] to a regex.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\[(\w+)\\\]/g, '([^/]+)');
  return new RegExp(`^${escaped}$`);
}

/**
 * Extract parameter names from a route pattern.
 */
function extractParamNames(pattern: string): string[] {
  const matches = pattern.match(/\[(\w+)\]/g) || [];
  return matches.map(m => m.slice(1, -1));
}

// ============================================================================
// Convenience methods for common HTTP verbs
// ============================================================================

export async function get<T>(endpoint: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

export async function post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function del<T>(endpoint: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

export async function patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
