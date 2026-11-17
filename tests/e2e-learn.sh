#!/usr/bin/env bash
# Manual publish/learn/insights smoke flow against a running dev server and the seeded DB. Not part of `npm test`.
set -u
H=http://localhost:3000
PSQL="docker compose exec -T db psql -U econlens -d econlens -At -c"
login() { J=/tmp/cj_$1; rm -f $J; C=$(curl -s -c $J $H/api/auth/csrf | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/'); curl -s -b $J -c $J -o /dev/null -d "csrfToken=$C&email=$1@demo.econlens.test&password=EconLens-demo-1!&json=true" $H/api/auth/callback/credentials; }
call() { curl -s -b /tmp/cj_$1 -X $2 -H 'content-type: application/json' ${4:+-d "$4"} "$H$3"; echo; }
code() { curl -s -b /tmp/cj_$1 -o /dev/null -w "%{http_code}" "$H$2"; echo; }
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log($1)}catch(e){console.log('PARSE_ERROR')}})"; }
login teacher1; login teacher2; login student1; login student2

echo "== build a fresh 45-min experience"
ID=$(call teacher1 POST /api/events '{"inputType":"describe","text":"A supermarket raised the price of milk by 12% this month. Shoppers say it is unfair."}' | field "j.data.experienceId")
call teacher1 POST /api/experiences/$ID/analyze > /dev/null
OBJ=$($PSQL "select id from \"CurriculumObjective\" where code in ('MIC-03','DAT-01') order by code" | tr '\n' ' '); set -- $OBJ
call teacher1 PATCH /api/experiences/$ID/concepts "{\"conceptKeys\":[\"relative_prices\",\"supply_demand\"],\"inquiryQuestion\":\"Is one price rise the same as inflation?\",\"objectiveIds\":[\"$1\",\"$2\"]}" > /dev/null
call teacher1 PATCH /api/experiences/$ID/blueprint '{"durationMinutes":45,"level":"Foundation","readiness":"mixed","english":"developing","quant":"low","devices":"shared","classSize":20,"includeDebate":true,"includeWorksheet":true}' > /dev/null
call teacher1 POST /api/experiences/$ID/generate
echo $ID > /tmp/expid4

echo "== publish needs a class (expect NOT_FOUND for a made-up class)"
call teacher1 POST /api/experiences/$ID/publish '{"classId":"nope","feedbackMode":"after_submit"}'
echo "== create class"
CID=$(call teacher1 POST /api/classes '{"name":"Smoke class","term":"T1"}' | field "j.data.id")
CODE=$($PSQL "select \"joinCode\" from \"Classroom\" where id='$CID'")
echo "class $CID code length ${#CODE}"
echo "== other teacher cannot publish to my class or my experience"
call teacher2 POST /api/experiences/$ID/publish "{\"classId\":\"$CID\",\"feedbackMode\":\"after_submit\"}"
echo "== publish (expect assignment)"
P1=$(call teacher1 POST /api/experiences/$ID/publish "{\"classId\":\"$CID\",\"feedbackMode\":\"after_submit\"}"); echo "$P1" | cut -c1-120
AID=$(echo "$P1" | field "j.data.assignmentId")
echo "== publish again is idempotent (same assignment)"
AID2=$(call teacher1 POST /api/experiences/$ID/publish "{\"classId\":\"$CID\",\"feedbackMode\":\"after_submit\"}" | field "j.data.assignmentId")
[ "$AID" = "$AID2" ] && echo "idempotent OK" || echo "NOT IDEMPOTENT"

echo "== student2 has not joined: cannot see or start it"
echo -n "page: "; code student2 /learn/$AID
call student2 POST /api/assignments/$AID/attempts
echo "== bad join codes"
call student1 POST /api/join '{"code":"ZZZZZZZZ"}'
call teacher1 POST /api/join "{\"code\":\"$CODE\"}"
echo "== student1 joins by code, lowercase with dash"
LC=$(echo $CODE | tr 'A-Z' 'a-z' | sed 's/\(....\)/\1-/;s/-$//')
call student1 POST /api/join "{\"code\":\"$LC\"}"
echo -n "learn page: "; code student1 /learn/$AID
echo -n "join page (student): "; code student1 /join/$CODE

echo "== student cannot reach teacher resources"
echo -n "export api: "; code student1 /api/experiences/$ID/export
echo -n "experiences api: "; code student1 /api/experiences
echo -n "insights page (redirects away): "; code student1 /experiences/$ID/insights
echo -n "builder page (redirects away): "; code student1 /experiences/$ID/builder

