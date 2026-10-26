import { Suspense, lazy } from "react";
import { useParams } from "react-router-dom";
import { FamilyHeader } from "~/client/components/FamilyNav";
import { Alert, ErrorState, Loading } from "~/client/components/ui";
import { useFamilyTree } from "~/client/tree/useFamilyTree";

// The graph renderer and layout engine load with this page only.
const TreeWorkspace = lazy(() => import("~/client/tree/TreeWorkspace"));

export function TreePage() {
  const { familyId } = useParams<{ familyId: string }>();
  const tree = useFamilyTree(familyId!);

  if (tree.status === "error" && !tree.graph) {
    return (
      <ErrorState
        title="Could not open this family"
        message={tree.error ?? "Something went wrong."}
        action={
          <button type="button" className="btn" onClick={() => void tree.retry()}>
            Try again
          </button>
        }
      />
    );
  }
  if (!tree.graph || !tree.family || !tree.role) return <Loading />;

  return (
    <div className="tree-page">
      <FamilyHeader
        familyId={familyId!}
        family={tree.family}
        role={tree.role}
        title="Family tree"
        description="Eldest generations on the left. Press + on a card to reveal the next generation."
      />
      {tree.error && (
        <Alert>
          Couldn't refresh the tree: {tree.error}{" "}
          <button type="button" className="btn btn-sm" onClick={() => void tree.retry()}>
            Try again
          </button>
        </Alert>
      )}
      <Suspense fallback={<Loading label="Loading the family map…" />}>
        <TreeWorkspace
          key={familyId}
          familyId={familyId!}
          graph={tree.graph}
          canEdit={tree.role === "CREATOR" || tree.role === "EDITOR"}
          addRelationship={tree.addRelationship}
        />
      </Suspense>
    </div>
  );
}
