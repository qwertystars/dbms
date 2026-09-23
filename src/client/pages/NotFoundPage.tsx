import { Link } from "react-router-dom";
import { Brand } from "~/client/components/AppLayout";

export function NotFoundPage() {
  return (
    <main className="center-screen">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="row" style={{ justifyContent: "center" }}>
          <Brand />
        </div>
        <h1>Page not found</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          The page you are looking for does not exist or has moved.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
          <Link to="/app" className="btn btn-primary">
            Go to your home
          </Link>
        </div>
      </div>
    </main>
  );
}
