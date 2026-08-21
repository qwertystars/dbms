-- 0002_seed.sql : demo seed data + kin_term reference mirror.
--
-- Kin terms are read from TypeScript at runtime; this table mirrors them so the
-- DB alone can answer reporting queries. Rows are verbatim from the project
-- spec. One deliberate normalization: the spec sheet lists "bn|ma|ma|mother";
-- 'ma' is not a canonical relation_key, so it is stored under 'mo' with term/gloss
-- verbatim ('ma' / 'mother').
--
-- Elder/younger (_el/_yo): decided by ISO-string dob compare, birth_order as
-- fallback; when both are unknown the DEFAULT IS _yo. Seed dob values below are
-- chosen so those comparisons behave sensibly.

INSERT INTO users (user_id, email, name, password_hash, lang, person_id, created_at) VALUES
  ('u-srijan',   'srijan@example.com',   'Srijan',        'seed-hash-not-a-real-password', 'en', NULL, 1700000000),
  ('u-sourabh',  'sourabh@example.com',  'Sourabh',       'seed-hash-not-a-real-password', 'en', NULL, 1700000001),
  ('u-narayanan','narayanan@example.com','Narayanan',     'seed-hash-not-a-real-password', 'en', NULL, 1700000002);

-- ---------------------------------------------------------------------------
-- Tree 1: Narayanan Lineage (4 generations)
-- ---------------------------------------------------------------------------
INSERT INTO trees (tree_id, name, created_by, created_at) VALUES
  ('t-narayanan', 'Narayanan Lineage', 'u-narayanan', 1700000100);

INSERT INTO person (person_id, tree_id, name, gender, dob, dod, height, weight, address, mail, phone, job, degree, place, other_info, photo_url, birth_order) VALUES
  ('p-narayanan',    't-narayanan', 'Narayanan',    'm', '1940-01-15', NULL, '5''7"',  '68', 'Thanjavur, TN', 'narayanan@example.com',   '+91-90000-00001', 'Farmer',      NULL,          'Thanjavur', NULL, NULL, 1),
  ('p-kamala',       't-narayanan', 'Kamala',       'f', '1943-06-20', NULL, '5''2"',  '55', 'Thanjavur, TN', NULL,                      NULL,              'Homemaker',   NULL,          'Thanjavur', NULL, NULL, 1),
  ('p-chinaiyan',    't-narayanan', 'Chinaiyan',    'm', '1965-03-10', NULL, '5''8"',  '72', 'Kumbakonam, TN','chinaiyan@example.com',   '+91-90000-00002', 'Teacher',     'B.A.',        'Kumbakonam',NULL, NULL, 1),
  ('p-meenakshi',    't-narayanan', 'Meenakshi',    'f', '1968-11-05', NULL, '5''3"',  '58', 'Kumbakonam, TN',NULL,                      NULL,              'Homemaker',   NULL,          'Kumbakonam',NULL, NULL, 1),
  ('p-annadurai',    't-narayanan', 'Annadurai',    'm', '1990-07-22', NULL, '5''9"',  '70', 'Chennai, TN',   'annadurai@example.com',   '+91-90000-00003', 'Engineer',    'B.E.',        'Chennai',   NULL, NULL, 1),
  ('p-lakshmi',      't-narayanan', 'Lakshmi',      'f', '1992-02-14', NULL, '5''4"',  '56', 'Chennai, TN',   NULL,                      NULL,              'Doctor',      'MBBS',        'Chennai',   NULL, NULL, 1),
  ('p-swaminathan',  't-narayanan', 'Swaminathan',  'm', '2015-09-01', NULL, NULL,     NULL, 'Chennai, TN',   NULL,                      NULL,              NULL,          NULL,          NULL,        NULL, NULL, 1),
  ('p-priya',        't-narayanan', 'Priya',        'f', '2017-04-18', NULL, NULL,     NULL, 'Chennai, TN',   NULL,                      NULL,              NULL,          NULL,          NULL,        NULL, NULL, 1),
  ('p-aadhira',      't-narayanan', 'Aadhira',      'f', '2040-05-05', NULL, NULL,     NULL, NULL,            NULL,                      NULL,              NULL,          NULL,          NULL,        NULL, NULL, 1);

