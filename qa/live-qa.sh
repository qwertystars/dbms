#!/usr/bin/env bash
# Live-server QA for SC1 (generations), SC2 (kinship), SC3 (RBAC), plus the
# SC6 live-shape check (photo without B2 keys -> 503). Every request is a
# `curl -i` captured under qa/transcripts/.
set -euo pipefail
BASE=http://127.0.0.1:8788
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
T="$QA_DIR/transcripts"
mkdir -p "$T" "$QA_DIR/jars"

step() { echo -e "\n===== $* ====="; }
fail() { echo "ASSERTION FAILED: $*" >&2; exit 1; }

jget() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const v='$1'.split('.').reduce((o,k)=>o?.[k],j);console.log(v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):v)})"; }

step "signup four users"
curl -si -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d '{"email":"kannan@qa.local","name":"Kannan","password":"narayanan-pass","lang":"ta"}' | tee "$T/01-signup-creator.txt" >/dev/null

for u in meena priya-outsider; do :; done
curl -s -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d '{"email":"meena@qa.local","name":"Meena","password":"editor-pass-1"}' >/dev/null
curl -s -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d '{"email":"vetri@qa.local","name":"Vetri","password":"viewer-pass-1"}' >/dev/null
curl -s -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d '{"email":"stranger@qa.local","name":"Stranger","password":"outsider-pass"}' >/dev/null
echo "four users signed up"

step "logins (creator kannan / editor meena / viewer vetri)"
curl -si -c "$QA_DIR/jars/creator.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"kannan@qa.local","password":"narayanan-pass"}' | tee "$T/02-login-creator.txt" >/dev/null
curl -s -c "$QA_DIR/jars/editor.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"meena@qa.local","password":"editor-pass-1"}' >/dev/null
curl -s -c "$QA_DIR/jars/viewer.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"vetri@qa.local","password":"viewer-pass-1"}' >/dev/null
curl -s -c "$QA_DIR/jars/outsider.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"stranger@qa.local","password":"outsider-pass"}' >/dev/null
grep -qi '^HTTP/1.1 200' "$T/02-login-creator.txt" || fail "creator login not 200"
grep -qi 'set-cookie: session=' "$T/02-login-creator.txt" || fail "no session cookie"
echo "all logged in"

step "creator creates the tree"
TREE=$(curl -s -b "$QA_DIR/jars/creator.txt" -X POST "$BASE/api/trees" \
  -H 'content-type: application/json' -d '{"name":"Narayanan Family"}' | tee /dev/stderr | jget tree.tree_id) 2>"$T/03-create-tree.json"
[ -n "$TREE" ] || fail "tree id empty"
echo "TREE=$TREE" | tee "$QA_DIR/tree-id.env"

step "members join: meena=editor, vetri=viewer (stranger stays out)"
curl -si -b "$QA_DIR/jars/editor.txt" -X POST "$BASE/api/trees/$TREE/members" \
  -H 'content-type: application/json' -d '{"role":"editor"}' | tee "$T/04-join-editor.txt" >/dev/null
curl -si -b "$QA_DIR/jars/viewer.txt" -X POST "$BASE/api/trees/$TREE/members" \
  -H 'content-type: application/json' -d '{"role":"viewer"}' | tee "$T/05-join-viewer.txt" >/dev/null
grep -qi '^HTTP/1.1 201' "$T/04-join-editor.txt" || fail "editor join not 201"
grep -qi '^HTTP/1.1 201' "$T/05-join-viewer.txt" || fail "viewer join not 201"

