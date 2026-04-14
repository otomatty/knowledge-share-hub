import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import TipNew from "./pages/TipNew";
import TipDetail from "./pages/TipDetail";
import TipsList from "./pages/TipsList";
import ProfileSettings from "./pages/ProfileSettings";
import UserProfile from "./pages/UserProfile";
import SearchPage from "./pages/SearchPage";
import Notifications from "./pages/Notifications";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const App = () => (
  <AuthProvider>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Index />} />
            <Route path="/tips" element={<TipsList />} />
            <Route path="/tips/new" element={<TipNew />} />
            <Route path="/tips/:id" element={<TipDetail />} />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/users/:username" element={<UserProfile />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

export default App;
