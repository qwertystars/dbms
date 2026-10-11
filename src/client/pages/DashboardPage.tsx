import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { CreateFamilyForm, FamilyCard } from "~/client/components/families";
import {
  Alert,
  Card,
  EmptyState,
  Icon,
  Loading,
  PageHeader,
  relativeDay,
  shortDate,
} from "~/client/components/ui";

interface UpcomingEvent {
  familyId: string;
  familyName: string;
  personId: string;
  personName: string;
  type: "birthday" | "memorial";
  date: string;
  daysUntil: number;
  age: number | null;
}

export function DashboardPage() {
  const { me } = useAuth();
  const [families, setFamilies] = useState<any[] | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("GET", "/api/v1/families").then((res) => {
      if (res.status === 200) setFamilies(res.body.families || []);
      else {
        setFamilies([]);
        setError(errorMessage(res, "Could not load families."));
      }
    });
    api("GET", "/api/v1/events/upcoming?days=60").then((res) => {
      setEvents(res.status === 200 ? res.body.events || [] : []);
    });
  }, []);

  const firstName = (me?.displayName || "").split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Home"
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description="Your family spaces, all in one place."
      />
      {error && (
        <div style={{ marginBottom: 24 }}>
          <Alert onClose={() => setError(null)}>{error}</Alert>
        </div>
      )}
      {families && families.length > 0 && (
        <section className="dashboard-welcome">
          <div>
            <span className="eyebrow">The people who make you, you</span>
            <h2>Your story is still growing.</h2>
            <p>Reconnect with your roots. Find a familiar face. Make room for the next chapter.</p>
            <Link className="btn btn-primary" to={`/app/families/${families[0].family.id}/tree`}>
              Explore {families[0].family.name} <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="dashboard-branch" aria-hidden="true">
            <svg viewBox="0 0 300 160" fill="none">
              <path d="M150 40V85M55 120V85H245V120" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="150" cy="35" r="21" fill="var(--surface)" stroke="currentColor" />
              <circle cx="55" cy="126" r="17" fill="var(--surface)" stroke="currentColor" />
              <circle cx="150" cy="126" r="17" fill="var(--surface)" stroke="currentColor" />
              <circle cx="245" cy="126" r="17" fill="var(--surface)" stroke="currentColor" />
            </svg>
            <span>Every branch has roots.</span>
          </div>
        </section>
      )}
      <div className="grid-2">
        <div className="stack-sm">
          <h2>Your families</h2>
          {families === null ? (
            <Loading />
          ) : families.length === 0 ? (
            <div className="card">
              <EmptyState title="No families yet">
                Create a family to start your tree, or ask a relative for an invitation link.
              </EmptyState>
            </div>
          ) : (
            <div className="grid-cards">
              {families.map((item) => (
                <FamilyCard key={item.family.id} item={item} />
              ))}
            </div>
          )}
        </div>
        <div className="stack">
          <Card title="Coming up" description="Birthdays and remembrances, 60 days ahead.">
            {events === null ? (
              <Loading label="Loading dates…" />
            ) : events.length === 0 ? (
              <div className="empty" style={{ padding: "16px 0" }}>
                <p className="empty-title">Nothing on the horizon</p>
                <p>Add birthdays to your family tree to see them here.</p>
              </div>
            ) : (
              <>
                <ul className="event-list">
                  {events.slice(0, 6).map((event) => (
                    <li key={`${event.personId}-${event.type}`} className="event">
                      <span className={`event-icon event-${event.type}`}>
                        <Icon name={event.type === "birthday" ? "cake" : "ring"} size={18} />
                      </span>
                      <div className="event-main">
                        <Link
                          className="event-name"
                          to={`/app/families/${event.familyId}/people/${event.personId}`}
                        >
                          {event.personName}
                        </Link>
                        <span className="event-meta">
                          {event.type === "birthday"
                            ? event.age
                              ? `Turns ${event.age} · ${event.familyName}`
                              : `Birthday · ${event.familyName}`
                            : event.age
                              ? `${event.age} years · ${event.familyName}`
                              : `Remembrance · ${event.familyName}`}
                        </span>
                      </div>
                      <div className="event-when">
                        <span className="event-relative">{relativeDay(event.daysUntil)}</span>
                        <span className="event-date">{shortDate(event.date)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {events.length > 6 && (
                  <p className="subtle" style={{ marginTop: 10 }}>
                    {events.length - 6} more in the next 60 days.
                  </p>
                )}
              </>
            )}
          </Card>
          <Card title="Create a family" description="You will be its creator.">
            <CreateFamilyForm onError={setError} />
          </Card>
          <Card title="Joining a family">
            <p className="muted">
              Family creators can share an invitation link with you. Open the link while signed in
              and you will be added automatically.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
