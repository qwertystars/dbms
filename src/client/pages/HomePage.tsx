import { Link } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Brand, ThemeToggle } from "~/client/components/AppLayout";
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

function ArtNode({
  x,
  y,
  tone,
  focus = false,
}: {
  x: number;
  y: number;
  tone: number;
  focus?: boolean;
}) {
  return (
    <g className={`art-node${focus ? " focus" : ""}`} transform={`translate(${x} ${y})`}>
      <rect width="132" height="56" rx="12" />
      <circle className={`tone-${tone}`} cx="28" cy="28" r="17" />
      <rect className="bar" x="54" y="19" width="56" height="7" rx="3.5" />
      <rect className="bar-sub" x="54" y="32" width="36" height="6" rx="3" />
    </g>
  );
}

function HeroArt() {
  return (
    <figure className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 440 312">
        <path className="art-edge partner" d="M152 48h52" />
        <path className="art-edge" d="M178 48v42c0 18-60 14-60 34v20" />
        <path className="art-edge" d="M178 90c0 18 82 14 82 34v20" />
        <path className="art-edge" d="M118 200v20c0 14 -40 10 -40 26" />
        <path className="art-edge" d="M118 200v20c0 14 40 10 40 26" />
        <ArtNode x={20} y={20} tone={1} />
        <ArtNode x={204} y={20} tone={2} />
        <ArtNode x={52} y={144} tone={3} focus />
        <ArtNode x={234} y={144} tone={4} />
        <g className="art-chip" transform="translate(324 210)">
          <rect width="38" height="24" rx="12" />
          <text x="19" y="16" textAnchor="middle">
            +3
          </text>
        </g>
        <ArtNode x={12} y={246} tone={2} />
        <ArtNode x={152} y={246} tone={1} />
      </svg>
      <figcaption className="hero-art-caption">
        <span>Expand one generation at a time</span>
        <span className="badge badge-editor">Family only</span>
      </figcaption>
    </figure>
  );
}

export function HomePage() {
  const { status } = useAuth();
  const signedIn = status === "authed";

  return (
    <div className="landing">
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
        <section className="hero">
          <div>
            <span className="eyebrow">Every branch has roots</span>
            <h1>
              A private home for your <em>family&rsquo;s story</em>.
            </h1>
            <p>
              Build your family tree, keep profiles for every relative, and share updates in a space
              that belongs only to the people you invite.
            </p>
            <div className="row">
              <Link to={signedIn ? "/app" : "/sign-in"} className="btn btn-primary btn-lg">
                {signedIn ? "Open the app" : "Get started"}
              </Link>
              {!signedIn && (
                <Link to="/sign-up" className="btn btn-lg">
                  Create an account
                </Link>
              )}
            </div>
          </div>
          <HeroArt />
        </section>
        <section className="features" aria-label="Features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-body feature">
              <span className="feature-icon">
                <Icon name={f.icon} size={22} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="container landing-foot">
        Banyan keeps family data private by default.
      </footer>
    </div>
  );
}
