import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";

export default async function InvitationPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) {
    const loginUrl = `/sign-in?returnTo=/invitations/${token}`;
    return redirect(loginUrl);
  }

  const { status, body } = await serverApi("POST", `/api/v1/invitations/${token}/accept`, {});
  if (status !== 200) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Invitation</h1>
        <p>Could not accept invitation: {body.error?.message || "Unknown error"}</p>
      </main>
    );
  }

  return redirect(`/app/families/${body.membership.familyId}`);
}