step "editor seeds the Narayanan lineage (G1..G3)"
E="-b $QA_DIR/jars/editor.txt"
pid() { curl -s $E -X POST "$BASE/api/trees/$TREE/persons" -H 'content-type: application/json' -d "$1" | jget person.person_id; }
ANNADURAI=$(pid '{"name":"Annadurai","gender":"m","dob":"1930-04-12","job":"Farmer","degree":"B.A. History","place":"Mayiladuthurai","other_info":"Family patriarch"}')
LAKSHMI=$(pid '{"name":"Lakshmi","gender":"f","dob":"1935-08-02","job":"Homemaker","place":"Mayiladuthurai"}')
SELVAM=$(pid '{"name":"Selvam","gender":"m","dob":"1955-06-01","job":"Civil engineer","degree":"B.E.","phone":"+91-98400-11111","height":"175cm","weight":"72kg"}')
MEENAKSHI=$(pid '{"name":"Meenakshi","gender":"f","dob":"1958-11-15","job":"Teacher","degree":"B.Ed."}')
RATHAN=$(pid '{"name":"Rathan","gender":"m","dob":"1962-09-09","job":"Bank manager","place":"Chennai"}')
PRIYA=$(pid '{"name":"Priya","gender":"f","dob":"1966-03-21","job":"Doctor","degree":"MBBS"}')
ARJUN=$(pid '{"name":"Arjun","gender":"m","dob":"1985-02-02","job":"Software engineer","degree":"B.Tech","mail":"arjun@qa.local","address":"12 Beach Rd, Chennai"}')
DIVYA=$(pid '{"name":"Divya","gender":"f","dob":"1988-07-30","job":"Architect"}')
echo "persons: $ANNADURAI $LAKSHMI $SELVAM $MEENAKSHI $RATHAN $PRIYA $ARJUN $DIVYA"

cid() { curl -s $E -X POST "$BASE/api/trees/$TREE/couples" -H 'content-type: application/json' -d "$1" | jget couple.couple_id; }
G1=$(cid "{\"partner_a\":\"$ANNADURAI\",\"partner_b\":\"$LAKSHMI\",\"other_info\":\"Arranged marriage, 1952\"}")
C2=$(cid "{\"partner_a\":\"$SELVAM\",\"partner_b\":\"$MEENAKSHI\"}")
C3=$(cid "{\"partner_a\":\"$RATHAN\",\"partner_b\":\"$PRIYA\",\"other_info\":\"Met at bank\"}")
C4=$(cid "{\"partner_a\":\"$ARJUN\",\"partner_b\":\"$DIVYA\"}")
for kid in "$SELVAM:$G1" "$RATHAN:$G1" "$ARJUN:$C2"; do
  k="${kid%%:*}"; c="${kid##*:}"
  curl -s $E -X POST "$BASE/api/couples/$c/children" -H 'content-type: application/json' \
    -d "{\"child_person_id\":\"$k\"}" >/dev/null
done
echo "couples: G1=$G1 C2=$C2 C3=$C3 C4=$C4"

step "SC1: GET generations (expect G1..G3 bands matching seed)"
curl -si -b "$QA_DIR/jars/creator.txt" "$BASE/api/trees/$TREE/generations" | tee "$T/10-generations.txt" >/dev/null
GENS_JSON=$(tail -1 "$T/10-generations.txt")
echo "$GENS_JSON" > "$T/10-generations.json"
echo "$GENS_JSON" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const g=JSON.parse(d).generations;
  const names=b=>b.couples.flatMap(c=>c.partners.map(p=>p.name)).sort();
  const assert=(cond,msg)=>{if(!cond){console.error("FAIL "+msg);process.exit(1)}console.log("ok  "+msg)};
  assert(g.length===3,"three generation bands");
  assert(g[0].gen===1&&g[1].gen===2&&g[2].gen===3,"bands numbered G1,G2,G3");
  assert(JSON.stringify(names(g[0]))===JSON.stringify(["Annadurai","Lakshmi"]),"G1 = Annadurai+Lakshmi");
  assert(JSON.stringify(names(g[1]))===JSON.stringify(["Meenakshi","Priya","Rathan","Selvam"]),"G2 = Selvam+Meenakshi, Rathan+Priya");
  assert(JSON.stringify(names(g[2]))===JSON.stringify(["Arjun","Divya"]),"G3 = Arjun+Divya");
  assert(g[1].couples.length===2,"G2 has two couples");
})'

step "SC2: kinship Arjun -> Rathan must be father's younger brother"
curl -si -b "$QA_DIR/jars/creator.txt" "$BASE/api/kinship?tree=$TREE&from=$ARJUN&to=$RATHAN" | tee "$T/11-kinship-fa-br-yo.txt" >/dev/null
KIN_JSON=$(tail -1 "$T/11-kinship-fa-br-yo.txt")
echo "$KIN_JSON" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const k=JSON.parse(d);
  const assert=(cond,msg)=>{if(!cond){console.error("FAIL "+msg);process.exit(1)}console.log("ok  "+msg)};
  assert(k.relation_key==="fa_br_yo","relation_key = fa_br_yo");
  assert(k.terms.en.term==="uncle","en = uncle");
  assert(k.terms.hi.term==="chacha","hi = chacha");
  assert(k.terms.ta.term==="chittappa","ta = chittappa");
  assert(k.terms.bn.term==="kaka","bn = kaka");
  assert(typeof k.gloss==="string"&&k.gloss.length>0,"gloss non-empty");
})'

