import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "~/client/api";
import { Loading } from "~/client/components/ui";
import { useSession } from "~/client/session";

type AuthStatus = "loading" | "authed" | "anon";

interface AuthState {
  me: any | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  status: "loading",
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [me, setMe] = useState<any | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refresh = useCallback(async () => {
    // With Clerk, wait until it knows whether someone is signed in.
    if (!session.loaded) {
      setStatus("loading");
      return;
    }
    if (session.mode === "clerk" && !session.signedIn) {
      setMe(null);
      setStatus("anon");
      return;
    }
    try {
      const result = await api("GET", "/api/v1/me");
      if (result.status === 200) {
        setMe(result.body);
        setStatus("authed");
      } else {
        setMe(null);
        setStatus("anon");
      }
    } catch {
      setMe(null);
      setStatus("anon");
    }
  }, [session.loaded, session.mode, session.signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ me, status, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({ children }: { children: ReactElement }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading />;
  if (status === "anon") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?returnTo=${returnTo}`} replace />;
  }
  return children;
}
