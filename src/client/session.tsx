import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "~/client/api";
import { Loading } from "~/client/components/ui";
export interface AuthConfig {
  provider: "oidc" | "google";
  devSignIn: boolean;
  googleSignIn: boolean;
}
const fallback: AuthConfig = { provider: "oidc", devSignIn: false, googleSignIn: false };
const ConfigContext = createContext<AuthConfig>(fallback);
export function useAuthConfig() {
  return useContext(ConfigContext);
}
export function useSession() {
  return {
    signOut: async () => {
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/api/auth/logout";
      document.body.appendChild(form);
      form.submit();
    },
  };
}
export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    void api("GET", "/api/auth/config").then((result) =>
      setConfig(result.status === 200 ? result.body : fallback),
    );
  }, []);
  if (!config) return <Loading />;
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}
