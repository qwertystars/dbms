export interface KinshipPerson {
  id: string;
  gender: 'm' | 'f' | 'o';
  dob?: string | null;
  birth_order?: number | null;
}

export interface KinshipCouple {
  couple_id: string;
  partner_a?: string | null;
  partner_b?: string | null;
}

export interface KinshipChildOf {
  couple_id: string;
  child_person_id: string;
}

/** The graph shape the server loads from D1 (person/couple/child_of). */
export interface KinshipGraph {
  persons: KinshipPerson[];
  couples: KinshipCouple[];
  child_of: KinshipChildOf[];
}

export type EdgeKind = 'up' | 'sp' | 'down';

export interface ClassifyResult {
  /** canonical relation key, or null when the shape is unknown */
  relation_key: string | null;
  /** edge tokens of the path that was found ('up' | 'sp' | 'down') */
  path: EdgeKind[];
}

export interface TermRow {
  term: string;
  gloss: string;
}