INSERT INTO couple (couple_id, tree_id, partner_a, partner_b, other_info) VALUES
  ('c-nar-g1', 't-narayanan', 'p-narayanan',   'p-kamala',      'Married 1962'),
  ('c-nar-g2', 't-narayanan', 'p-chinaiyan',   'p-meenakshi',   'Married 1988'),
  ('c-nar-g3', 't-narayanan', 'p-annadurai',   'p-lakshmi',     'Married 2014'),
  ('c-nar-g4', 't-narayanan', 'p-swaminathan', 'p-priya',       'Married 2039');

-- Chinaiyan is the child of the g1 couple; Annadurai of g2; Swaminathan of g3;
-- Aadhira (unmarried, no couple) is the child of the g4 couple.
INSERT INTO child_of (couple_id, child_person_id) VALUES
  ('c-nar-g1', 'p-chinaiyan'),
  ('c-nar-g2', 'p-annadurai'),
  ('c-nar-g3', 'p-swaminathan'),
  ('c-nar-g4', 'p-aadhira');

INSERT INTO tree_access (tree_id, user_id, role) VALUES
  ('t-narayanan', 'u-narayanan', 'creator'),
  ('t-narayanan', 'u-srijan',    'viewer');

-- ---------------------------------------------------------------------------
-- Tree 2: Path Family (2 generations)
-- ---------------------------------------------------------------------------
INSERT INTO trees (tree_id, name, created_by, created_at) VALUES
  ('t-path', 'Path Family', 'u-sourabh', 1700000101);

INSERT INTO person (person_id, tree_id, name, gender, dob, dod, height, weight, address, mail, phone, job, degree, place, other_info, photo_url, birth_order) VALUES
  ('p-sanjay',  't-path', 'Sanjay Path', 'm', '1962-08-12', NULL, '5''10"', '75', 'Jaipur, RJ', 'sanjay@example.com', '+91-90000-00004', 'Businessman', 'B.Com.', 'Jaipur', NULL, NULL, 1),
  ('p-anita',   't-path', 'Anita',       'f', '1964-12-03', NULL, '5''4"',  '60', 'Jaipur, RJ', NULL,                 NULL,              'Homemaker',   NULL,     'Jaipur', NULL, NULL, 1),
  ('p-sourabh', 't-path', 'Sourabh',     'm', '1991-05-17', NULL, '6''0"',  '78', 'Bengaluru',  'sourabh@example.com','+91-90000-00005', 'Engineer',    'B.Tech', 'Bengaluru', NULL, NULL, 1),
  ('p-rekha',   't-path', 'Rekha',       'f', '1993-10-09', NULL, '5''5"',  '57', 'Bengaluru',  NULL,                 NULL,              'Designer',    'B.Des',  'Bengaluru', NULL, NULL, 1),
  ('p-srijan',  't-path', 'Srijan',      'm', '2020-01-25', NULL, NULL,     NULL, 'Bengaluru',  NULL,                 NULL,              NULL,          NULL,     NULL,     NULL, NULL, 1);

INSERT INTO couple (couple_id, tree_id, partner_a, partner_b, other_info) VALUES
  ('c-path-g1', 't-path', 'p-sanjay',  'p-anita', 'Married 1989'),
  ('c-path-g2', 't-path', 'p-sourabh', 'p-rekha', 'Married 2019');

-- Sourabh is the child of the g1 couple; Srijan (unmarried) of the g2 couple.
INSERT INTO child_of (couple_id, child_person_id) VALUES
  ('c-path-g1', 'p-sourabh'),
  ('c-path-g2', 'p-srijan');

INSERT INTO tree_access (tree_id, user_id, role) VALUES
  ('t-path', 'u-sourabh', 'creator');

