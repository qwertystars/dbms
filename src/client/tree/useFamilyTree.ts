import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, type ApiResult } from "~/client/api";
import { buildFamilyGraph, withEdge, type FamilyGraph } from "~/client/tree/graph";

export interface FamilyTreeData {
  /** The family this data belongs to; anything else is still loading. */
  familyId: string | null;
  status: "loading" | "ready" | "error";
  family: { id: string; name: string; description?: string | null } | null;
  role: string | null;
  graph: FamilyGraph | null;
  /** Set when the first load failed, or when a later refresh failed. */
  error: string | null;
  refreshing: boolean;
}

const INITIAL: FamilyTreeData = {
  familyId: null,
  status: "loading",
  family: null,
  role: null,
  graph: null,
  error: null,
  refreshing: false,
};

/**
 * Loads one family's tree with a single GET /families/{id}/tree (no root),
 * the only existing call that returns the founders and the people with no
 * relationships. Expanding a branch is then a client-side projection and
 * costs no further requests, which also keeps rapid exploration well under
 * the API rate limit.
 *
 * Responses that arrive after the family changed, after a newer load, or
 * after unmount are ignored, so a slow request can never replace the family
 * being viewed.
 */
export function useFamilyTree(familyId: string) {
  const [data, setData] = useState<FamilyTreeData>(INITIAL);
  const latest = useRef(0);
  const currentFamily = useRef(familyId);
  currentFamily.current = familyId;

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      const request = ++latest.current;
      setData((prev) => (mode === "initial" ? INITIAL : { ...prev, refreshing: true }));
      const [family, tree] = await Promise.all([
        api("GET", `/api/v1/families/${familyId}`),
        api("GET", `/api/v1/families/${familyId}/tree`),
      ]);
      if (request !== latest.current) return;
      const failure = firstFailure(family, tree);
      if (failure) {
        setData((prev) => ({
          ...prev,
          familyId,
          status: prev.graph ? "ready" : "error",
          refreshing: false,
          error: failure,
        }));
        return;
      }
      setData({
        familyId,
        status: "ready",
        family: family.body.family,
        role: family.body.membership.role,
        graph: buildFamilyGraph(tree.body.people ?? [], tree.body.edges ?? []),
        error: null,
        refreshing: false,
      });
    },
    [familyId],
  );

  useEffect(() => {
    void load("initial");
    return () => {
      latest.current += 1; // invalidate anything still in flight
    };
  }, [load]);

  /** Creates a relationship and merges the returned edge without a refetch. */
  const addRelationship = useCallback(
    async (parentPersonId: string, childPersonId: string) => {
      const forFamily = familyId;
      const res = await api("POST", `/api/v1/families/${familyId}/relationships/parent-child`, {
        parentPersonId,
        childPersonId,
      });
      if (res.status !== 201) {
        return { ok: false as const, message: errorMessage(res, "Could not add relationship.") };
      }
      if (currentFamily.current === forFamily) {
        setData((prev) =>
          prev.graph ? { ...prev, graph: withEdge(prev.graph, res.body.edge) } : prev,
        );
      }
      return { ok: true as const };
    },
    [familyId],
  );

  const current = data.familyId === familyId ? data : INITIAL;
  return {
    ...current,
    retry: useCallback(() => load(current.graph ? "refresh" : "initial"), [load, current.graph]),
    addRelationship,
  };
}

function firstFailure(family: ApiResult, tree: ApiResult): string | null {
  if (family.status !== 200) return errorMessage(family, "Family not found.");
  if (tree.status !== 200) return errorMessage(tree, "Could not load the family tree.");
  return null;
}