echo "== start attempt"
TID=$(call student1 POST /api/assignments/$AID/attempts | field "j.data.attemptId"); echo "attempt $TID"
curl -s -b /tmp/cj_teacher1 "$H/api/experiences/$ID/export" > /tmp/exp4.json
RATIONALE=$(node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const i=j.document.blocks.flatMap(b=>b.items).find(i=>i.kind==='mcq');console.log(i.teacher.rationale.slice(0,40))" < /tmp/exp4.json)
node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const d=j.document;const items=d.blocks.flatMap(b=>b.items);const mcq=items.find(i=>i.kind==='mcq'&&!i.independent);const ex=items.filter(i=>i.independent);const sc=d.blocks.find(b=>b.scenario);console.log(JSON.stringify({mcq:mcq.id,mcqKey:mcq.teacher.correctOptionIds[0],ex0:ex[0].id,ex0Key:ex[0].teacher.correctOptionIds[0],sc:sc.id,d1:sc.scenario.decisions[0].id,o1:sc.scenario.decisions[0].options[0].id,d2:sc.scenario.decisions[1].id,o2:sc.scenario.decisions[1].options[0].id}))" < /tmp/exp4.json > /tmp/ids4.json
MCQ=$(field "j.mcq" < /tmp/ids4.json); MCQK=$(field "j.mcqKey" < /tmp/ids4.json); EX0=$(field "j.ex0" < /tmp/ids4.json); EX0K=$(field "j.ex0Key" < /tmp/ids4.json)
SC=$(field "j.sc" < /tmp/ids4.json); D1=$(field "j.d1" < /tmp/ids4.json); O1=$(field "j.o1" < /tmp/ids4.json); D2=$(field "j.d2" < /tmp/ids4.json); O2=$(field "j.o2" < /tmp/ids4.json)

echo "== student pages must not contain keys, notes or the exit ticket (activity) / explanations"
curl -s -b /tmp/cj_student1 "$H/learn/$AID" > /tmp/learn4.html
curl -s -b /tmp/cj_student1 "$H/learn/$AID/check" > /tmp/check4.html
for needle in correctOptionIds teacherNotes numericAnswer rubric "$RATIONALE"; do
  echo -n "learn has '$needle': "; grep -c -F -- "$needle" /tmp/learn4.html | head -1
  echo -n "check has '$needle': "; grep -c -F -- "$needle" /tmp/check4.html | head -1
done
echo -n "activity page shows exit ticket text: "; grep -c "Independent exit ticket" /tmp/learn4.html | head -1
echo -n "check page shows independent prompt: "; grep -c "classmate says" /tmp/check4.html | head -1

echo "== save answers (response must not reveal the score)"
call student1 POST /api/attempts/$TID/responses "{\"itemId\":\"$MCQ\",\"response\":{\"optionIds\":[\"$MCQK\"]}}"
call student1 POST /api/attempts/$TID/responses "{\"itemId\":\"$MCQ\",\"response\":{\"optionIds\":[\"zz\"]}}"
call student1 POST /api/attempts/$TID/responses "{\"itemId\":\"$EX0\",\"response\":{\"optionIds\":[\"$EX0K\"]}}"
echo "== other student cannot write to my attempt"
call student2 POST /api/attempts/$TID/responses "{\"itemId\":\"$MCQ\",\"response\":{\"optionIds\":[\"$MCQK\"]}}"
echo "== scenario: out of order is refused, in order works, outcomes are server computed"
call student1 POST /api/attempts/$TID/scenario "{\"blockId\":\"$SC\",\"decisionId\":\"$D2\",\"optionId\":\"$O2\"}"
call student1 POST /api/attempts/$TID/scenario "{\"blockId\":\"$SC\",\"decisionId\":\"$D1\",\"optionId\":\"$O1\"}" | cut -c1-200
call student1 POST /api/attempts/$TID/scenario "{\"blockId\":\"$SC\",\"decisionId\":\"$D2\",\"optionId\":\"$O2\"}" | cut -c1-200

echo "== feedback before submit"
curl -s -b /tmp/cj_student1 "$H/learn/$AID/feedback" | grep -c "Feedback appears after you submit" | head -1
echo "== submit (twice is fine)"
call student1 POST /api/attempts/$TID/submit
call student1 POST /api/attempts/$TID/submit
echo "== cannot change answers after submit"
call student1 POST /api/attempts/$TID/responses "{\"itemId\":\"$MCQ\",\"response\":{\"optionIds\":[\"$MCQK\"]}}"
echo "== feedback after submit"
curl -s -b /tmp/cj_student1 "$H/learn/$AID/feedback" > /tmp/fb4.html
echo -n "has explanations: "; grep -c "Why:" /tmp/fb4.html | head -1
echo -n "has no teacher notes: "; grep -c -F "teacherNotes" /tmp/fb4.html | head -1

echo "== teacher insights"
curl -s -b /tmp/cj_teacher1 "$H/experiences/$ID/insights" > /tmp/ins4.html
echo -n "insights page: "; code teacher1 /experiences/$ID/insights
echo -n "shows Submitted 1: "; grep -o "Submitted</dt><dd[^>]*>1" /tmp/ins4.html | head -1
echo -n "teacher2 insights: "; code teacher2 /experiences/$ID/insights
echo -n "teacher2 publish page: "; code teacher2 /experiences/$ID/publish
echo "== review: score a short answer"
$PSQL "select count(*) from \"Attempt\" where id='$TID' and \"submittedAt\" is not null and score is not null" | head -1

echo "== immutability: edit after publishing creates a new draft; the published snapshot is unchanged"
H1=$($PSQL "select md5(\"contentJson\"::text) from \"ExperienceVersion\" v join \"Assignment\" a on a.\"publishedVersionId\"=v.id where a.id='$AID'")
node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));const d=j.document;d.blocks[0].body+=' EDITED AFTER PUBLISH';console.log(JSON.stringify({baseVersion:j.version,doc:d}))" < /tmp/exp4.json > /tmp/edit4.json
curl -s -b /tmp/cj_teacher1 -X PUT -H 'content-type: application/json' --data-binary @/tmp/edit4.json "$H/api/experiences/$ID/draft" | cut -c1-60; echo
H2=$($PSQL "select md5(\"contentJson\"::text) from \"ExperienceVersion\" v join \"Assignment\" a on a.\"publishedVersionId\"=v.id where a.id='$AID'")
[ "$H1" = "$H2" ] && echo "published snapshot unchanged OK" || echo "PUBLISHED SNAPSHOT CHANGED"
echo -n "student still sees original text: "; curl -s -b /tmp/cj_student1 "$H/learn/$AID" | grep -c "EDITED AFTER PUBLISH" | head -1
