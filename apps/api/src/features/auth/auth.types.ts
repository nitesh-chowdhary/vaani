export interface AuthUser {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  createdAt: string;
}
export interface AuthState {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
}
export interface AuthResult extends AuthState {
  refreshToken: string;
  refreshExpiresAt: string;
}
declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string; user: AuthUser };
  }
}
