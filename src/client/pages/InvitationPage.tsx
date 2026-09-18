import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Loading } from "~/client/components/ui";

export function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authed" || !token) return;
    let cancelled = false;
    api("POST", `/api/v1/invitations/${token}/accept`, {}).then((res) => {
      if (cancelled) return;
      if (res.status === 200) {
        navigate(`/app/families/${res.body.membership.familyId}`, { replace: true });
      } else {
        setError(errorMessage(res, "Could not accept invitation."));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, token, navigate]);

  if (status === "loading") return <Loading />;
  if (status === "anon") {
    return (
      <Navigate to={`/sign-in?returnTo=${encodeURIComponent(`/invitations/${token}`)}`} replace />
    );
  }

  return (
    <main className="center-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="row" style={{ justifyContent: "center" }}>
          <Brand />
        </div>
        {error ? (
          <div className="card card-body stack-sm">
            <h1 style={{ fontSize: "1.4rem" }}>Invitation could not be accepted</h1>
            <p className="muted">{error}</p>
            <p className="subtle">The link may have expired or already been used.</p>
            <div>
              <Link to="/app" className="btn btn-primary">
                Go to your home
              </Link>
            </div>
          </div>
        ) : (
          <Loading label="Joining the family…" />
        )}
      </div>
    </main>
  );
}
