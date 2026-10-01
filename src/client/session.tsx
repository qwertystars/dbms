import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSessionTokenGetter } from "~/client/api";
import { Loading } from "~/client/components/ui";

// Which sign-in the server wants (GET /api/auth/config): Clerk in production,
// or the development cookie sign-in locally.
export interface AuthConfig {
  provider: "oidc" | "clerk";
  devSignIn: boolean;
  clerkPublishableKey: string | null;
}

export interface Session {
  mode: "clerk" | "local";
  loaded: boolean;
  signedIn: boolean;
  signOut: () => Promise<void>;
}

const fallbackConfig: AuthConfig = {
  provider: "oidc",
  devSignIn: false,
  clerkPublishableKey: null,
};

// The development sign-in keeps its session in an httpOnly cookie that only the
// server can clear, so signing out is a form post.
function localSignOut() {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/api/auth/logout";
  document.body.appendChild(form);
  form.submit();
  return Promise.resolve();
}

const ConfigContext = createContext<AuthConfig>(fallbackConfig);
const SessionContext = createContext<Session>({
  mode: "local",
  loaded: true,
  signedIn: false,
  signOut: localSignOut,
});

export function useAuthConfig() {
  return useContext(ConfigContext);
}

export function useSession() {
  return useContext(SessionContext);
}

// Clerk's components pick these up, so its sign-in card matches both themes.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--bn-primary)",
    colorPrimaryForeground: "var(--bn-on-primary)",
    colorDanger: "var(--bn-pen)",
    colorSuccess: "var(--bn-success)",
    colorBackground: "var(--bn-surface)",
    colorForeground: "var(--bn-ink)",
    colorMutedForeground: "var(--bn-pencil)",
    colorInput: "var(--bn-surface)",
    colorInputForeground: "var(--bn-ink)",
    colorBorder: "var(--bn-rule-strong)",
    colorNeutral: "var(--bn-ink)",
    fontFamily: "var(--font-sans)",
    borderRadius: "10px",
  },
};

export function AuthConfigProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);

  useEffect(() => {
    void api("GET", "/api/auth/config").then((result) =>
      setConfig(result.status === 200 ? { ...fallbackConfig, ...result.body } : fallbackConfig),
    );
  }, []);

  if (!config) return <Loading />;

  // Local previews run the development sign-in even when Clerk is configured.
  const clerkKey = config.provider === "clerk" && !config.devSignIn && config.clerkPublishableKey;
  if (!clerkKey) {
    return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
  }
  return (
    <ConfigContext.Provider value={config}>
      <ClerkProvider
        publishableKey={clerkKey}
        routerPush={(to: string) => navigate(to)}
        routerReplace={(to: string) => navigate(to, { replace: true })}
        afterSignOutUrl="/sign-in"
        appearance={clerkAppearance}
      >
        <ClerkSession>{children}</ClerkSession>
      </ClerkProvider>
    </ConfigContext.Provider>
  );
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();

  // API calls send a fresh session token (Clerk refreshes it about every
  // minute); the __session cookie covers requests like <img src>.
  useEffect(() => {
    setSessionTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setSessionTokenGetter(null);
  }, [isSignedIn, getToken]);

  const session = useMemo<Session>(
    () => ({
      mode: "clerk",
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      signOut: () => signOut({ redirectUrl: "/sign-in" }),
    }),
    [isLoaded, isSignedIn, signOut],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
