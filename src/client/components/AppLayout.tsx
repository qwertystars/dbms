import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Avatar, Icon } from "~/client/components/ui";
import { useTheme } from "~/client/theme";

// The kinship glyph from public/brand/banyan-mark.svg, drawn with theme tokens so the
// same markup is the ink mark on Notebook and the chalk mark on Slate.
export function BanyanMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="14.5" cy="19" r="8.5" stroke="var(--bn-ink)" strokeWidth="4" />
      <circle cx="49.5" cy="19" r="9.5" fill="var(--bn-ink)" />
      <path d="M23 19H40M32 19V41" stroke="var(--bn-ink)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="49" r="7.5" fill="var(--bn-pen)" />
    </svg>
  );
}

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="Banyan home">
      <BanyanMark />
      <span className="brand-name">banyan</span>
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "slate" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <Icon name={theme === "slate" ? "sun" : "moon"} size={20} />
    </button>
  );
}

export function AppLayout() {
  const { me } = useAuth();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand to="/app" />
          <nav className="mainnav" aria-label="Main">
            <NavLink to="/app" end>
              Home
            </NavLink>
            <NavLink to="/app/families">Families</NavLink>
            <NavLink to="/app/friends">Friends</NavLink>
            <NavLink to="/app/dna">DNA</NavLink>
          </nav>
          <div className="topbar-user">
            <ThemeToggle />
            <Avatar name={me?.displayName} size="sm" />
            <span className="topbar-user-name">{me?.displayName}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container page">
        <Outlet />
      </main>
    </>
  );
}
