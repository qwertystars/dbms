import { useEffect, useState, type SubmitEvent } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { AudienceBadge, HELP_CATEGORIES } from "~/client/components/kinship";
import {
  Alert,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  capitalize,
  timeAgo,
  useBusy,
} from "~/client/components/ui";

type Filter = "OPEN" | "ALL";

/** Family help board: ask for help, offer help, and reply to each other. */
export function HelpPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { me } = useAuth();
  const [family, setFamily] = useState<any | null>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [posting, runPost] = useBusy();

  async function load(which: Filter = filter) {
    const res = await api(
      "GET",
      `/api/v1/families/${familyId}/help${which === "OPEN" ? "?status=OPEN" : ""}`,
    );
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not load the help board."));
      return;
    }
    setItems(res.body.items);
  }

  useEffect(() => {
    setFamily(null);
    setItems(null);
    setError(null);
    (async () => {
      const res = await api("GET", `/api/v1/families/${familyId}`);
      if (res.status !== 200) {
        setError(errorMessage(res, "Family not found."));
        return;
      }
      setFamily(res.body);
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function create(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const res = await runPost(() =>
      api("POST", `/api/v1/families/${familyId}/help`, {
        kind: form.get("kind"),
        category: form.get("category"),
        title: form.get("title"),
        body: (form.get("body") as string) || null,
        audience: form.get("audience"),
      }),
    );
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not post this.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    setNotice(
      res.body.item.kind === "REQUEST"
        ? "Your request is on the board. Family members can reply to it."
        : "Thanks! Your offer is on the board.",
    );
    await load();
  }

  async function act(fn: () => Promise<{ status: number; body: any }>, failure: string) {
    const res = await fn();
    if (res.status >= 300) {
      setError(errorMessage(res, failure));
      return;
    }
    setError(null);
    await load();
  }

  if (error && !family) return <ErrorState title="Could not open this family" message={error} />;
  if (!family || !items) return <Loading />;

  const linked = Boolean(family.membership.personId);
  const isCreator = family.membership.role === "CREATOR";

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={family.family}
        role={family.membership.role}
        title="Help board"
        description="Ask the family for a hand, or offer one: advice, a job lead, a place to stay, a lift."
      />

      <div className="grid-2">
        <div className="stack">
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          {notice && (
            <Alert kind="success" onClose={() => setNotice(null)}>
              {notice}
            </Alert>
          )}

          <div className="row" role="group" aria-label="Show">
            {(["OPEN", "ALL"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`btn btn-sm ${filter === f ? "btn-primary" : ""}`}
                aria-pressed={filter === f}
                onClick={() => {
                  setFilter(f);
                  void load(f);
                }}
              >
                {f === "OPEN" ? "Open" : "Everything"}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="card">
              <EmptyState title={filter === "OPEN" ? "Nothing open right now" : "Nothing yet"}>
                Post the first request or offer using the form.
              </EmptyState>
            </div>
          ) : (
            items.map((item) => (
              <HelpItem
                key={item.id}
                item={item}
                mine={item.author.id === me?.id}
                canModerate={isCreator}
                onUpdate={(patch) =>
                  act(
                    () => api("PATCH", `/api/v1/families/${familyId}/help/${item.id}`, patch),
                    "Could not update this.",
                  )
                }
                onDelete={() => {
                  if (!window.confirm("Delete this from the help board?")) return;
                  void act(
                    () => api("DELETE", `/api/v1/families/${familyId}/help/${item.id}`),
                    "Could not delete this.",
                  );
                }}
                onReply={(body) =>
                  act(
                    () =>
                      api("POST", `/api/v1/families/${familyId}/help/${item.id}/responses`, {
                        body,
                      }),
                    "Could not send your reply.",
                  )
                }
              />
            ))
          )}
        </div>

        <div className="stack">
          <Card title="Post to the board">
            <form className="form" onSubmit={create}>
              <div className="form-grid">
                <Field label="I want to">
                  <select className="select" name="kind" defaultValue="REQUEST">
                    <option value="REQUEST">Ask for help</option>
                    <option value="OFFER">Offer help</option>
                  </select>
                </Field>
                <Field label="Topic">
                  <select className="select" name="category" defaultValue="ADVICE">
                    {Object.entries(HELP_CATEGORIES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Title" className="span-2">
                  <input
                    className="input"
                    name="title"
                    required
                    maxLength={200}
                    placeholder="e.g. Anyone know a good paediatrician in Pune?"
                  />
                </Field>
                <Field label="Details" optional className="span-2">
                  <textarea className="textarea" name="body" maxLength={5000} />
                </Field>
                <Field
                  label="Who can see it"
                  className="span-2"
                  hint={
                    linked
                      ? undefined
                      : "Close-family sharing needs your account linked to your person in the tree."
                  }
                >
                  <select className="select" name="audience" defaultValue="FAMILY">
                    <option value="FAMILY">Everyone in {family.family.name}</option>
                    <option value="CLOSE" disabled={!linked}>
                      Close family only
                    </option>
                  </select>
                </Field>
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={posting}>
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function HelpItem({
  item,
  mine,
  canModerate,
  onUpdate,
  onDelete,
  onReply,
}: {
  item: any;
  mine: boolean;
  canModerate: boolean;
  onUpdate: (patch: object) => Promise<void>;
  onDelete: () => void;
  onReply: (body: string) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [sending, runSend] = useBusy();
  const open = item.status === "OPEN";

  async function send(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reply.trim()) return;
    await runSend(() => onReply(reply.trim()));
    setReply("");
  }

  return (
    <article className={`card card-body stack-sm help-item${open ? "" : " help-item-done"}`}>
      <div className="row">
        <span className={`badge ${item.kind === "REQUEST" ? "badge-request" : "badge-offer"}`}>
          {item.kind === "REQUEST" ? "Needs help" : "Offering"}
        </span>
        <span className="badge">{HELP_CATEGORIES[item.category] ?? item.category}</span>
        <AudienceBadge audience={item.audience} />
        {!open && <span className="badge">{capitalize(item.status.toLowerCase())}</span>}
      </div>
      <h3 className="help-title">{item.title}</h3>
      {item.body && <p className="prose">{item.body}</p>}
      <p className="subtle">
        {item.author.displayName}
        {item.author.kinship && ` (your ${item.author.kinship})`} · {timeAgo(item.createdAt)}
      </p>

      {item.responses.length > 0 && (
        <ul className="stack-sm help-replies">
          {item.responses.map((r: any) => (
            <li key={r.id} className="comment">
              <Avatar name={r.author.displayName} size="sm" />
              <div>
                <strong>{r.author.displayName}</strong>{" "}
                <span className="subtle">{timeAgo(r.createdAt)}</span>
                <p className="prose">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && !mine && (
        <form className="inline-form" onSubmit={send}>
          <input
            className="input"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
            placeholder={item.kind === "REQUEST" ? "I can help…" : "I'd love this…"}
            aria-label="Reply"
          />
          <button type="submit" className="btn btn-sm" disabled={sending}>
            Reply
          </button>
        </form>
      )}

      {(mine || canModerate) && (
        <div className="row">
          {mine && open && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void onUpdate({ status: "RESOLVED" })}
            >
              {item.kind === "REQUEST" ? "Mark as sorted" : "Mark as taken"}
            </button>
          )}
          {mine && !open && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void onUpdate({ status: "OPEN" })}
            >
              Reopen
            </button>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </article>
  );
}
