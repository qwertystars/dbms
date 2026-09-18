import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "~/client/api";
import { FamilyHeader } from "~/client/components/FamilyNav";
import {
  Avatar,
  Card,
  ErrorState,
  Loading,
  capitalize,
  formatDate,
  lifeSpan,
} from "~/client/components/ui";

export function PersonPage() {
  const { familyId, personId } = useParams<{ familyId: string; personId: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    (async () => {
      const [family, person, tree] = await Promise.all([
        api("GET", `/api/v1/families/${familyId}`),
        api("GET", `/api/v1/families/${familyId}/people/${personId}`),
        api("GET", `/api/v1/families/${familyId}/tree?rootPersonId=${personId}&depth=1`),
      ]);
      if (cancelled) return;
      if (family.status !== 200) {
        setError(errorMessage(family, "Family not found."));
        return;
      }
      if (person.status !== 200) {
        setError(errorMessage(person, "Person not found."));
        return;
      }
      const people = new Map<string, any>((tree.body.people || []).map((p: any) => [p.id, p]));
      const edges: any[] = tree.body.edges || [];
      const parents = edges
        .filter((e) => e.childPersonId === personId && people.has(e.parentPersonId))
        .map((e) => people.get(e.parentPersonId));
      const children = edges
        .filter((e) => e.parentPersonId === personId && people.has(e.childPersonId))
        .map((e) => people.get(e.childPersonId));
      setData({
        family: family.body.family,
        role: family.body.membership.role,
        person: person.body.person,
        parents,
        children,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [familyId, personId]);

  if (error) return <ErrorState title="Could not open this profile" message={error} />;
  if (!data) return <Loading />;

  const p = data.person;
  const details: [string, ReactNode][] = [
    ["Gender", capitalize(p.gender)],
    ["Born", formatDate(p.dateOfBirth)],
    ["Died", formatDate(p.dateOfDeath)],
    ["Occupation", p.occupation],
    ["Height", p.heightCm ? `${p.heightCm} cm` : null],
    ["Weight", p.weightKg ? `${p.weightKg} kg` : null],
    ["Email", p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : null],
    ["Phone", p.phone ? <a href={`tel:${p.phone}`}>{p.phone}</a> : null],
    ["Address", p.address],
  ];
  const personLink = (id: string) => `/app/families/${familyId}/people/${id}`;

  function relatives(list: any[], empty: string) {
    if (list.length === 0) return <p className="subtle">{empty}</p>;
    return (
      <ul className="list">
        {list.map((r) => (
          <li key={r.id}>
            <Link to={personLink(r.id)} className="list-item" style={{ padding: "8px 0" }}>
              <Avatar name={r.name} size="sm" />
              <div className="list-item-main">
                <div className="list-item-title">{r.name}</div>
                {lifeSpan(r) && <div className="list-item-meta">{lifeSpan(r)}</div>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <FamilyHeader
        familyId={familyId!}
        family={data.family}
        role={data.role}
        title={p.name}
        description={null}
      />

      <div className="grid-2">
        <div className="stack">
          <section className="card card-body stack">
            <div className="profile-head">
              <Avatar name={p.name} size="lg" />
              <div>
                <p style={{ fontSize: "1.05rem", fontWeight: 550 }}>
                  {[lifeSpan(p), p.occupation].filter(Boolean).join(" · ") || "No details yet"}
                </p>
                {p.dateOfDeath && (
                  <span className="badge" style={{ marginTop: 8 }}>
                    Deceased
                  </span>
                )}
              </div>
            </div>
            <dl className="detail-list">
              {details
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          {p.biography && (
            <Card title="Biography">
              <p className="prose">{p.biography}</p>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Parents">{relatives(data.parents, "No parents recorded.")}</Card>
          <Card title="Children">{relatives(data.children, "No children recorded.")}</Card>
        </div>
      </div>
    </>
  );
}
