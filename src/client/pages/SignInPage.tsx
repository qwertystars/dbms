import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "~/client/api";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Field, Loading } from "~/client/components/ui";

interface AuthConfig {
  provider: "oidc" | "cloudflare-access";
  devSignIn: boolean;
}

export function SignInPage() {
  const { status, error, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const requested = searchParams.get("returnTo") || "";
  // Only allow same-site paths, mirroring the server-side check.
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app";

  useEffect(() => {
    void api("GET", "/api/auth/config").then((result) =>
      setConfig(result.status === 200 ? result.body : { provider: "oidc", devSignIn: false }),
    );
  }, []);

  if (status === "authed") return <Navigate to={returnTo} replace />;

  return (
    <main className="center-screen">
      <div className="auth-card">
        <Brand />
        <div className="card card-body stack">
          {!config ? (
            <Loading />
          ) : config.devSignIn ? (
            <DevSignIn returnTo={returnTo} />
          ) : status === "error" ? (
            <SignInProblem message={error} onRetry={refresh} />
          ) : config.provider === "cloudflare-access" ? (
            <AccessSignIn returnTo={returnTo} />
          ) : (
            <div>
              <h1 style={{ fontSize: "1.5rem" }}>Sign-in isn&rsquo;t set up</h1>
              <p className="muted" style={{ marginTop: 6 }}>
                This site has no sign-in provider configured yet. Ask the person who runs it to
                finish the setup.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// Cloudflare Access signs people in before the app loads, so reaching this page
// means the session ended or the app could not confirm it. Loading the app again
// sends the browser back through Access.
function AccessSignIn({ returnTo }: { returnTo: string }) {
  return (
    <>
      <div>
        <h1 style={{ fontSize: "1.5rem" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          We&rsquo;ll email you a one-time code. No password needed.
        </p>
      </div>
      <a className="btn btn-primary btn-block" href={returnTo}>
        Continue with email
      </a>
      <form action="/api/auth/logout" method="post">
        <p className="subtle">
          Still stuck here after signing in?{" "}
          <button type="submit" className="btn btn-ghost btn-sm">
            Sign out and try again
          </button>
        </p>
      </form>
    </>
  );
}

// Cloudflare Access let the browser through, but the API could not confirm the
// account. Retrying through Access would land here again, so say what went wrong.
function SignInProblem({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <>
      <div>
        <h1 style={{ fontSize: "1.5rem" }}>We couldn&rsquo;t sign you in</h1>
        <p className="muted" style={{ marginTop: 6 }} role="alert">
          {message || "The server could not confirm your account."}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          void onRetry().finally(() => setRetrying(false));
        }}
      >
        {retrying ? "Trying again…" : "Try again"}
      </button>
      <form action="/api/auth/logout" method="post">
        <p className="subtle">
          Still not working?{" "}
          <button type="submit" className="btn btn-ghost btn-sm">
            Sign out and start over
          </button>
        </p>
      </form>
    </>
  );
}

function DevSignIn({ returnTo }: { returnTo: string }) {
  return (
    <>
      <div>
        <h1 style={{ fontSize: "1.5rem" }}>Sign in</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Development sign-in. Any user ID works.
        </p>
      </div>
      <form action="/api/auth/login" method="post" className="form">
        <input type="hidden" name="returnTo" value={returnTo} />
        <Field label="User ID" hint="A unique identifier, for example user-1.">
          <input
            className="input"
            name="subject"
            required
            placeholder="user-1"
            autoComplete="username"
            autoFocus
          />
        </Field>
        <Field label="Display name" optional>
          <input className="input" name="displayName" placeholder="Jane Doe" />
        </Field>
        <button type="submit" className="btn btn-primary btn-block">
          Sign in
        </button>
      </form>
    </>
  );
}
