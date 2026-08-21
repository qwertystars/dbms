-- 0001_init.sql : initial D1 (SQLite) schema for dbms-family.
-- All timestamps are INTEGER unix epoch (seconds). dob/dod are ISO-8601 date
-- strings ('YYYY-MM-DD') so that lexicographic compare == chronological compare,
-- which the kinship engine uses to pick elder/younger (_el/_yo) terms.

CREATE TABLE users (
  user_id       TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','hi','ta','bn')),
  person_id     TEXT NULL REFERENCES person(person_id),
  created_at    INTEGER NOT NULL
);

CREATE TABLE trees (
  tree_id    TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(user_id),
  created_at INTEGER NOT NULL
);

CREATE TABLE person (
  person_id    TEXT PRIMARY KEY,
  tree_id      TEXT NOT NULL REFERENCES trees(tree_id),
  name         TEXT NOT NULL,
  gender       TEXT NOT NULL CHECK (gender IN ('m','f','o')),
  dob          TEXT,
  dod          TEXT,
  height       TEXT,
  weight       TEXT,
  address      TEXT,
  mail         TEXT,
  phone        TEXT,
  job          TEXT,
  degree       TEXT,
  place        TEXT,
  other_info   TEXT,
  photo_url    TEXT,
  birth_order  INTEGER
);

CREATE TABLE couple (
  couple_id   TEXT PRIMARY KEY,
  tree_id     TEXT NOT NULL REFERENCES trees(tree_id),
  partner_a   TEXT REFERENCES person(person_id),
  partner_b   TEXT REFERENCES person(person_id),
  other_info  TEXT
);

CREATE TABLE child_of (
  couple_id       TEXT NOT NULL REFERENCES couple(couple_id),
  child_person_id TEXT NOT NULL REFERENCES person(person_id),
  PRIMARY KEY (couple_id, child_person_id)
);

CREATE TABLE tree_access (
  tree_id TEXT NOT NULL REFERENCES trees(tree_id),
  user_id TEXT NOT NULL REFERENCES users(user_id),
  role    TEXT NOT NULL CHECK (role IN ('creator','editor','viewer')),
  PRIMARY KEY (tree_id, user_id)
);

-- Static reference data: mirrors the TypeScript kin-term table for reporting.
CREATE TABLE kin_term (
  lang         TEXT NOT NULL,
  relation_key TEXT NOT NULL,
  term         TEXT NOT NULL,
  gloss        TEXT NOT NULL,
  PRIMARY KEY (lang, relation_key)
);

CREATE INDEX idx_person_tree ON person(tree_id);
CREATE INDEX idx_couple_tree ON couple(tree_id);
CREATE INDEX idx_child_child ON child_of(child_person_id);
