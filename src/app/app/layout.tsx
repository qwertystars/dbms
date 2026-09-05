import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header
        style={{ display: "flex", gap: "1rem", padding: "1rem", borderBottom: "1px solid #ccc" }}
      >
        <Link href="/app">Dashboard</Link>
        <Link href="/app/families">Families</Link>
        <Link href="/app/friends">Friends</Link>
        <form action="/api/auth/logout" method="post" style={{ marginLeft: "auto" }}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <main style={{ padding: "1rem" }}>{children}</main>
    </>
  );
}
