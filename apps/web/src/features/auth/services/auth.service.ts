import { apiClient } from '../../../lib/api-client';
import type { AuthState, AuthUser } from '../types/auth.types';
export const authService = {
  signup: (email: string, password: string) =>
    apiClient.request<AuthState>(
      '/auth/signup',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    ),
  login: (email: string, password: string) =>
    apiClient.request<AuthState>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    ),
  refresh: () => apiClient.refresh() as Promise<AuthState>,
  me: () => apiClient.request<{ user: AuthUser }>('/auth/me'),
  logout: () => apiClient.logout(),
};
