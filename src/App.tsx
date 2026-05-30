import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SuccessPage from "./pages/SuccessPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminProducts from "./pages/AdminProducts";
import AdminMeetings from "./pages/AdminMeetings";
import AdminUsers from "./pages/AdminUsers";
import AdminLeads from "./pages/AdminLeads";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import SustainabilityPage from "./pages/SustainabilityPage";
import InstallationPage from "./pages/InstallationPage";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/success" element={<SuccessPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/leads" element={<AdminLeads />} />
          <Route path="/admin/products" element={<AdminProducts />} />
          <Route path="/admin/meetings" element={<AdminMeetings />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/politicas-de-privacidade" element={<PrivacyPolicyPage />} />
          <Route path="/termos-de-uso" element={<TermsPage />} />
          <Route path="/sustentabilidade" element={<SustainabilityPage />} />
          <Route path="/instalacao" element={<InstallationPage />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
