#!/usr/bin/env bash
# Manual API smoke flow against a running dev server (localhost:3000) and the seeded DB. Not part of `npm test`.
set -u
H=http://localhost:3000
login() { J=/tmp/cj_$1; rm -f $J; C=$(curl -s -c $J $H/api/auth/csrf | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/'); curl -s -b $J -c $J -o /dev/null -d "csrfToken=$C&email=$1@demo.econlens.test&password=EconLens-demo-1!&json=true" $H/api/auth/callback/credentials; }
call() { curl -s -b /tmp/cj_$1 -X $2 -H 'content-type: application/json' ${4:+-d "$4"} "$H$3"; echo; }
login teacher1; login teacher2; login student1

echo "== create + analyze"
ID=$(call teacher1 POST /api/events '{"inputType":"describe","text":"The government introduced a carbon tax on petrol of 10 cents per litre to cut emissions. Critics say it is unfair to rural drivers."}' | sed 's/.*"experienceId":"\([^"]*\)".*/\1/')
echo $ID > /tmp/expid3
call teacher1 POST /api/experiences/$ID/analyze

echo "== generate before approvals (must fail)"
call teacher1 POST /api/experiences/$ID/generate

OBJ=$(docker compose exec -T db psql -U econlens -d econlens -At -c "select id from \"CurriculumObjective\" where code in ('MIC-01','MIC-02','DAT-01') order by code" | tr '\n' ' ')
set -- $OBJ
echo "== select lenses"
call teacher1 PATCH /api/experiences/$ID/concepts "{\"conceptKeys\":[\"externalities\",\"tax_incidence\"],\"inquiryQuestion\":\"Who really pays a fuel tax?\",\"objectiveIds\":[\"$1\",\"$2\",\"$3\"]}"
echo "== generate before blueprint (must fail)"
call teacher1 POST /api/experiences/$ID/generate
echo "== blueprint"
call teacher1 PATCH /api/experiences/$ID/blueprint '{"durationMinutes":60,"level":"Foundation","readiness":"mixed","english":"developing","quant":"low","devices":"shared","classSize":30,"includeDebate":true,"includeWorksheet":true}'
echo "== other teacher / student blueprint+generate (must fail)"
call teacher2 POST /api/experiences/$ID/generate
call student1 POST /api/experiences/$ID/generate
echo "== generate"
call teacher1 POST /api/experiences/$ID/generate
echo "== generate again (must conflict)"
call teacher1 POST /api/experiences/$ID/generate

echo "== pages"
for p in builder preview "preview?as=teacher&device=mobile" "print?view=student" "print?view=teacher" blueprint; do echo -n "$p "; curl -s -b /tmp/cj_teacher1 -o /dev/null -w "%{http_code}\n" "$H/experiences/$ID/$p"; done
echo -n "teacher2 builder: "; curl -s -b /tmp/cj_teacher2 -o /dev/null -w "%{http_code}\n" "$H/experiences/$ID/builder"
echo -n "teacher2 export: "; curl -s -b /tmp/cj_teacher2 -o /dev/null -w "%{http_code}\n" "$H/api/experiences/$ID/export"
echo -n "student export: "; curl -s -b /tmp/cj_student1 -o /dev/null -w "%{http_code}\n" "$H/api/experiences/$ID/export"
echo -n "anon export: "; curl -s -o /dev/null -w "%{http_code}\n" "$H/api/experiences/$ID/export"
curl -s -b /tmp/cj_teacher1 "$H/api/experiences/$ID/export" -o /tmp/export3.json
node -e "const j=JSON.parse(require('fs').readFileSync('/tmp/export3.json','utf8'));const d=j.document;console.log('export valid JSON; version',j.version,'blocks',d.blocks.length,'minutes',d.blocks.reduce((a,b)=>a+b.minutes,0),'of',d.durationMinutes)"
