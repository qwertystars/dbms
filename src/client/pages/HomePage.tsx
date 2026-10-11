import { Link } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Brand, ThemeToggle } from "~/client/components/AppLayout";
import { Avatar, Icon } from "~/client/components/ui";

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
            <ThemeToggle />
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
        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-kicker">
              <span /> Your people. Your place.
            </span>
            <h1>
              Every branch
              <br />
              has <em>roots.</em>
            </h1>
            <p>
              A place for the people who made you, and the stories that connect you. Grow your
              family tree. Keep your memories close.
            </p>
            <div className="row">
              <Link to={signedIn ? "/app" : "/sign-in"} className="btn btn-primary btn-lg">
                {signedIn ? "Open the app" : "Start your family story"}{" "}
                <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="landing-trust">
              <Icon name="lock" size={15} /> Private by default. Only the people you invite.
            </div>
          </div>
          <div className="landing-register" aria-label="Illustration of a sample family tree">
            <div className="register-heading">
              <Icon name="tree" />
              <span>The family register</span>
              <span className="subtle">Est. together</span>
            </div>
            <div className="register-canvas">
              <span className="register-note">
                a little history,
                <br />a lot of belonging.
              </span>
              <svg viewBox="0 0 500 380" className="register-lines" aria-hidden="true">
                <path d="M250 100 V155 M105 210 V155 H395 V210 M250 155 V210" />
                <path d="M250 260 V310" />
              </svg>
              <div className="sample-person sample-root">
                <Avatar name="Asha Rao" />
                <strong>Asha Rao</strong>
                <span>1942 – 2021</span>
              </div>
              <div className="sample-person sample-left">
                <Avatar name="Maya Rao" />
                <strong>Maya Rao</strong>
                <span>b. 1968</span>
              </div>
              <div className="sample-person sample-center">
                <Avatar name="Arun Rao" />
                <strong>Arun Rao</strong>
                <span>b. 1972</span>
              </div>
              <div className="sample-person sample-right">
                <Avatar name="Leela Rao" />
                <strong>Leela Rao</strong>
                <span>b. 1976</span>
              </div>
              <div className="register-you">
                <span /> Your story continues here
              </div>
            </div>
            <div className="register-caption">
              <span>Three generations. One shared story.</span>
              <Icon name="lock" size={14} />
            </div>
          </div>
        </section>
        <div className="landing-section-title">
          <span className="eyebrow">Made for belonging</span>
          <h2>A little closer, even from afar.</h2>
        </div>
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
        <footer className="landing-footer">
          <Brand />
          <span>Every branch has roots.</span>
          <Link to={signedIn ? "/app" : "/sign-in"}>Make yourself at home ↗</Link>
        </footer>
      </main>
    </>
  );
}
