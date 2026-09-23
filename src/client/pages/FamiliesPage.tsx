import { useEffect, useState } from "react";
import { api, errorMessage } from "~/client/api";
import { CreateFamilyForm, FamilyCard } from "~/client/components/families";
import { Alert, Card, EmptyState, Loading, PageHeader } from "~/client/components/ui";

export function FamiliesPage() {
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

  return (
    <>
      <PageHeader
        title="Families"
        description={
          families && families.length > 0
            ? `You belong to ${families.length} ${families.length === 1 ? "family" : "families"}.`
            : "Families you create or join appear here."
        }
      />
      <div className="stack">
        {error && <Alert onClose={() => setError(null)}>{error}</Alert>}
        {families === null ? (
          <Loading />
        ) : families.length === 0 ? (
          <div className="card">
            <EmptyState title="No families yet">
              Create one below, or open an invitation link from a relative.
            </EmptyState>
          </div>
        ) : (
          <div className="grid-cards">
            {families.map((item) => (
              <FamilyCard key={item.family.id} item={item} />
            ))}
          </div>
        )}
        <div style={{ maxWidth: 520 }}>
          <Card title="Create a family" description="You will be its creator.">
            <CreateFamilyForm onError={setError} />
          </Card>
        </div>
      </div>
    </>
  );
}
