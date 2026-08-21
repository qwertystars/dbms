import { describe, it, expect } from 'vitest';
import { classify, resolveTerms, TERMS } from '../src/kinship/index';
import type { KinshipGraph } from '../src/kinship/index';

// Fixture (all relations double-checked against dobs):
// G1: Narayanan(m,1920)+Kamala(f,1925); also daughter Kaveri(f,1947)+husband Rajan(m,1944)
// G2: Chinaiyan(m,1945)+Meenakshi(f,1948)   [child of G1]
//     Meenakshi's parents: Venkatesan(m,1922)+Gomathi(f,1926)
//       her siblings: Shantha(f,1946,ELDER)+husband Murugan(m,1944) -> Valli(f,1968), Anand(m,1966)
//                     Mohan(m,1950,YOUNGER)
// G3: Annadurai(m,1970)+Lakshmi(f,1972)     [child of G2]
//     Annadurai's brothers: Selvam(m,1992? no - see dobs) ...
//       Selvam(m,1992)+Uma(f,1994)  ELDER brother of Swaminathan
//       Rathan(m,1998)+Divya(f,2000) YOUNGER brother -> Meera(f,2025), Karthik(m,2025)
// G4: Swaminathan(m,1995)+Priya(f,1997)     [child of G3]
// G5: Aadhira(f,2020)                       [child of G4]

const G: KinshipGraph = {
  persons: [
    { id: 'narayanan', gender: 'm', dob: '1920-01-01', birth_order: 1 },
    { id: 'kamala', gender: 'f', dob: '1925-02-02', birth_order: 1 },
    { id: 'kaveri', gender: 'f', dob: '1947-03-03', birth_order: 2 },
    { id: 'rajan', gender: 'm', dob: '1944-04-04', birth_order: 1 },
    { id: 'chinaiyan', gender: 'm', dob: '1945-05-05', birth_order: 1 },
    { id: 'venkatesan', gender: 'm', dob: '1922-06-06', birth_order: 1 },
    { id: 'gomathi', gender: 'f', dob: '1926-07-07', birth_order: 1 },
    { id: 'shantha', gender: 'f', dob: '1946-08-08', birth_order: 1 },
    { id: 'murugan', gender: 'm', dob: '1944-09-09', birth_order: 1 },
    { id: 'mohan', gender: 'm', dob: '1950-10-10', birth_order: 3 },
    { id: 'meenakshi', gender: 'f', dob: '1948-11-11', birth_order: 2 },
    { id: 'valli', gender: 'f', dob: '1968-12-12', birth_order: 1 },
    { id: 'anand', gender: 'm', dob: '1966-01-01', birth_order: 2 },
    { id: 'annadurai', gender: 'm', dob: '1970-02-02', birth_order: 1 },
    { id: 'lakshmi', gender: 'f', dob: '1972-03-03', birth_order: 1 },
    { id: 'selvam', gender: 'm', dob: '1992-04-04', birth_order: 1 },
    { id: 'uma', gender: 'f', dob: '1994-05-05', birth_order: 1 },
    { id: 'swaminathan', gender: 'm', dob: '1995-06-06', birth_order: 2 },
    { id: 'rathan', gender: 'm', dob: '1998-07-07', birth_order: 3 },
    { id: 'divya', gender: 'f', dob: '2000-08-08', birth_order: 1 },
    { id: 'priya', gender: 'f', dob: '1997-09-09', birth_order: 1 },
    { id: 'aadhira', gender: 'f', dob: '2020-10-10', birth_order: 1 },
    { id: 'karthik', gender: 'm', dob: '2025-11-11', birth_order: 1 },
    { id: 'meera', gender: 'f', dob: '2025-12-12', birth_order: 2 },
  ],
  couples: [
    { couple_id: 'c1', partner_a: 'narayanan', partner_b: 'kamala' },
    { couple_id: 'ck', partner_a: 'kaveri', partner_b: 'rajan' },
    { couple_id: 'c2', partner_a: 'chinaiyan', partner_b: 'meenakshi' },
    { couple_id: 'cv', partner_a: 'venkatesan', partner_b: 'gomathi' },
    { couple_id: 'cs', partner_a: 'shantha', partner_b: 'murugan' },
    { couple_id: 'c3', partner_a: 'annadurai', partner_b: 'lakshmi' },
    { couple_id: 'cu', partner_a: 'selvam', partner_b: 'uma' },
    { couple_id: 'cr', partner_a: 'rathan', partner_b: 'divya' },
    { couple_id: 'c4', partner_a: 'swaminathan', partner_b: 'priya' },
  ],
  child_of: [
    { couple_id: 'c1', child_person_id: 'chinaiyan' },
    { couple_id: 'c1', child_person_id: 'kaveri' },
    { couple_id: 'cv', child_person_id: 'shantha' },
    { couple_id: 'cv', child_person_id: 'meenakshi' },
    { couple_id: 'cv', child_person_id: 'mohan' },
    { couple_id: 'cs', child_person_id: 'valli' },
    { couple_id: 'cs', child_person_id: 'anand' },
    { couple_id: 'c2', child_person_id: 'annadurai' },
    { couple_id: 'c3', child_person_id: 'selvam' },
    { couple_id: 'c3', child_person_id: 'swaminathan' },
    { couple_id: 'c3', child_person_id: 'rathan' },
    { couple_id: 'cu', child_person_id: '' }, // placeholder removed below
    { couple_id: 'cr', child_person_id: 'karthik' },
    { couple_id: 'cr', child_person_id: 'meera' },
    { couple_id: 'c4', child_person_id: 'aadhira' },
  ],
};
G.child_of = G.child_of.filter(co => co.child_person_id !== '');

