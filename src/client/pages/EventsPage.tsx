import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Loading,
  formatDate,
  relativeDay,
  shortDate,
  useBusy,
} from "~/client/components/ui";

type Rsvp = "GOING" | "MAYBE" | "NOT_GOING";

interface FamilyEvent {
  id: string;
  title: string;
  description: string | null;
  startsOn: string;
  startTime: string | null;
  location: string | null;
  createdByAccountId: string;
  creator: { displayName: string };
  rsvpCounts: Record<Rsvp, number>;
  myRsvp: Rsvp | null;
}

interface DerivedEvent {
  familyId: string;
  personId: string;
  personName: string;
  type: "birthday" | "memorial";
  date: string;
  daysUntil: number;
  age: number | null;
}

const RSVP_OPTIONS: { value: Rsvp; label: string }[] = [
  { value: "GOING", label: "Going" },
  { value: "MAYBE", label: "Maybe" },
  { value: "NOT_GOING", label: "Can't go" },
];

function daysFromToday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

function monthLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
}

export function EventsPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const { me } = useAuth();
  const [family, setFamily] = useState<any | null>(null);
  const [role, setRole] = useState("VIEWER");
  const [events, setEvents] = useState<FamilyEvent[] | null>(null);
  const [derived, setDerived] = useState<DerivedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [saving, runSave] = useBusy();

  async function loadEvents() {
    const res = await api("GET", `/api/v1/families/${familyId}/events`);
    if (res.status === 200) setEvents(res.body.events || []);
    else if (events === null) setFatal(errorMessage(res, "Could not load events."));
    else setError(errorMessage(res, "Could not load events."));
  }

  useEffect(() => {
    setFamily(null);
    setEvents(null);
    setFatal(null);
    void (async () => {
      const res = await api("GET", `/api/v1/families/${familyId}`);
      if (res.status !== 200) {
        setFatal(errorMessage(res, "Family not found."));
        return;
      }
      setFamily(res.body.family);
      setRole(res.body.membership.role);
      const upcoming = await api("GET", "/api/v1/events/upcoming?days=365");
      if (upcoming.status !== 200) {
        setError(errorMessage(upcoming, "Could not load birthdays and remembrances."));
      }
      setDerived(
        upcoming.status === 200
          ? (upcoming.body.events || []).filter((e: DerivedEvent) => e.familyId === familyId)
          : [],
      );
      await loadEvents();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  async function createEvent(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const value = (key: string) => ((form.get(key) as string) || "").trim() || null;
    const res = await runSave(() =>
      api("POST", `/api/v1/families/${familyId}/events`, {
        title: value("title"),
        startsOn: value("startsOn"),
        startTime: value("startTime"),
        location: value("location"),
        description: value("description"),
      }),
    );
    if (!res || res.status !== 201) {
      setError(res ? errorMessage(res, "Could not create the event.") : null);
      return;
    }
    formEl.reset();
    setError(null);
    await loadEvents();
  }

  async function respond(event: FamilyEvent, response: Rsvp) {
    const clearing = event.myRsvp === response;
    const res = clearing
      ? await api("DELETE", `/api/v1/families/${familyId}/events/${event.id}/rsvp`)
      : await api("PUT", `/api/v1/families/${familyId}/events/${event.id}/rsvp`, { response });
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not save your RSVP."));
      return;
    }
    await loadEvents();
  }

  async function removeEvent(event: FamilyEvent) {
    if (!window.confirm(`Delete “${event.title}”?`)) return;
    const res = await api("DELETE", `/api/v1/families/${familyId}/events/${event.id}`);
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not delete the event."));
      return;
    }
    await loadEvents();
  }

  if (fatal) return <ErrorState title="Could not open this family" message={fatal} />;
  if (!family || events === null) return <Loading />;

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={family}
        role={role}
        title="Events"
        description="Gatherings, birthdays and days of remembrance."
      />
      <div className="grid-2">
        <div className="stack">
          {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
          <Card title="Upcoming gatherings" flush>
            {events.length === 0 ? (
              <EmptyState title="Nothing planned yet">
                Plan a get-together and let everyone RSVP.
              </EmptyState>
            ) : (
              <ul className="list">
                {events.map((event) => {
                  const days = daysFromToday(event.startsOn);
                  const canDelete = event.createdByAccountId === me?.id || role === "CREATOR";
                  return (
                    <li key={event.id} className="event-card">
                      <div className="event-date-tile" aria-hidden="true">
                        <span>{monthLabel(event.startsOn)}</span>
                        <strong>{Number(event.startsOn.slice(8, 10))}</strong>
                      </div>
                      <div className="event-card-main">
                        <div className="event-card-head">
                          <h3>{event.title}</h3>
                          <span className="event-relative">{relativeDay(days)}</span>
                        </div>
                        <p className="subtle">
                          {[
                            formatDate(event.startsOn),
                            event.startTime,
                            event.location,
                            `added by ${event.creator.displayName}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {event.description && <p className="event-desc">{event.description}</p>}
                        <div className="event-card-foot">
                          <div className="segmented" role="group" aria-label="Your RSVP">
                            {RSVP_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                aria-pressed={event.myRsvp === option.value}
                                className={event.myRsvp === option.value ? "active" : ""}
                                onClick={() => void respond(event, option.value)}
                              >
                                {option.label}
                                <span className="chip-count">{event.rsvpCounts[option.value]}</span>
                              </button>
                            ))}
                          </div>
                          {canDelete && (
                            <button
                              type="button"
                              className="post-action post-action-danger"
                              onClick={() => void removeEvent(event)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Birthdays and remembrances" description="From dates recorded on profiles.">
            {derived.length === 0 ? (
              <p className="muted">Add dates of birth to profiles to see them here.</p>
            ) : (
              <ul className="event-list">
                {derived.map((event) => (
                  <li key={`${event.personId}-${event.type}`} className="event">
                    <span className={`event-icon event-${event.type}`}>
                      <Icon name={event.type === "birthday" ? "cake" : "ring"} size={18} />
                    </span>
                    <div className="event-main">
                      <Link
                        className="event-name"
                        to={`/app/families/${familyId}/people/${event.personId}`}
                      >
                        {event.personName}
                      </Link>
                      <span className="event-meta">
                        {event.type === "birthday"
                          ? event.age
                            ? `Turns ${event.age}`
                            : "Birthday"
                          : event.age
                            ? `${event.age} years since passing`
                            : "Remembrance"}
                      </span>
                    </div>
                    <div className="event-when">
                      <span className="event-relative">{relativeDay(event.daysUntil)}</span>
                      <span className="event-date">{shortDate(event.date)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Plan a gathering" description="Every member of this family can RSVP.">
          <form className="form" onSubmit={createEvent}>
            <Field label="What">
              <input className="input" name="title" required maxLength={200} />
            </Field>
            <div className="form-grid">
              <Field label="Date">
                <input className="input" name="startsOn" type="date" required />
              </Field>
              <Field label="Time" optional>
                <input className="input" name="startTime" type="time" />
              </Field>
            </div>
            <Field label="Where" optional>
              <input className="input" name="location" maxLength={300} />
            </Field>
            <Field label="Details" optional>
              <textarea className="textarea" name="description" maxLength={2000} />
            </Field>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Add event"}
            </button>
          </form>
        </Card>
      </div>
    </>
  );
}
