import { useEffect, useState, type SubmitEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { CIRCLE_LABELS, KinshipTag, type KinshipInfo } from "~/client/components/kinship";
import {
  Alert,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  lifeSpan,
} from "~/client/components/ui";

const CIRCLE_ORDER: KinshipInfo["circle"][] = ["SELF", "CLOSE", "FAR", "UNKNOWN"];

/**
 * Who's who: everyone in the family with how they relate to you, what they do,
 * where they live and what they can help with. The server only sends the fields
 * this viewer may see, and search only matches those.
 */
export function DirectoryPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const [family, setFamily] = useState<any | null>(null);
  const [people, setPeople] = useState<any[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(search = "") {
    const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await api("GET", `/api/v1/families/${familyId}/people${suffix}`);
    if (res.status !== 200) {
      setError(errorMessage(res, "Could not load the directory."));
      return;
    }
    setPeople(res.body.people);
  }

  useEffect(() => {
    setFamily(null);
    setPeople(null);
    setError(null);
    setQuery("");
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

  function search(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void load(query.trim());
  }

  if (error && !family) return <ErrorState title="Could not open this family" message={error} />;
  if (!family || !people) return <Loading />;

  const linked = Boolean(family.membership.personId);
  const groups = CIRCLE_ORDER.map((circle) => ({
    circle,
    people: people
      .filter((p) => (p.kinship?.circle ?? "UNKNOWN") === circle)
      .sort(
        (a, b) =>
          (a.kinship?.degree ?? 99) - (b.kinship?.degree ?? 99) || a.name.localeCompare(b.name),
      ),
  })).filter((g) => g.people.length > 0);

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={family.family}
        role={family.membership.role}
        title="Who's who"
        description="What everyone is up to, where they are, and what they can help with."
      />

      <div className="stack">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {!linked && (
          <Alert kind="info">
            You aren't linked to your own profile in this family's tree yet, so relationships and
            close-family details can't be worked out for you. Ask the family's Creator to link you
            on the Overview page.
          </Alert>
        )}

        <form className="inline-form" onSubmit={search} role="search">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, job, studies, city or skill, e.g. “doctor” or “Chennai”"
            aria-label="Search the family"
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
          {query && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setQuery("");
                void load();
              }}
            >
              Clear
            </button>
          )}
        </form>

        {groups.length === 0 ? (
          <div className="card">
            <EmptyState title={query ? "No one matches that search" : "No people yet"}>
              {query
                ? "Only details that are shared with you are searched."
                : "People added to the family tree show up here."}
            </EmptyState>
          </div>
        ) : (
          groups.map((group) => (
            <Card
              key={group.circle}
              title={CIRCLE_LABELS[group.circle]}
              description={
                group.circle === "CLOSE"
                  ? `Relatives within ${family.family.closeFamilyDegree} steps of you in the tree`
                  : undefined
              }
              flush
            >
              <ul className="list">
                {group.people.map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/families/${familyId}/people/${p.id}`} className="list-item">
                      <Avatar
                        name={p.name}
                        mediaId={p.profileMediaId}
                        deceased={Boolean(p.dateOfDeath)}
                      />
                      <div className="list-item-main">
                        <div className="list-item-title">
                          {p.name} <KinshipTag kinship={p.kinship} />
                        </div>
                        <div className="list-item-meta">
                          {[p.occupation, p.education, p.city, lifeSpan(p)]
                            .filter(Boolean)
                            .join(" · ") || "No details shared"}
                        </div>
                        {p.skills && (
                          <div className="list-item-meta">
                            <strong>Can help with:</strong> {p.skills}
                          </div>
                        )}
                      </div>
                      {p.member && <span className="badge">On Banyan</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