-- ---------------------------------------------------------------------------
-- kin_term reference mirror (see header note re: bn|ma -> bn|mo)
-- ---------------------------------------------------------------------------
INSERT INTO kin_term (lang, relation_key, term, gloss) VALUES
  -- English
  ('en','spouse','spouse','husband or wife'),
  ('en','fa','father','father'),
  ('en','mo','mother','mother'),
  ('en','son','son','son'),
  ('en','daughter','daughter','daughter'),
  ('en','brother_el','brother','elder brother'),
  ('en','brother_yo','brother','younger brother'),
  ('en','sister_el','sister','elder sister'),
  ('en','sister_yo','sister','younger sister'),
  ('en','grandfa_pat','grandfather','father''s father'),
  ('en','grandmo_pat','grandmother','father''s mother'),
  ('en','grandfa_mat','grandfather','mother''s father'),
  ('en','grandmo_mat','grandmother','mother''s mother'),
  ('en','grandson','grandson','son''s child'),
  ('en','granddaughter','granddaughter','child''s daughter'),
  ('en','fa_br_el','uncle','father''s elder brother'),
  ('en','fa_br_yo','uncle','father''s younger brother'),
  ('en','fa_si','aunt','father''s sister'),
  ('en','mo_br','uncle','mother''s brother'),
  ('en','mo_si_el','aunt','mother''s elder sister'),
  ('en','mo_si_yo','aunt','mother''s younger sister'),
  ('en','fa_br_el_sp','uncle','father''s elder brother''s wife'),
  ('en','fa_br_yo_sp','aunt','father''s younger brother''s wife'),
  ('en','fa_si_sp','uncle','father''s sister''s husband'),
  ('en','mo_br_sp','aunt','mother''s brother''s wife'),
  ('en','mo_si_sp','uncle','mother''s sister''s husband'),
  ('en','brother_son','nephew','brother''s son'),
  ('en','brother_daughter','niece','brother''s daughter'),
  ('en','sister_son','nephew','sister''s son'),
  ('en','sister_daughter','niece','sister''s daughter'),
  ('en','cousin','cousin','parent''s sibling''s child'),
  ('en','son_sp','daughter-in-law','son''s wife'),
  ('en','da_sp','son-in-law','daughter''s husband'),
  -- Hindi
  ('hi','spouse','pati / patni','husband / wife'),
  ('hi','fa','pita','father'),
  ('hi','mo','mata','mother'),
  ('hi','son','beta','son'),
  ('hi','daughter','beti','daughter'),
  ('hi','brother_el','bada bhai','elder brother'),
  ('hi','brother_yo','chhota bhai','younger brother'),
  ('hi','sister_el','didi','elder sister'),
  ('hi','sister_yo','behen','younger sister'),
  ('hi','grandfa_pat','dada','paternal grandfather'),
  ('hi','grandmo_pat','dadi','paternal grandmother'),
  ('hi','grandfa_mat','nana','maternal grandfather'),
  ('hi','grandmo_mat','nani','maternal grandmother'),
  ('hi','grandson','pota','son''s son'),
  ('hi','granddaughter','poti','son''s daughter'),
  ('hi','fa_br_el','tau','father''s elder brother'),
  ('hi','fa_br_yo','chacha','father''s younger brother'),
  ('hi','fa_br_el_sp','taayi','tau''s wife'),
  ('hi','fa_br_yo_sp','chachi','chacha''s wife'),
  ('hi','fa_si','bua','father''s sister'),
  ('hi','fa_si_sp','phupha','bua''s husband'),
  ('hi','mo_br','mama','mother''s brother'),
  ('hi','mo_br_sp','mami','mama''s wife'),
  ('hi','mo_si_el','mausi','mother''s elder sister'),
  ('hi','mo_si_yo','mausi','mother''s younger sister'),
  ('hi','mo_si_sp','mausa','mausi''s husband'),
  ('hi','brother_son','bhatija','brother''s son'),
  ('hi','brother_daughter','bhatiji','brother''s daughter'),
  ('hi','sister_son','bhanja','sister''s son'),
  ('hi','sister_daughter','bhanji','sister''s daughter'),
  ('hi','cousin','chachera tauhera bhai','parent''s sibling''s child'),
  ('hi','son_sp','bahu','son''s wife'),
  ('hi','da_sp','damad','daughter''s husband'),
  -- Tamil
  ('ta','spouse','kanaavan / manaivi','husband / wife'),
  ('ta','fa','appa','father'),
  ('ta','mo','amma','mother'),
  ('ta','son','magan','son'),
  ('ta','daughter','magal','daughter'),
  ('ta','brother_el','annan','elder brother'),
  ('ta','brother_yo','thambi','younger brother'),
  ('ta','sister_el','akka','elder sister'),
  ('ta','sister_yo','thangai','younger sister'),
  ('ta','grandfa_pat','thaatha','paternal grandfather'),
  ('ta','grandmo_pat','paatti','paternal grandmother'),
  ('ta','grandfa_mat','thaatha','maternal grandfather'),
  ('ta','grandmo_mat','paatti','maternal grandmother'),
  ('ta','grandson','peyan','grandson'),
  ('ta','granddaughter','petti','granddaughter'),
  ('ta','fa_br_el','periyappa','father''s elder brother'),
  ('ta','fa_br_yo','chittappa','father''s younger brother'),
  ('ta','fa_br_el_sp','periyamma','father''s elder brother''s wife'),
  ('ta','fa_br_yo_sp','chithi','father''s younger brother''s wife'),
  ('ta','fa_si','athai','father''s sister'),
  ('ta','fa_si_sp','athimber','athai''s husband'),
  ('ta','mo_br','mama','mother''s brother'),
  ('ta','mo_br_sp','mami','mama''s wife'),
  ('ta','mo_si_el','periyamma','mother''s elder sister'),
  ('ta','mo_si_yo','chithi','mother''s younger sister'),
  ('ta','mo_si_sp','mama','mother''s sister''s husband (colloquial)'),
  ('ta','brother_son','nephew','brother''s son (loan word)'),
  ('ta','brother_daughter','niece','brother''s daughter (loan word)'),
  ('ta','sister_son','nephew','sister''s son (loan word)'),
  ('ta','sister_daughter','niece','sister''s daughter (loan word)'),
  ('ta','cousin','cousin','parent''s sibling''s child (loan word)'),
  ('ta','son_sp','marumagal','son''s wife'),
  ('ta','da_sp','marumagan','daughter''s husband'),
  -- Bengali
  ('bn','spouse','swami / stri','husband / wife'),
  ('bn','fa','baba','father'),
  ('bn','mo','ma','mother'),
  ('bn','son','chele','son'),
  ('bn','daughter','meye','daughter'),
  ('bn','brother_el','dada','elder brother'),
  ('bn','brother_yo','bhai','younger brother'),
  ('bn','sister_el','didi','elder sister'),
  ('bn','sister_yo','bon','younger sister'),
  ('bn','grandfa_pat','thakurdada','paternal grandfather'),
  ('bn','grandmo_pat','thakurma','paternal grandmother'),
  ('bn','grandfa_mat','dadu','maternal grandfather'),
  ('bn','grandmo_mat','didima','maternal grandmother'),
  ('bn','grandson','nati','grandson'),
  ('bn','granddaughter','natni','granddaughter'),
  ('bn','fa_br_el','jethu','father''s elder brother'),
  ('bn','fa_br_yo','kaka','father''s younger brother'),
  ('bn','fa_br_el_sp','jethimoni','jethu''s wife'),
  ('bn','fa_br_yo_sp','kakima','kaka''s wife'),
  ('bn','fa_si','pishi','father''s sister'),
  ('bn','fa_si_sp','pisemoshai','pishi''s husband'),
  ('bn','mo_br','mama','mother''s brother'),
  ('bn','mo_br_sp','mami','mama''s wife'),
  ('bn','mo_si_el','mashi','mother''s elder sister'),
  ('bn','mo_si_yo','mashi','mother''s younger sister'),
  ('bn','mo_si_sp','mesho','mashi''s husband'),
  ('bn','brother_son','bhaipo','brother''s son'),
  ('bn','brother_daughter','bhagni','brother''s daughter'),
  ('bn','sister_son','bhanja','sister''s son'),
  ('bn','sister_daughter','bhanji','sister''s daughter'),
  ('bn','cousin','cousin','parent''s sibling''s child (loan word)'),
  ('bn','son_sp','bou','son''s wife'),
  ('bn','da_sp','jamai','daughter''s husband');
