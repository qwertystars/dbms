import { useEffect, useState } from "react";
import { api, errorMessage } from "~/client/api";
import { useAuth } from "~/client/auth";
import { CreateFamilyForm, FamilyCard } from "~/client/components/families";
import { Alert, Card, EmptyState, Loading, PageHeader } from "~/client/components/ui";

export function DashboardPage() {
  const { me } = useAuth();
  const [families, setFamilies] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api("GET", "/api/v1/families").then((res) => {
      if (res.status === 200) setFamilies(res.body.families || []);
      else {
        setFamilies([]);
        setError(errorMessage(res, "Could not load families."));
      }
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
