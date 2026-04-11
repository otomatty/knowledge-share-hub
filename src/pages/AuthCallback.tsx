import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        navigate("/", { replace: true });
      }
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
      認証中…
    </div>
  );
}
