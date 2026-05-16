import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["knowledge_share_hub"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the user id the rest of the app currently sees. fetchProfile
  // captures the userId it was launched for and bails out if a different
  // user (or sign-out) has happened in the meantime — so a slow response
  // can't paint a stale user's profile onto a newer session. Keyed by user
  // (not call order) so two concurrent fetches for the *same* user can both
  // write through and let the last successful one win.
  const activeUserIdRef = useRef<string | null>(null);
  // Bumped on every onAuthStateChange tick. getSession captures the value
  // before its promise resolves and discards itself if a newer auth event
  // has already updated state — otherwise a slow getSession could roll
  // user/session back to an older value.
  const authChangeGenerationRef = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (activeUserIdRef.current !== userId) return;
    setProfile(data ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    const getSessionGen = authChangeGenerationRef.current;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (getSessionGen !== authChangeGenerationRef.current) return;
      setSession(s);
      setUser(s?.user ?? null);
      activeUserIdRef.current = s?.user?.id ?? null;
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      authChangeGenerationRef.current++;
      setSession(s);
      setUser(s?.user ?? null);
      activeUserIdRef.current = s?.user?.id ?? null;
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signInWithMagicLink,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
