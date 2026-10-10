import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { api } from "~/client/api";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Field } from "~/client/components/ui";

export function SignInPage() {
  const { status, refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requested = searchParams.get("returnTo") || "";
  const returnTo =
    requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\")
      ? requested
      : "/app";

  if (status === "authed") return <Navigate to={returnTo} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api("POST", `/api/auth/${register ? "register" : "login"}`, {
        username: form.get("username"),
        password: form.get("password"),
      });
      if (result.status === 200 || result.status === 201) {
        await refresh();
      } else {
        setError(
          typeof result.body.error === "string"
            ? result.body.error
            : result.body.error?.message || "Unable to sign in.",
        );
      }
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <div className="auth-card">
        <Brand />
        <div className="card card-body stack">
          <h1 style={{ fontSize: "1.5rem" }}>{register ? "Create account" : "Sign in"}</h1>
          <form onSubmit={submit} className="form">
            <Field label="Username">
              <input
                className="input"
                name="username"
                required
                minLength={3}
                maxLength={40}
                pattern={"[a-zA-Z0-9_\\-]+"}
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="Password">
              <input
                className="input"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
            {error && <p role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register ? "Already have an account? Sign in" : "Create an account"}
          </button>
        </div>
      </div>
    </main>
  );
}
