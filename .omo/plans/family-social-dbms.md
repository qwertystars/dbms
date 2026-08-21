# Plan: family social network on CF Workers + D1 + B2 (mass-ulw)

Tier: HEAVY (new domain model, DB schema, auth/session, permissions, external integration).
Notepad: /tmp/ulw-20260821-232227.x4yDau.md

## Components (topology lock)
1. Data layer: D1 migrations + seed + integrity tests
2. Kinship engine: pure-TS classifier + en/hi/ta/bn terms
3. Server API: Hono auth/RBAC/routes/generations-CTE/B2 photo upload
4. Frontend: vanilla-JS/SVG tree UI, couple boxes → person modals
5. Verification: live wrangler-dev curl suite + Playwright UI QA

## DAG (key: family-social-v1)
| id | cat | owns (write scope) | depends |
|----|-----|--------------------|---------|
| install-deps | quick | package.json, pnpm-lock, vitest.config.ts, src/index.ts stub | - |
| schema-seed | unspecified-low | migrations/**, test/schema.test.ts | install-deps |
| kinship | deep | src/kinship/**, test/kinship.test.ts | install-deps |
| storage-b2 | quick | src/storage/b2.ts, test/b2.test.ts | install-deps |
| frontend | visual-engineering | web/** | install-deps |
| server-api | unspecified-high | src/index.ts, src/server/**, test/api.test.ts | schema-seed, kinship, storage-b2 |
| verify-live | unspecified-low | qa/sc1..sc3 transcripts | server-api |
| verify-ui | visual-engineering | qa/sc4 artifacts, scripts/ui-qa.mjs | server-api, frontend |

Reasons per non-quick category: schema-seed (SQL design judgment, few files),
kinship (genuinely hairy path-classification logic), server-api (multi-file
integration surface), frontend/verify-ui (UI specialty), verify-live (command
orchestration + output judgment).

## Schema contract (authoritative)
users(user_id PK, email UNIQUE, name, password_hash pbkdf2$iter$salt$hash,
lang CHECK en/hi/ta/bn, person_id FK->person NULL, created_at)
trees(tree_id PK, name, created_by FK->users, created_at)
person(person_id PK, tree_id FK, name NOT NULL, gender CHECK m/f/o, dob, dod,
height, weight, address, mail, phone, job, degree, place, other_info,
photo_url, birth_order INT NULL)
couple(couple_id PK, tree_id FK, partner_a FK->person NULL, partner_b FK->person NULL, other_info)
child_of(couple_id FK, child_person_id FK->person, PK(couple_id, child_person_id))
tree_access(tree_id FK, user_id FK, role CHECK creator/editor/viewer, PK(tree_id,user_id))
kin_term(lang, relation_key, term, gloss, PK(lang, relation_key))
Indexes: person(tree_id), couple(tree_id), child_of(child_person_id).
Generations = WITH RECURSIVE bands: roots = couples whose neither partner appears
in child_of as child; next = couples founded by children of current band.

## Kinship contract
Graph edges derived: parents(P)=partners of couple containing P in child_of;
spouse(P)=other partner; siblings=co-children of same couple; elder/younger by
dob, fallback birth_order; unknown order defaults to _yo for fa_br (documented).
Required keys: self, spouse, fa, mo, son, daughter, brother_el/_yo, sister_el/_yo,
grandfa_pat/mat, grandmo_pat/mat, grandson, granddaughter, fa_br_el, fa_br_yo,
fa_si, mo_br, mo_si_el, mo_si_yo, fa_br_el_sp, fa_br_yo_sp, fa_si_sp, mo_br_sp,
mo_si_sp, nephew, niece, cousin, son_sp, da_sp.
Authoritative seeds (term@gloss): en collapses to uncle/aunt/etc.; hi:
tau@father's elder brother, chacha@father's younger brother, chachi@his wife,
bua@father's sister, phupha@her husband, mama@mother's brother, mami@his wife,
mausi@mother's sister, nana/nani@maternal grandparents, dada/dadi@paternal,
beta/beti, bahu@son's wife, damad@daughter's husband, bhai/behan, bhatija/
bhanji@brother's son/daughter, pota/poti@son's children;
ta: appa/amma, magan/magal, annan/thambi, akka/thangai, thaatha/paatti,
periyappa@fa_br_el, chittappa@fa_br_yo, periyamma@fa_br_el_sp AND mo_si_el,
chithi@fa_br_yo_sp AND mo_si_yo, athai@fa_si, athimber@fa_si_sp, mama@mo_br
AND mo_si_sp(colloquial), mami@mo_br_sp, marumagal@son_sp, marumagan@da_sp,
pēyan/petti@grandchildren, cousin=cousin;
bn: baba/ma, chele/meye, dada@brother_el, bhai@brother_yo, didi@sister_el,
bon@sister_yo, dadu@grandfa, thakurma@grandmo_pat, didima@grandmo_mat,
jethu/jethimoni@fa_br_el+wife, kaka/kakima@fa_br_yo+wife, pishi/pisemoshai@
fa_si+husband, mama/mami@mo_br+wife, mashi/mesho@mo_si+husband, bhou@son_sp,
jamai@da_sp, bhaipo/bhagni@brother's son/daughter.
Every row carries English gloss; regional variants tolerated via gloss.

## API contract
POST /api/signup {email,name,password,lang} -> 201 {user_id,...}
POST /api/login {email,password} -> 200 + HttpOnly SameSite=Lax sid cookie (HMAC-SHA256 {uid,exp}, secret SESSION_SECRET)
POST /api/logout 204; GET /api/me 200
GET /api/trees; POST /api/trees {name} 201 (+creator role row)
POST /api/trees/:id/access {email,role} 201 creator-only
GET /api/trees/:id/generations 200 {generations:[{gen,couples:[{couple_id,other_info,child_count,partners:[2]}]}]}
GET /api/persons/:id 200 (members); POST/PUT/DELETE under /api/trees/:id/persons editor+
POST /api/trees/:id/couples 201; POST /api/trees/:id/couples/:cid/children 201
DELETE /api/trees/:id creator-only cascade
GET /api/kinship?tree&from&to 200 {relation_key,path,gloss,terms:{en,hi,ta,bn}}
POST /api/persons/:pid/photo multipart -> B2 S3 PUT (SigV4, WebCrypto) -> {photo_url};
503 {error:"b2_not_configured"} without B2_KEY_ID/B2_APP_KEY
GET /* serves web/ assets. Errors JSON {error}; 401/403/404 semantics.

## Verification wave
V1 live curl SC1/SC2/SC3 transcripts; V2 Playwright SC4 screenshots;
full vitest + typecheck; momus review gate (plan file exists, HEAVY).

## Failure playbook
retry failed node in place; amend definition if prompt wrong; never new key.
