import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "~/client/api";
import { useAuth } from "~/client/auth";
import { Field } from "~/client/components/ui";
export function PasswordForm({ register, returnTo }: { register: boolean; returnTo: string }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const result = await api("POST", `/api/auth/password/${register ? "register" : "login"}`, {
      username: form.get("username"),
      password: form.get("password"),
      ...(register ? { displayName: form.get("displayName") } : {}),
    });
    setBusy(false);
    if (result.status !== 200 && result.status !== 201) {
      setError(result.body.error?.message ?? "Could not sign in. Check your details.");
      return;
    }
    await refresh();
    navigate(returnTo, { replace: true });
  }
  return (
    <form onSubmit={submit} className="form">
      <h2>{register ? "Create an account" : "Sign in with a password"}</h2>
      {error && <p role="alert">{error}</p>}
      {register && (
        <Field label="Display name">
          <input
            className="input"
            name="displayName"
            required
            maxLength={100}
            autoComplete="name"
          />
        </Field>
      )}
      <Field label="Username" hint="3–32 letters, numbers or underscores; start with a letter.">
        <input
          className="input"
          name="username"
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          autoCapitalize="none"
        />
      </Field>
      <Field label="Password" hint={register ? "At least 12 characters." : undefined}>
        <input
          className="input"
          type="password"
          name="password"
          required
          minLength={register ? 12 : 1}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
        />
      </Field>
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
      </button>
      <Link to={`${register ? "/sign-in" : "/sign-up"}?returnTo=${encodeURIComponent(returnTo)}`}>
        {register ? "Already have an account? Sign in" : "Create an account"}
      </Link>
    </form>
  );
}
