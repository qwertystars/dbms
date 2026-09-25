import { useEffect, useState, type SubmitEvent } from "react";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import {
  Alert,
  Avatar,
  Card,
  CopyField,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  timeAgo,
  useBusy,
} from "~/client/components/ui";

export function FriendsPage() {
  const { me, refresh } = useAuth();
  const [renaming, runRename] = useBusy();
  const [friends, setFriends] = useState<any[] | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, runSend] = useBusy();
  const [responding, setResponding] = useState<string | null>(null);

  async function load() {
    const [friendsRes, requestsRes] = await Promise.all([
      api("GET", "/api/v1/friends"),
      api("GET", "/api/v1/friends/requests"),
    ]);
    setFriends(friendsRes.status === 200 ? friendsRes.body.friends || [] : []);
    if (requestsRes.status === 200) setRequests(requestsRes.body.requests || []);
    if (friendsRes.status !== 200) setError(errorMessage(friendsRes, "Could not load friends."));
  }

  useEffect(() => {
    void load();
  }, []);

  async function rename(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const displayName = String(new FormData(e.currentTarget).get("displayName") ?? "").trim();
    const res = await runRename(() => api("PATCH", "/api/v1/me", { displayName }));
    if (!res) return;
    if (res.status !== 200) {
      setError(errorMessage(res, "Couldn't save your name."));
      return;
    }
    await refresh();
    setNotice("Your name was saved.");
  }

  async function sendRequest(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const accountId = ((new FormData(formEl).get("accountId") as string) || "").trim();
    if (!accountId) return;
    const res = await runSend(() => api("POST", "/api/v1/friends/requests", { accountId }));
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not send friend request.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    setNotice(
      res.body.accepted
        ? "They had already sent you a request, so you are now friends."
        : "Friend request sent.",
    );
    await load();
  }

  async function unfriend(friend: { id: string; displayName: string }) {
    if (!window.confirm(`Remove ${friend.displayName} from your friends?`)) return;
    setResponding(friend.id);
    try {
      const res = await api("DELETE", `/api/v1/friends/${friend.id}`);
      if (res.status !== 200) {
        setError(errorMessage(res, "Could not remove friend."));
        return;
      }
      setError(null);
      setNotice(`${friend.displayName} was removed from your friends.`);
      await load();
    } finally {
      setResponding(null);
    }
  }

  async function respond(requestId: string, action: "accept" | "reject" | "cancel") {
    setResponding(requestId);
    try {
      const res = await api("POST", `/api/v1/friends/requests/${requestId}/${action}`);
      if (res.status !== 200) {
        setError(errorMessage(res, `Could not ${action} request.`));
        return;
      }
      setError(null);
      await load();
    } finally {
      setResponding(null);
    }
  }

  if (friends === null) return <Loading />;

  const incoming = requests.filter((r) => r.receiverAccountId === me?.id);
  const outgoing = requests.filter((r) => r.senderAccountId === me?.id);

  return (
    <>
      <PageHeader
        title="Friends"
        description="Friends can connect with you across families. Friendship never grants access to a family."
      />

      <div className="stack">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {notice && (
          <Alert kind="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

        <div className="grid-2">
          <div className="stack">
            {incoming.length > 0 && (
              <Card title="Requests for you" description={`${incoming.length} pending`} flush>
                <ul className="list">
                  {incoming.map((r) => (
                    <li key={r.id} className="list-item">
                      <Avatar name={r.sender.displayName} size="sm" />
                      <div className="list-item-main">
                        <div className="list-item-title">{r.sender.displayName}</div>
                        <div className="list-item-meta">{timeAgo(r.createdAt)}</div>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={responding === r.id}
                          onClick={() => void respond(r.id, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={responding === r.id}
                          onClick={() => void respond(r.id, "reject")}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Your friends" description={`${friends.length} total`} flush>
              {friends.length === 0 ? (
                <EmptyState title="No friends yet">
                  Share your account ID with someone, or send them a request.
                </EmptyState>
              ) : (
                <ul className="list">
                  {friends.map(({ friend }) => (
                    <li key={friend.id} className="list-item">
                      <Avatar name={friend.displayName} size="sm" />
                      <div className="list-item-main">
                        <div className="list-item-title">{friend.displayName}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={responding === friend.id}
                        onClick={() => void unfriend(friend)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {outgoing.length > 0 && (
              <Card title="Sent requests" description="Waiting for a response" flush>
                <ul className="list">
                  {outgoing.map((r) => (
                    <li key={r.id} className="list-item">
                      <Avatar name={r.receiver.displayName} size="sm" />
                      <div className="list-item-main">
                        <div className="list-item-title">{r.receiver.displayName}</div>
                        <div className="list-item-meta">Sent {timeAgo(r.createdAt)}</div>
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={responding === r.id}
                        onClick={() => void respond(r.id, "cancel")}
                      >
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="stack">
            <Card title="Your name" description="How your family and friends see you.">
              <form onSubmit={rename} className="form">
                <Field label="Display name">
                  <input
                    className="input"
                    name="displayName"
                    required
                    maxLength={120}
                    defaultValue={me?.displayName ?? ""}
                    key={me?.displayName}
                  />
                </Field>
                <button type="submit" className="btn btn-sm" disabled={renaming}>
                  {renaming ? "Saving…" : "Save name"}
                </button>
              </form>
            </Card>
            <Card title="Your account ID" description="Share this so others can add you.">
              {me?.id ? <CopyField value={me.id} label="Your account ID" /> : null}
            </Card>
            <Card title="Add a friend">
              <form onSubmit={sendRequest} className="form">
                <Field label="Their account ID">
                  <input
                    className="input"
                    name="accountId"
                    required
                    placeholder="Paste an account ID"
                    autoComplete="off"
                  />
                </Field>
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? "Sending…" : "Send request"}
                </button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
