import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { TailorPage } from './pages/TailorPage';
import { SessionPage } from './pages/SessionPage';
import { LoginPage } from './pages/LoginPage';
import { HistoryPage } from './pages/HistoryPage';
import { AuthProvider, useAuth } from './auth';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <p className="loading-line">Checking session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/tailor/:profileId" element={<TailorPage />} />
          <Route path="/session/:sessionId" element={<SessionPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
