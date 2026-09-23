import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Field } from "~/client/components/ui";

export function SignInPage() {
  const { status } = useAuth();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("returnTo") || "";
  // Only allow same-site paths, mirroring the server-side check.
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app";

  if (status === "authed") return <Navigate to={returnTo} replace />;

  return (
    <main className="center-screen">
      <div className="auth-card">
        <Brand />
        <div className="card card-body stack">
          <div>
            <h1 style={{ fontSize: "1.5rem" }}>Sign in</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Welcome back. Sign in to see your families.
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
        </div>
        <p className="subtle" style={{ marginTop: 16, textAlign: "center" }}>
          Development sign-in. In production this redirects to an OIDC provider.
        </p>
      </div>
    </main>
  );
}
