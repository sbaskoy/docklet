import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from './api';
import Layout from './components/Layout';
import SetupPage from './pages/SetupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedRoute({ children }) {
  const token = api.getToken();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuthStatus()
      .then((data) => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(false))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={needsSetup ? <SetupPage onComplete={() => setNeedsSetup(false)} /> : <Navigate to="/" replace />} />
        <Route path="/login" element={needsSetup ? <Navigate to="/setup" replace /> : <LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="new" element={<NewProjectPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={needsSetup ? '/setup' : '/'} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
