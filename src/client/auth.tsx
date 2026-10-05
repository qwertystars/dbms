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
import { api, type ApiResult } from "~/client/api";
import { Loading } from "~/client/components/ui";

// "error": the browser is signed in to Cloudflare Access but the API could not
// confirm the account. Sending it back to /sign-in would loop, so pages show
// the reason instead.
type AuthStatus = "loading" | "authed" | "anon" | "error";

interface AuthState {
  me: any | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null,
  status: "loading",
  error: null,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<any | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await api("GET", "/api/v1/me");
      setMe(result.status === 200 ? result.body : null);
      if (result.status === 200) {
        setError(null);
        setStatus("authed");
      } else if (result.status === 401 && result.body?.error?.code === "UNAUTHENTICATED") {
        setError(null);
        setStatus("anon");
      } else {
        setError(describeError(result));
        setStatus("error");
      }
    } catch {
      setMe(null);
      setError("Something went wrong while checking your sign-in.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ me, status, error, refresh }}>{children}</AuthContext.Provider>
  );
}

function describeError(result: ApiResult): string {
  const error = result.body?.error;
  const message = error?.message || `The server answered ${result.status}.`;
  return error?.requestId ? `${message} (request ${error.requestId})` : message;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({ children }: { children: ReactElement }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Loading />;
  // The sign-in page explains an "error" status instead of offering a sign-in loop.
  if (status === "anon" || status === "error") {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?returnTo=${returnTo}`} replace />;
  }
  return children;
}
