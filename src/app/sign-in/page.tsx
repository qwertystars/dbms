export default function SignIn() {
  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Sign in</h1>
      <p>This is a development sign-in. In production this redirects to an OIDC/OAuth provider.</p>
      <form action="/api/auth/login" method="post">
        <label>
          Subject (unique identifier)
          <input name="subject" required placeholder="user-1" />
        </label>
        <label>
          Display name
          <input name="displayName" placeholder="User One" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
