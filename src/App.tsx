import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import TipNew from "./pages/TipNew";
import TipsList from "./pages/TipsList";
import ArticleNew from "./pages/ArticleNew";
import ArticleDetail from "./pages/ArticleDetail";
import ArticleEdit from "./pages/ArticleEdit";
import MemoNew from "./pages/MemoNew";
import MemoDetail from "./pages/MemoDetail";
import BookNew from "./pages/BookNew";
import BookDetail from "./pages/BookDetail";
import ProfileSettings from "./pages/ProfileSettings";
import UserProfile from "./pages/UserProfile";
import SearchPage from "./pages/SearchPage";
import Notifications from "./pages/Notifications";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const App = () => (
  <TooltipProvider>
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/tips" element={<TipsList />} />
        <Route path="/tips/new" element={<TipNew />} />
        <Route path="/articles/new" element={<ArticleNew />} />
        <Route path="/articles/:id" element={<ArticleDetail />} />
        <Route path="/articles/:id/edit" element={<ArticleEdit />} />
        <Route path="/memos/new" element={<MemoNew />} />
        <Route path="/memos/:id" element={<MemoDetail />} />
        <Route path="/books/new" element={<BookNew />} />
        <Route path="/books/:id" element={<BookDetail />} />
        <Route path="/settings/profile" element={<ProfileSettings />} />
        <Route path="/users/:username" element={<UserProfile />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
