import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { Avatar, Card, lifeSpan, useBusy } from "~/client/components/ui";
import type { PersonSummary } from "~/client/family-data";

interface ClaimRequest {
  id: string;
  personId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  person: { id: string; name: string; profileMediaId: string | null };
  requester: { id: string; displayName: string };
}

const DISMISS_KEY = (familyId: string) => `bn-claim-dismissed:${familyId}`;

export function ClaimPanel({
  familyId,
  role,
  myPersonId,
  people,
  linkedPersonIds,
  onChanged,
  onError,
}: {
  familyId: string;
  role: string;
  myPersonId: string | null;
  people: PersonSummary[];
  linkedPersonIds: Set<string>;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const { me: account } = useAuth();
  const [requests, setRequests] = useState<ClaimRequest[] | null>(null);
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<PersonSummary | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY(familyId)) === "1";
    } catch {
      return false;
    }
  });
  const [busy, run] = useBusy();

  async function load() {
    const res = await api("GET", `/api/v1/families/${familyId}/claim-requests`);
    if (res.status !== 200) {
      onError(errorMessage(res, "Could not load identity requests."));
      return;
    }
    setRequests(res.body.requests || []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, myPersonId]);

  if (requests === null) return null;

  const isCreator = role === "CREATOR";
  const mine = requests.filter((r) => r.requester.id === account?.id);
  const myPending = mine.find((r) => r.status === "PENDING");
  const queue = isCreator ? requests.filter((r) => r.status === "PENDING") : [];
  const me = myPersonId ? people.find((p) => p.id === myPersonId) : undefined;
  const lastDecision = mine.find((r) => r.status === "REJECTED");

  async function request(person: PersonSummary) {
    const res = await run(() =>
      api("POST", `/api/v1/families/${familyId}/people/${person.id}/claim-requests`),
    );
    if (!res || res.status !== 201) {
      onError(res ? errorMessage(res, "Could not send your request.") : null);
      return;
    }
    onError(null);
    setCandidate(null);
    setQuery("");
    await load();
    if (isCreator) onChanged();
  }

  async function cancel(id: string) {
    const res = await run(() => api("DELETE", `/api/v1/families/${familyId}/claim-requests/${id}`));
    if (!res || res.status !== 200) {
      onError(res ? errorMessage(res, "Could not cancel the request.") : null);
      return;
    }
    await load();
  }

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const res = await run(() =>
      api("POST", `/api/v1/families/${familyId}/claim-requests/${id}/decision`, { decision }),
    );
    if (!res || res.status !== 200) {
      onError(res ? errorMessage(res, "Could not record the decision.") : null);
      return;
    }
    onError(null);
    await load();
    onChanged();
  }

  async function unlink() {
    if (!window.confirm("Unlink your account from this person? Their profile stays as it is.")) {
      return;
    }
    const res = await run(() => api("DELETE", `/api/v1/families/${familyId}/me/person-link`));
    if (!res || res.status !== 200) {
      onError(res ? errorMessage(res, "Could not unlink.") : null);
      return;
    }
    onChanged();
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY(familyId), "1");
    } catch {
      // Without storage the choice lasts for this page view only.
    }
    setDismissed(true);
  }

  const needle = query.trim().toLocaleLowerCase();
  const matches = people
    .filter((p) => !linkedPersonIds.has(p.id))
    .filter((p) => !needle || p.name.toLocaleLowerCase().includes(needle))
    .slice(0, 6);

  const identityCard = me ? (
    <Card title="You in this family">
      <div className="claim-me">
        <Avatar name={me.name} mediaId={me.profileMediaId} deceased={Boolean(me.dateOfDeath)} />
        <div className="list-item-main">
          <Link to={`/app/families/${familyId}/people/${me.id}`} className="list-item-title">
            {me.name}
          </Link>
          <div className="list-item-meta">Linked to your account and verified</div>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void unlink()}>
          Unlink
        </button>
      </div>
    </Card>
  ) : myPending ? (
    <Card title="Waiting for verification">
      <div className="claim-me">
        <Avatar name={myPending.person.name} mediaId={myPending.person.profileMediaId} />
        <div className="list-item-main">
          <div className="list-item-title">{myPending.person.name}</div>
          <div className="list-item-meta">
            <span className="badge">Pending verification</span> The family Creator will confirm.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => void cancel(myPending.id)}
        >
          Cancel
        </button>
      </div>
    </Card>
  ) : dismissed ? null : (
    <Card
      title="Which person are you?"
      description="Link your account to your profile so relatives know it's really you."
    >
      {candidate ? (
        <div className="stack-sm">
          <div className="claim-me">
            <Avatar
              name={candidate.name}
              size="lg"
              mediaId={candidate.profileMediaId}
              deceased={Boolean(candidate.dateOfDeath)}
            />
            <div className="list-item-main">
              <div className="list-item-title">{candidate.name}</div>
              <div className="list-item-meta">
                {[lifeSpan(candidate), candidate.occupation].filter(Boolean).join(" · ") ||
                  "No details recorded"}
              </div>
            </div>
          </div>
          <p className="subtle">
            {isCreator
              ? "Your request will appear in Identity requests below for you to verify."
              : "The family Creator will review this before it takes effect."}
          </p>
          <div className="row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void request(candidate)}
            >
              This is me
            </button>
            <button type="button" className="btn" onClick={() => setCandidate(null)}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="stack-sm">
          {lastDecision && (
            <p className="subtle">
              Your request for {lastDecision.person.name} was not approved. You can pick again.
            </p>
          )}
          <input
            className="input"
            type="search"
            placeholder="Search your name…"
            aria-label="Search for yourself"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length === 0 ? (
            <p className="subtle">No unlinked profiles match.</p>
          ) : (
            <ul className="list claim-results">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="list-item" onClick={() => setCandidate(p)}>
                    <Avatar name={p.name} size="sm" mediaId={p.profileMediaId} />
                    <span className="list-item-main">
                      <span className="list-item-title">{p.name}</span>
                      <span className="list-item-meta">{lifeSpan(p)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
              I'm not in the tree
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={dismiss}>
              I'll do this later
            </button>
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <>
      {identityCard}
      {isCreator && queue.length > 0 && (
        <Card
          title="Identity requests"
          description="Members asking to be linked to a profile."
          flush
        >
          <ul className="list">
            {queue.map((r) => (
              <li key={r.id} className="list-item">
                <Avatar name={r.person.name} mediaId={r.person.profileMediaId} />
                <div className="list-item-main">
                  <div className="list-item-title">
                    {r.requester.displayName} → {r.person.name}
                  </div>
                  <div className="list-item-meta">
                    Asked {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="row claim-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => void decide(r.id, "APPROVED")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={busy}
                    onClick={() => void decide(r.id, "REJECTED")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