step "SC2b: kinship Rathan -> Selvam = elder brother (sanity)"
curl -s -b "$QA_DIR/jars/creator.txt" "$BASE/api/kinship?tree=$TREE&from=$RATHAN&to=$SELVAM" | tee "$T/12-kinship-brother-el.json" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const k=JSON.parse(d);
  if(k.relation_key!=="brother_el"){console.error("FAIL expected brother_el got "+k.relation_key);process.exit(1)}
  console.log("ok  brother_el ("+k.terms.ta.term+")");
})'

step "SC3: RBAC adversarial matrix"
PUT() { curl -si -b "$1" -X PUT "$BASE/api/persons/$SELVAM" -H 'content-type: application/json' -d "$2"; }
PUT "$QA_DIR/jars/viewer.txt" '{"job":"hacked"}' | tee "$T/20-rbac-viewer-put.txt" >/dev/null
grep -qi '^HTTP/1.1 403' "$T/20-rbac-viewer-put.txt" || fail "viewer PUT should be 403"
echo "ok  viewer PUT person -> 403"
PUT "$QA_DIR/jars/editor.txt" '{"job":"Senior civil engineer"}' | tee "$T/21-rbac-editor-put.txt" >/dev/null
grep -qi '^HTTP/1.1 200' "$T/21-rbac-editor-put.txt" || fail "editor PUT should be 200"
echo "ok  editor PUT person -> 200"
PUT "$QA_DIR/jars/outsider.txt" '{"job":"intruder"}' | tee "$T/22-rbac-outsider-put.txt" >/dev/null
grep -qi '^HTTP/1.1 403' "$T/22-rbac-outsider-put.txt" || fail "outsider PUT should be 403"
echo "ok  non-member PUT person -> 403"
curl -si -b "$QA_DIR/jars/viewer.txt" "$BASE/api/trees/$TREE/generations" | head -1 | grep -q 200 \
  || fail "viewer generations should be 200"
echo "ok  viewer GET generations -> 200"

step "SC6 live shape: photo upload without B2 keys -> 503 b2_not_configured"
printf '\x89PNG\r\n\x1a\n fakebytes' > "$QA_DIR/tmp-photo.png"
curl -si -b "$QA_DIR/jars/editor.txt" -X POST "$BASE/api/persons/$ARJUN/photo" \
  -F "file=@$QA_DIR/tmp-photo.png;type=image/png" | tee "$T/30-photo-unconfigured.txt" >/dev/null
grep -qi '^HTTP/1.1 503' "$T/30-photo-unconfigured.txt" || fail "photo without keys should be 503"
tail -1 "$T/30-photo-unconfigured.txt" | grep -q '"error":"b2_not_configured"' || fail "body missing b2_not_configured"
echo "ok  503 b2_not_configured"

step "SC3 finale: creator deletes the tree (200), then it is gone"
curl -si -b "$QA_DIR/jars/editor.txt" -X DELETE "$BASE/api/trees/$TREE" | head -1 | grep -q 403 \
  || fail "editor DELETE tree should be 403"
echo "ok  editor DELETE tree -> 403"
curl -si -b "$QA_DIR/jars/creator.txt" -X DELETE "$BASE/api/trees/$TREE" | tee "$T/23-rbac-creator-delete-tree.txt" >/dev/null
grep -qi '^HTTP/1.1 200' "$T/23-rbac-creator-delete-tree.txt" || fail "creator DELETE tree should be 200"
curl -s -o /dev/null -w '%{http_code}' -b "$QA_DIR/jars/viewer.txt" "$BASE/api/trees/$TREE/generations" | grep -qx 403 \
  || fail "generations after delete should be 403"
echo "ok  creator DELETE tree -> 200, tree gone"

echo ""
echo "ALL LIVE ASSERTIONS PASSED"
