import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Checking authentication…</p>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
