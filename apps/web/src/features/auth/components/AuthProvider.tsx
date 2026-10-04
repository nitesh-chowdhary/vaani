import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '../../../lib/api-client';
import { authService } from '../services/auth.service';
import type { AuthState, AuthUser } from '../types/auth.types';
export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  authenticate: (
    mode: 'login' | 'signup',
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    apiClient.configureAuth(
      (data) => {
        if (active) setUser((data as AuthState).user);
      },
      () => {
        if (active) setUser(null);
      },
    );
    void (async () => {
      try {
        await authService.refresh();
        const state = await authService.me();
        if (active) setUser(state.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const authenticate = useCallback(
    async (mode: 'login' | 'signup', email: string, password: string) => {
      const state = await authService[mode](email, password);
      apiClient.setAccessToken(state.accessToken);
      setUser(state.user);
    },
    [],
  );
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);
  return (
    <AuthContext.Provider value={{ user, loading, authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
