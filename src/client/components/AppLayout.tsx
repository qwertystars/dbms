import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Avatar, Icon } from "~/client/components/ui";
import { useSession } from "~/client/session";
import { useTheme } from "~/client/theme";

// The kinship glyph from public/brand/banyan-mark.svg, drawn with theme tokens so the
// same markup works on the light and dark themes.
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

const NAV_ITEMS = [
  { to: "/app", label: "Home", icon: "home", end: true },
  { to: "/app/families", label: "Families", icon: "tree", end: false },
  { to: "/app/friends", label: "Friends", icon: "users", end: false },
  { to: "/app/account", label: "Account", icon: "user", end: false },
] as const;

function NavLinks() {
  return NAV_ITEMS.map((item) => (
    <NavLink key={item.to} to={item.to} end={item.end}>
      <Icon name={item.icon} size={20} />
      <span>{item.label}</span>
    </NavLink>
  ));
}

export function AppLayout() {
  const { me } = useAuth();
  const { signOut } = useSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand to="/app" />
        <nav className="sidenav" aria-label="Main">
          <span className="sidenav-label">Menu</span>
          <NavLinks />
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <Avatar name={me?.displayName} size="sm" />
            <span className="sidebar-user-name">{me?.displayName}</span>
          </div>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <header className="mobilebar">
        <Brand to="/app" />
        <ThemeToggle />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <div className="shell-main">
        <main className="container page">
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main">
        <NavLinks />
      </nav>
    </div>
  );
}
