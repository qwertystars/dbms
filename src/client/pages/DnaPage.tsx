import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
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
  useBusy,
} from "~/client/components/ui";

const PROVIDERS: Record<string, string> = {
  ANCESTRY: "AncestryDNA",
  TWENTY_THREE_AND_ME: "23andMe",
  MYHERITAGE: "MyHeritage",
  FTDNA: "FamilyTreeDNA",
  GEDMATCH: "GEDmatch",
  OTHER: "Other",
};

/**
 * DNA matches (beta). People record the summary their testing company shows
 * for a relative (shared cM), and the relative confirms. No raw DNA is stored.
 */
export function DnaPage() {
  const { me } = useAuth();
  const [matches, setMatches] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, runSave] = useBusy();

  async function load() {
    const res = await api("GET", "/api/v1/dna/matches");
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not load your DNA matches."));
      setMatches([]);
      return;
    }
    setMatches(res.body.matches);
  }

  useEffect(() => {
    void load();
  }, []);

  async function report(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const res = await runSave(() =>
      api("POST", "/api/v1/dna/matches", {
        accountId: String(form.get("accountId")).trim(),
        provider: form.get("provider"),
        sharedCm: Number(form.get("sharedCm")),
        sharedSegments: form.get("sharedSegments") ? Number(form.get("sharedSegments")) : null,
        note: (form.get("note") as string) || null,
      }),
    );
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not record this match.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    setNotice(
      `Sent to ${res.body.match.otherAccount.displayName}. It shows as confirmed once they agree.`,
    );
    await load();
  }

  async function act(method: "POST" | "DELETE", path: string, message: string, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    const res = await api(method, path);
    if (res.status !== 200) {
      setError(errorMessage(res, "Something went wrong."));
      return;
    }
    setError(null);
    setNotice(message);
    await load();
  }

  if (!matches) return <Loading />;
  const incoming = matches.filter((m) => m.status === "PENDING" && m.direction === "INCOMING");
  const outgoing = matches.filter((m) => m.status === "PENDING" && m.direction === "OUTGOING");
  const confirmed = matches.filter((m) => m.status === "CONFIRMED");

  const matchRow = (m: any, actions: ReactNode) => (
    <li key={m.id} className="list-item">
      <Avatar name={m.otherAccount.displayName} size="sm" />
      <div className="list-item-main">
        <div className="list-item-title">{m.otherAccount.displayName}</div>
        <div className="list-item-meta">
          {m.sharedCm.toLocaleString()} cM
          {m.sharedSegments ? ` across ${m.sharedSegments} segments` : ""} ·{" "}
          {PROVIDERS[m.provider] ?? m.provider}
        </div>
        <div className="list-item-meta">
          Likely: {m.estimate.likely.join(", ")}
          {m.estimate.confidence === "low" && " (rough estimate)"}
        </div>
        {m.note && <div className="list-item-meta">“{m.note}”</div>}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        {actions}
      </div>
    </li>
  );

  return (
    <>
      <PageHeader
        eyebrow="Beta"
        title="DNA matches"
        description="Connect with relatives you've matched with on a DNA testing service, and find out how you might be related."
      />
      <div className="grid-2">
        <div className="stack">
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          {notice && (
            <Alert kind="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          {incoming.length > 0 && (
            <Card
              title="Waiting for you"
              description="Confirm only if you recognise this match."
              flush
            >
              <ul className="list">
                {incoming.map((m) =>
                  matchRow(
                    m,
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() =>
                          void act(
                            "POST",
                            `/api/v1/dna/matches/${m.id}/confirm`,
                            "Match confirmed.",
                          )
                        }
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() =>
                          void act("DELETE", `/api/v1/dna/matches/${m.id}`, "Match declined.")
                        }
                      >
                        Decline
                      </button>
                    </>,
                  ),
                )}
              </ul>
            </Card>
          )}

          <Card title="Confirmed matches" flush>
            {confirmed.length === 0 ? (
              <EmptyState title="No confirmed matches yet">
                Record a match with a relative and they'll be asked to confirm it.
              </EmptyState>
            ) : (
              <ul className="list">
                {confirmed.map((m) =>
                  matchRow(
                    m,
                    <button
                      type="button"
                      className="post-action post-action-danger"
                      onClick={() =>
                        void act(
                          "DELETE",
                          `/api/v1/dna/matches/${m.id}`,
                          "Match removed.",
                          `Remove your DNA match with ${m.otherAccount.displayName}? This deletes it for both of you.`,
                        )
                      }
                    >
                      Remove
                    </button>,
                  ),
                )}
              </ul>
            )}
          </Card>

          {outgoing.length > 0 && (
            <Card title="Sent" description="Waiting for the other person to confirm." flush>
              <ul className="list">
                {outgoing.map((m) =>
                  matchRow(
                    m,
                    <button
                      type="button"
                      className="post-action"
                      onClick={() =>
                        void act("DELETE", `/api/v1/dna/matches/${m.id}`, "Request cancelled.")
                      }
                    >
                      Cancel
                    </button>,
                  ),
                )}
              </ul>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Record a match">
            <form className="form" onSubmit={report}>
              <Field label="Their account ID" hint="They can find it on this page.">
                <input className="input" name="accountId" required maxLength={64} />
              </Field>
              <div className="form-grid">
                <Field label="Testing service">
                  <select className="select" name="provider" defaultValue="ANCESTRY">
                    {Object.entries(PROVIDERS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Shared DNA (cM)">
                  <input
                    className="input"
                    name="sharedCm"
                    type="number"
                    min="0"
                    max="7500"
                    step="0.1"
                    required
                  />
                </Field>
                <Field label="Shared segments" optional>
                  <input className="input" name="sharedSegments" type="number" min="0" max="1000" />
                </Field>
              </div>
              <Field label="Note" optional>
                <input
                  className="input"
                  name="note"
                  maxLength={500}
                  placeholder="e.g. Matched through Paati's side"
                />
              </Field>
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Sending…" : "Send for confirmation"}
                </button>
              </div>
            </form>
          </Card>

          <Card title="Your account ID">
            <div className="stack-sm">
              {me && <CopyField value={me.id} label="Your account ID" />}
              <p className="subtle">Share it with a relative so they can record your match.</p>
            </div>
          </Card>

          <Card title="How your DNA data is handled">
            <ul className="prose-list">
              <li>Banyan never asks for or stores your raw DNA file, only the match summary.</li>
              <li>A match only counts once both of you confirm it.</li>
              <li>Only the two of you can see it. It never gives anyone access to a family.</li>
              <li>Either of you can remove it at any time, and that deletes it completely.</li>
              <li>Relationship estimates come from typical shared-cM ranges and can overlap.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
