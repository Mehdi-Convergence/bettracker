import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { TierGuard } from "./components/TierGuard";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";

// Lazy-loaded pages for code-splitting
const Scanner = lazy(() => import("./pages/Scanner"));
const Backtest = lazy(() => import("./pages/Backtest"));
const Campaign = lazy(() => import("./pages/Campaign"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const AIAnalyste = lazy(() => import("./pages/AIAnalyste"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Settings = lazy(() => import("./pages/Settings"));
const Parametres = lazy(() => import("./pages/Parametres"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Admin = lazy(() => import("./pages/Admin"));
const DashboardV3 = lazy(() => import("./pages/DashboardV3"));
const MentionsLegales = lazy(() => import("./pages/MentionsLegales"));
const CGU = lazy(() => import("./pages/CGU"));
const ConfidentialitePolicy = lazy(() => import("./pages/ConfidentialitePolicy"));

const PageLoader = () => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageLoader />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function LandingRoute({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) return <PageLoader />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PreferencesProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingRoute><Landing /></LandingRoute>} />
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/cgu" element={<CGU />} />
            <Route path="/confidentialite" element={<ConfidentialitePolicy />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="dashboard" element={<DashboardV3 />} />
              <Route path="scanner" element={<TierGuard minTier="pro"><Scanner /></TierGuard>} />
              <Route path="backtest" element={<TierGuard minTier="pro"><Backtest /></TierGuard>} />
              <Route path="campaign" element={<TierGuard minTier="premium"><Campaign /></TierGuard>} />
              <Route path="campaign/:id" element={<TierGuard minTier="premium"><CampaignDetail /></TierGuard>} />
              <Route path="portfolio" element={<TierGuard minTier="pro"><Portfolio /></TierGuard>} />
              <Route path="ai-analyst" element={<AIAnalyste />} />
              <Route path="settings" element={<Settings />} />
              <Route path="parametres" element={<Parametres />} />
              <Route path="analytics" element={<TierGuard minTier="pro"><Analytics /></TierGuard>} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Routes>
        </Suspense>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