const CASES: Array<[string, string, string | null]> = [
  // direct line + spouse
  ['aadhira', 'swaminathan', 'fa'],
  ['aadhira', 'priya', 'mo'],
  ['swaminathan', 'aadhira', 'daughter'],
  ['narayanan', 'chinaiyan', 'son'],
  ['annadurai', 'lakshmi', 'spouse'],
  ['lakshmi', 'annadurai', 'spouse'],
  ['rathan', 'divya', 'spouse'],
  // grandparents (annadurai is the g3 anchor)
  ['annadurai', 'narayanan', 'grandfa_pat'],
  ['annadurai', 'kamala', 'grandmo_pat'],
  ['annadurai', 'venkatesan', 'grandfa_mat'],
  ['annadurai', 'gomathi', 'grandmo_mat'],
  // grandchildren
  ['venkatesan', 'annadurai', 'grandson'],
  ['gomathi', 'valli', 'granddaughter'],
  ['narayanan', 'aadhira', null], // great-grandfather: beyond key set
  // parents on maternal side sanity
  ['meenakshi', 'venkatesan', 'fa'],
  ['meenakshi', 'gomathi', 'mo'],
  // siblings (elder/younger by dob)
  ['swaminathan', 'rathan', 'brother_yo'],
  ['rathan', 'swaminathan', 'brother_el'],
  ['swaminathan', 'selvam', 'brother_el'],
  ['chinaiyan', 'kaveri', 'sister_yo'],
  ['kaveri', 'chinaiyan', 'brother_el'],
  ['meenakshi', 'shantha', 'sister_el'],
  ['shantha', 'meenakshi', 'sister_yo'],
  // parental siblings
  ['aadhira', 'selvam', 'fa_br_el'],
  ['aadhira', 'rathan', 'fa_br_yo'],
  ['annadurai', 'selvam', 'son'],
  ['annadurai', 'kaveri', 'fa_si'],
  ['annadurai', 'mohan', 'mo_br'],
  ['annadurai', 'shantha', 'mo_si_el'],
  // their spouses
  ['aadhira', 'uma', 'fa_br_el_sp'],
  ['aadhira', 'divya', 'fa_br_yo_sp'],
  ['annadurai', 'rajan', 'fa_si_sp'],
  ['annadurai', 'murugan', 'mo_si_sp'],
  ['swaminathan', 'uma', null], // brother's wife: beyond the v1 key set
  // sibling's children
  ['rathan', 'aadhira', 'brother_daughter'],
  ['swaminathan', 'karthik', 'brother_son'],
  ['swaminathan', 'meera', 'brother_daughter'],
  ['meenakshi', 'anand', 'sister_son'],
  ['meenakshi', 'valli', 'sister_daughter'],
  // cousin
  ['aadhira', 'karthik', 'cousin'],
  ['aadhira', 'meera', 'cousin'],
  // child's spouse
  ['annadurai', 'priya', 'son_sp'],
  ['kamala', 'rajan', 'da_sp'],
  // unknown shapes
  ['karthik', 'mohan', null],
  ['priya', 'mohan', null],
];

describe('kinship classifier', () => {
  for (const [from, to, key] of CASES) {
    it(`${from} -> ${to} === ${key}`, () => {
      const r = classify(G, from, to);
      expect(r.relation_key).toBe(key);
      expect(Array.isArray(r.path)).toBe(true);
    });
  }

  it('returns self for identical ids', () => {
    expect(classify(G, 'aadhira', 'aadhira').relation_key).toBe('self');
  });

  it('returns null path for unknown ids', () => {
    const r = classify(G, 'ghost', 'narayanan');
    expect(r.relation_key).toBeNull();
    expect(r.path).toEqual([]);
  });
});

describe('term resolution', () => {
  it('CRITICAL: fa_br_yo = uncle/chacha/chittappa/kaka', () => {
    const t = resolveTerms('fa_br_yo');
    expect(t.en.term).toBe('uncle');
    expect(t.hi.term).toBe('chacha');
    expect(t.ta.term).toBe('chittappa');
    expect(t.bn.term).toBe('kaka');
    expect(t.gloss.length).toBeGreaterThan(0);
  });

  it('covers every language for every relation key', () => {
    const KEYS = Object.keys(TERMS.en);
    expect(KEYS.length).toBeGreaterThanOrEqual(30);
    for (const lang of ['hi', 'ta', 'bn'] as const) {
      for (const k of KEYS) {
        const row = TERMS[lang][k];
        expect(row, `${lang}/${k} missing`).toBeTruthy();
        expect(row!.term.length).toBeGreaterThan(0);
        expect(row!.gloss.length).toBeGreaterThan(0);
      }
    }
  });

  it('maternal grandfather across languages', () => {
    const t = resolveTerms('grandfa_mat');
    expect(t.hi.term).toBe('nana');
    expect(t.bn.term).toBe('dadu');
    expect(t.ta.term).toBe('thaatha');
  });
});
