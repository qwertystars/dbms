import { redirect } from "next/navigation";
import { serverApi } from "~/lib/server-api";
import { requestFriend, respondToRequest } from "./actions";

export default async function Friends() {
  const me = await serverApi("GET", "/api/v1/me");
  if (me.status !== 200) return redirect("/sign-in");

  const friends = await serverApi("GET", "/api/v1/friends");
  const requests = await serverApi("GET", "/api/v1/friends/requests");

  return (
    <div>
      <h1>Friends</h1>

      <h2>Friend requests</h2>
      <ul>
        {requests.body.requests?.map((r: any) => (
          <li key={r.id}>
            {r.senderAccountId} → {r.receiverAccountId} ({r.status})
            {r.receiverAccountId === me.body.id && r.status === "PENDING" && (
              <form action={respondToRequest}>
                <input type="hidden" name="requestId" value={r.id} />
                <button name="action" value="accept">
                  Accept
                </button>
                <button name="action" value="reject">
                  Reject
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <h2>Send friend request</h2>
      <form action={requestFriend}>
        <input name="accountId" placeholder="Account ID" required />
        <button type="submit">Send request</button>
      </form>

      <h2>Friends</h2>
      <ul>
        {friends.body.friends?.map((f: any) => (
          <li key={`${f.accountLowId}-${f.accountHighId}`}>
            {f.accountLowId === me.body.id ? f.accountHighId : f.accountLowId}
          </li>
        ))}
      </ul>
    </div>
  );
}
