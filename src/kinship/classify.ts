import type { ClassifyResult, EdgeKind, KinshipGraph } from './types';
import { buildAdjacency, genderOf, olderThan, type Adjacency } from './graph';

interface BfsNode {
  id: string;
  /** person ids from start (inclusive) to this node */
  chain: string[];
  edges: EdgeKind[];
}

/**
 * BFS over family edges from `fromId` to `toId`.
 * Neighbor kinds are explored in canonical order up < sp < down so the
 * shortest path found is deterministic. Max depth 6 keeps this linear-ish.
 * Returns the goal node carrying the FULL identity chain - tokens alone are
 * ambiguous when several same-kind neighbors exist (e.g. two parents).
 */
function bfs(adj: Adjacency, fromId: string, toId: string): BfsNode | null {
  if (fromId === toId) return { id: fromId, chain: [fromId], edges: [] };
  const visited = new Set<string>([fromId]);
  let frontier: BfsNode[] = [{ id: fromId, chain: [fromId], edges: [] }];
  for (let depth = 0; depth < 6; depth++) {
    const next: BfsNode[] = [];
    for (const node of frontier) {
      const expand = (kind: EdgeKind, ids: string[] | undefined): BfsNode | null => {
        for (const id of ids ?? []) {
          if (id === toId) {
            return { id, chain: [...node.chain, id], edges: [...node.edges, kind] };
          }
          if (visited.has(id)) continue;
          visited.add(id);
          next.push({ id, chain: [...node.chain, id], edges: [...node.edges, kind] });
        }
        return null;
      };
      // canonical order: up, sp, down
      const hit = expand('up', adj.parents.get(node.id))
        ?? expand('sp', adj.spouses.get(node.id))
        ?? expand('down', adj.children.get(node.id));
      if (hit) return hit;
    }
    frontier = next;
  }
  return null;
}

function baseParentalSiblingKey(
  adj: Adjacency,
  linkingParentId: string,
  targetId: string,
): string | null {
  const lpGender = genderOf(adj, linkingParentId);
  const tGender = genderOf(adj, targetId);
  if (!tGender) return null;
  if (lpGender === 'm') {
    // paternal side: linking parent is the father
    if (tGender === 'm') return olderThan(adj, targetId, linkingParentId) ? 'fa_br_el' : 'fa_br_yo';
    return 'fa_si';
  }
  if (lpGender === 'f') {
    // maternal side: linking parent is the mother
    if (tGender === 'm') return 'mo_br';
    return olderThan(adj, targetId, linkingParentId) ? 'mo_si_el' : 'mo_si_yo';
  }
  return null;
}

const SPOUSE_KEY_OF_BASE: Record<string, string> = {
  fa_br_el: 'fa_br_el_sp',
  fa_br_yo: 'fa_br_yo_sp',
  fa_si: 'fa_si_sp',
  mo_br: 'mo_br_sp',
  mo_si_el: 'mo_si_sp', // mother's-sisters collapse to one spouse key
  mo_si_yo: 'mo_si_sp',
};

function keyFromPath(adj: Adjacency, fromId: string, path: EdgeKind[], targets: string[]): string | null {
  // targets[i] = person at the FAR end of path edge i
  const g = (offset: number) => genderOf(adj, targets[offset]!);

  switch (path.length) {
    case 0:
      return 'self';
    case 1: {
      if (path[0] === 'sp') return 'spouse';
      if (path[0] === 'up') return g(0) === 'm' ? 'fa' : g(0) === 'f' ? 'mo' : null;
      if (path[0] === 'down') return g(0) === 'm' ? 'son' : g(0) === 'f' ? 'daughter' : null;
      return null;
    }
    case 2: {
      if (path[0] === 'up' && path[1] === 'up') {
        // grandparent: paternal when the nearer ancestor is the father
        const nearIsMale = g(0) === 'm';
        const far = g(1);
        if (nearIsMale) return far === 'm' ? 'grandfa_pat' : far === 'f' ? 'grandmo_pat' : null;
        return far === 'm' ? 'grandfa_mat' : far === 'f' ? 'grandmo_mat' : null;
      }
      if (path[0] === 'up' && path[1] === 'down') {
        // full sibling via shared parent
        const sib = g(1);
        const younger = !olderThan(adj, targets[1]!, fromId); // default younger when unknown
        if (sib === 'm') return younger ? 'brother_yo' : 'brother_el';
        if (sib === 'f') return younger ? 'sister_yo' : 'sister_el';
        return null;
      }
      if (path[0] === 'down' && path[1] === 'down') {
        // grandchild: gender of the FINAL child decides
        return g(1) === 'm' ? 'grandson' : g(1) === 'f' ? 'granddaughter' : null;
      }
      if (path[0] === 'down' && path[1] === 'sp') {
        return g(0) === 'm' ? 'son_sp' : g(0) === 'f' ? 'da_sp' : null;
      }
      return null;
    }
    case 3: {
      if (path[0] === 'up' && path[1] === 'up' && path[2] === 'down') {
        return baseParentalSiblingKey(adj, targets[0]!, targets[2]!);
      }
      if (path[0] === 'up' && path[1] === 'down' && path[2] === 'down') {
        // sibling's child: nodes[1] is the sibling, nodes[2] the child
        const sib = g(1);
        const child = g(2);
        if (sib === 'm') return child === 'm' ? 'brother_son' : child === 'f' ? 'brother_daughter' : null;
        if (sib === 'f') return child === 'm' ? 'sister_son' : child === 'f' ? 'sister_daughter' : null;
        return null;
      }
      return null;
    }
    case 4: {
      if (
        path[0] === 'up' && path[1] === 'up' && path[2] === 'down' && path[3] === 'sp'
      ) {
        const base = baseParentalSiblingKey(adj, targets[0]!, targets[2]!);
        return base ? SPOUSE_KEY_OF_BASE[base] ?? null : null;
      }
      if (
        path[0] === 'up' && path[1] === 'up' && path[2] === 'down' && path[3] === 'down'
      ) {
        return 'cousin';
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Compute the canonical relation between two persons.
 * Returns relation_key null when the shape is unknown (step relations,
 * spouse-side chains, disconnected people).
 */
export function classify(graph: KinshipGraph, fromId: string, toId: string): ClassifyResult {
  const adj = buildAdjacency(graph);
  const goal = bfs(adj, fromId, toId);
  if (!goal) return { relation_key: null, path: [] };
  // targets[i] is the person reached after traversing goal.edges[i]
  const targets = goal.chain.slice(1);
  return { relation_key: keyFromPath(adj, fromId, goal.edges, targets), path: goal.edges };
}
