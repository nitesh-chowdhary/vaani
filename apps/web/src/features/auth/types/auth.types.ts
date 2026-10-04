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
