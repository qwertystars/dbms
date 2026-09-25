import { Link } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Brand } from "~/client/components/AppLayout";
import { Icon } from "~/client/components/ui";

const FEATURES = [
  {
    icon: "tree",
    title: "Family trees",
    text: "Map parents and children across generations, with profiles for everyone.",
  },
  {
    icon: "message",
    title: "A shared feed",
    text: "Post updates and memories that only your family members can see.",
  },
  {
    icon: "users",
    title: "Roles and invites",
    text: "Invite relatives as editors or viewers and stay in control of who can change what.",
  },
  {
    icon: "lock",
    title: "Private by default",
    text: "Family spaces are never public. Friendship never grants access to a family.",
  },
] as const;

export function HomePage() {
  const { status } = useAuth();
  const signedIn = status === "authed";
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-user">
            {signedIn ? (
              <Link to="/app" className="btn btn-primary btn-sm">
                Open the app
              </Link>
            ) : (
              <Link to="/sign-in" className="btn btn-sm">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <section className="hero">
          <span className="eyebrow">Every branch has roots.</span>
          <h1>A private home for your family&rsquo;s story.</h1>
          <p>
            Build your family tree, keep profiles for every relative, and share updates in a space
            that belongs only to the people you invite.
          </p>
          <div className="row">
            <Link to={signedIn ? "/app" : "/sign-in"} className="btn btn-primary btn-lg">
              {signedIn ? "Open the app" : "Get started"}
            </Link>
          </div>
        </section>
        <section className="features" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-body feature">
              <span className="feature-icon">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
