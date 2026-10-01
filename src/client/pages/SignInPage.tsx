import { SignIn, SignUp } from "@clerk/react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Field } from "~/client/components/ui";
import { useAuthConfig, useSession } from "~/client/session";

// Only allow same-site paths, mirroring the server-side check.
function useReturnTo() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("returnTo") || "";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app";
}

export function SignInPage() {
  return <AuthPage mode="sign-in" />;
}

export function SignUpPage() {
  return <AuthPage mode="sign-up" />;
}

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { status } = useAuth();
  const config = useAuthConfig();
  const session = useSession();
  const returnTo = useReturnTo();

  if (status === "authed") return <Navigate to={returnTo} replace />;

  if (session.mode === "clerk") {
    const query = `?returnTo=${encodeURIComponent(returnTo)}`;
    return (
      <main className="center-screen">
        <div className="auth-card auth-card-clerk">
          <Brand />
          {mode === "sign-in" ? (
            <SignIn
              routing="hash"
              signUpUrl={`/sign-up${query}`}
              forceRedirectUrl={returnTo}
              signUpForceRedirectUrl={returnTo}
            />
          ) : (
            <SignUp
              routing="hash"
              signInUrl={`/sign-in${query}`}
              forceRedirectUrl={returnTo}
              signInForceRedirectUrl={returnTo}
            />
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="center-screen">
      <div className="auth-card">
        <Brand />
        <div className="card card-body stack">
          {config.devSignIn ? (
            <DevSignIn returnTo={returnTo} />
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
