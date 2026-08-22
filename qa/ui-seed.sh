#!/usr/bin/env bash
# Seed the 8790 UI instance with a persistent Narayanan tree + a login user
# whose person_id is Arjun (so kinship badges render in person modals).
set -euo pipefail
BASE=http://127.0.0.1:8790
QA_DIR="$(cd "$(dirname "$0")" && pwd)"
J="$QA_DIR/jars"
mkdir -p "$J"
for i in $(seq 1 45); do curl -s -o /dev/null -w '%{http_code}' "$BASE/api/me" 2>/dev/null | grep -qE '401|200' && break; sleep 1; done

curl -s -c "$J/ui-admin.txt" -X POST "$BASE/api/login" >/dev/null || true
curl -s -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d '{"email":"kannan-ui@qa.local","name":"Kannan","password":"narayanan-pass","lang":"ta"}' > /dev/null
curl -s -c "$J/ui-admin.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"kannan-ui@qa.local","password":"narayanan-pass"}' > /dev/null

TREE=$(curl -s -b "$J/ui-admin.txt" -X POST "$BASE/api/trees" -H 'content-type: application/json' -d '{"name":"Narayanan Family"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).tree.tree_id))")
A="-b $J/ui-admin.txt"
pid() { curl -s $A -X POST "$BASE/api/trees/$TREE/persons" -H 'content-type: application/json' -d "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).person.person_id))"; }
ANNADURAI=$(pid '{"name":"Annadurai","gender":"m","dob":"1930-04-12","job":"Farmer","degree":"B.A. History","place":"Mayiladuthurai","height":"170cm","weight":"68kg","address":"1 Temple St, Mayiladuthurai","mail":"annadurai@qa.local","phone":"+91-98400-00001","other_info":"Family patriarch"}')
LAKSHMI=$(pid '{"name":"Lakshmi","gender":"f","dob":"1935-08-02","job":"Homemaker","place":"Mayiladuthurai","address":"1 Temple St, Mayiladuthurai","other_info":"Loved gardening"}')
SELVAM=$(pid '{"name":"Selvam","gender":"m","dob":"1955-06-01","job":"Civil engineer","degree":"B.E.","phone":"+91-98400-11111"}')
MEENAKSHI=$(pid '{"name":"Meenakshi","gender":"f","dob":"1958-11-15","job":"Teacher","degree":"B.Ed."}')
RATHAN=$(pid '{"name":"Rathan","gender":"m","dob":"1962-09-09","job":"Bank manager","place":"Chennai"}')
PRIYA=$(pid '{"name":"Priya","gender":"f","dob":"1966-03-21","job":"Doctor","degree":"MBBS"}')
ARJUN=$(pid '{"name":"Arjun","gender":"m","dob":"1985-02-02","job":"Software engineer","degree":"B.Tech","mail":"arjun@qa.local","address":"12 Beach Rd, Chennai"}')
DIVYA=$(pid '{"name":"Divya","gender":"f","dob":"1988-07-30","job":"Architect"}')
cid() { curl -s $A -X POST "$BASE/api/trees/$TREE/couples" -H 'content-type: application/json' -d "$1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).couple.couple_id))"; }
G1=$(cid "{\"partner_a\":\"$ANNADURAI\",\"partner_b\":\"$LAKSHMI\",\"other_info\":\"Arranged marriage, 1952\"}")
C2=$(cid "{\"partner_a\":\"$SELVAM\",\"partner_b\":\"$MEENAKSHI\"}")
C3=$(cid "{\"partner_a\":\"$RATHAN\",\"partner_b\":\"$PRIYA\",\"other_info\":\"Met at bank\"}")
C4=$(cid "{\"partner_a\":\"$ARJUN\",\"partner_b\":\"$DIVYA\"}")
for kid in "$SELVAM:$G1" "$RATHAN:$G1" "$ARJUN:$C2"; do
  k="${kid%%:*}"; c="${kid##*:}"
  curl -s $A -X POST "$BASE/api/couples/$c/children" -H 'content-type: application/json' -d "{\"child_person_id\":\"$k\"}" > /dev/null
done

# login user linked to Arjun so modal kinship badges have a from-person
curl -s -X POST "$BASE/api/signup" -H 'content-type: application/json' \
  -d "{\"email\":\"lakshmi-view@qa.local\",\"name\":\"Lakshmi View\",\"password\":\"viewer-pass-1\",\"lang\":\"ta\",\"person_id\":\"$ARJUN\"}" > /dev/null
curl -s -c "$J/ui-view.txt" -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"email":"lakshmi-view@qa.local","password":"viewer-pass-1"}' > /dev/null
curl -s -b "$J/ui-view.txt" -X POST "$BASE/api/trees/$TREE/members" \
  -H 'content-type: application/json' -d '{"role":"viewer"}' > /dev/null

cat > "$QA_DIR/ui-seed.env" <<EOF
TREE=$TREE
ANNADURAI=$ANNADURAI
LAKSHMI=$LAKSHMI
ARJUN=$ARJUN
RATHAN=$RATHAN
EOF
echo "seeded TREE=$TREE ARJUN=$ARJUN LAKSHMI=$LAKSHMI"
