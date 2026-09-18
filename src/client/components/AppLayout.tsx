import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "~/client/auth";
import { Avatar, Icon } from "~/client/components/ui";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <span className="brand-mark">
        <Icon name="tree" size={18} />
      </span>
      <span className="brand-name">Family Social</span>
    </Link>
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
          </nav>
          <div className="topbar-user">
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
