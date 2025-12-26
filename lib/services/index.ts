/**
 * Services Layer
 *
 * Provides a unified API for data access that works in both:
 * - Development mode: Uses fetch() to Next.js API routes
 * - Tauri mode: Uses @tauri-apps/plugin-sql directly
 *
 * Usage:
 * ```typescript
 * import { api } from '@/lib/services';
 *
 * // Make API requests (routes automatically based on environment)
 * const result = await api.get('/api/transactions');
 * const result = await api.post('/api/transactions', { ... });
 * ```
 */

export {
  isTauriContext,
  apiRequest,
  get,
  post,
  put,
  del,
  patch,
  type ApiResponse,
} from './api-client';

// Re-export as a namespace for convenience
import * as apiClient from './api-client';
export const api = {
  isTauri: apiClient.isTauriContext,
  request: apiClient.apiRequest,
  get: apiClient.get,
  post: apiClient.post,
  put: apiClient.put,
  delete: apiClient.del,
  patch: apiClient.patch,
};
