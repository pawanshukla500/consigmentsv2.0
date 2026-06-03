import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Consignments from './pages/Consignments';
import ConsignmentDetail from './pages/ConsignmentDetail';
import Productivity from './pages/Productivity';
import Marketplaces from './pages/Marketplaces';
import DocketCompanies from './pages/DocketCompanies';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import PackingStation from './pages/PackingStation';
import TermsAndConditions from './pages/TermsAndConditions';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ContactDetails from './pages/ContactDetails';
import CopyrightPage from './pages/CopyrightPage';

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Loading…</p>
    </div>
  </div>
);

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Spinner />;
  return !isAuthenticated ? children : <Navigate to="/" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public ── */}
      <Route path="/login"     element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/terms"     element={<TermsAndConditions />} />
      <Route path="/privacy"   element={<PrivacyPolicy />} />
      <Route path="/contact"   element={<ContactDetails />} />
      <Route path="/copyright" element={<CopyrightPage />} />

      {/* ── Standalone packing (full screen) ── */}
      <Route path="/packing" element={<PrivateRoute><PackingStation /></PrivateRoute>} />

      {/* ── App shell ── */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index                        element={<Dashboard />} />
        <Route path="consignments"          element={<Consignments />} />
        <Route path="consignments/:id"      element={<ConsignmentDetail />} />
        <Route path="productivity"          element={<Productivity />} />
        <Route path="marketplaces"          element={<Marketplaces />} />
        <Route path="docket-companies"      element={<DocketCompanies />} />
        <Route path="users"                 element={<Users />} />
        <Route path="audit-logs"            element={<AuditLogs />} />
        <Route path="settings"              element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
