import { useEffect, useState, type FormEvent } from "react";
import { api } from "~/client/api";
import { Field, Loading } from "~/client/components/ui";
export function AccountPage() {
  const [credentials, setCredentials] = useState<{
    username: string | null;
    hasPassword: boolean;
  } | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api("GET", "/api/v1/me/credentials").then((r) => {
      if (r.status === 200) setCredentials(r.body);
      else setError("Could not load account settings.");
    });
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    setMessage("");
    setError("");
    if (data.get("password") !== data.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const result = await api("PUT", "/api/v1/me/credentials", {
      username: data.get("username"),
      password: data.get("password"),
      ...(credentials?.hasPassword ? { currentPassword: data.get("currentPassword") } : {}),
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(result.body.error?.message ?? "Could not save credentials.");
      return;
    }
    setCredentials(result.body);
    formElement.reset();
    setMessage("Credentials saved. Other sessions have been signed out.");
  }
  if (!credentials && !error) return <Loading />;
  return (
    <div className="card card-body stack">
      <h1>Account settings</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {credentials && (
        <form onSubmit={submit} className="form">
          {!credentials.hasPassword && (
            <a className="btn btn-ghost" href="/api/auth/google?returnTo=%2Fapp%2Faccount">
              Sign in with Google again
            </a>
          )}
          <p>
            {credentials.hasPassword
              ? "Change your username or password. Your current password is required."
              : "Add a username and password to your Google account. Sign in with Google again if your session is over ten minutes old."}
          </p>
          <Field label="Username">
            <input
              className="input"
              name="username"
              defaultValue={credentials.username ?? ""}
              required
              minLength={3}
              maxLength={32}
              autoComplete="username"
              autoCapitalize="none"
            />
          </Field>
          {credentials.hasPassword && (
            <Field label="Current password">
              <input
                className="input"
                type="password"
                name="currentPassword"
                required
                maxLength={128}
                autoComplete="current-password"
              />
            </Field>
          )}
          <Field label="New password" hint="At least 12 characters.">
            <input
              className="input"
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              name="confirm"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save credentials"}
          </button>
        </form>
      )}
    </div>
  );
}
