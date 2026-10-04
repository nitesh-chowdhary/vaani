import { CourseHome } from '../features/course/pages/CourseHome';
import { SessionPage } from '../features/session/pages/SessionPage';
import { CheckpointPage } from '../features/assessment/pages/CheckpointPage';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  AuthProvider,
  ProtectedRoute,
  LoginPage,
  SignupPage,
} from '../features/auth';
export function App() {
  return (
    <AuthProvider>
      <main className="vaani-root">
        <Routes>
          <Route
            path="/login"
            element={
              <div className="auth-stage">
                <LoginPage />
              </div>
            }
          />
          <Route
            path="/signup"
            element={
              <div className="auth-stage">
                <SignupPage />
              </div>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<CourseHome />} />
            <Route path="/app/session/:id" element={<SessionPage />} />
            <Route path="/app/checkpoint" element={<CheckpointPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
