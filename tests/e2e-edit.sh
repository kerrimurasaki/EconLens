#!/usr/bin/env bash
# Manual edit/regenerate/restore smoke flow. Run after tests/e2e-api.sh (uses the experience id it saved).
set -u
H=http://localhost:3000
ID=$(cat /tmp/expid3)
J=/tmp/cj_teacher1
get() { curl -s -b $J "$H/api/experiences/$ID/export"; }
put() { curl -s -b $J -X PUT -H 'content-type: application/json' --data-binary @- "$H/api/experiences/$ID/draft"; echo; }
post() { curl -s -b $J -X POST -H 'content-type: application/json' --data-binary @- "$H$1"; echo; }

get > export_tmp.json
node -e "
const j=JSON.parse(require('fs').readFileSync('export_tmp.json','utf8'));const d=j.document;
console.log('export ok: version',j.version,'blocks',d.blocks.length,'minutes',d.blocks.reduce((a,b)=>a+b.minutes,0),'/',d.durationMinutes);
const e=d.blocks.findIndex(b=>b.type==='EXPLAINER');
d.blocks[e].body+='\n\nTEACHER EDIT: extra example.';
require('fs').writeFileSync('edit_tmp.json',JSON.stringify({baseVersion:j.version,doc:d}));
require('fs').writeFileSync('ids_tmp.txt',d.blocks[e].id+' '+d.blocks[0].id);
"
echo "== save edit (expect version 2, edited flag set server-side)"
put < edit_tmp.json | cut -c1-120
echo "== stale save (expect CONFLICT)"
put < edit_tmp.json | cut -c1-200
set -- $(cat ids_tmp.txt); EXP_BLOCK=$1; OTHER=$2
echo "== regenerate edited block without confirm (expect CONFIRMATION_REQUIRED)"
echo '{"baseVersion":2}' | post /api/experiences/$ID/blocks/$EXP_BLOCK/regenerate
get > before_tmp.json
echo "== regenerate with confirm"
echo '{"baseVersion":2,"confirmOverwrite":true,"instruction":"make it easier"}' | post /api/experiences/$ID/blocks/$EXP_BLOCK/regenerate | cut -c1-160
get > after_tmp.json
node -e "
const b=JSON.parse(require('fs').readFileSync('before_tmp.json','utf8')).document, a=JSON.parse(require('fs').readFileSync('after_tmp.json','utf8')).document;
const v=JSON.parse(require('fs').readFileSync('after_tmp.json','utf8')).version;
let same=0,diff=[];a.blocks.forEach((x,i)=>{ if(JSON.stringify(x)===JSON.stringify(b.blocks[i])) same++; else diff.push(x.title+' ('+x.type+')');});
console.log('version now',v,'| blocks unchanged:',same,'of',a.blocks.length,'| changed:',diff.join(', '));
console.log('edit text gone:', !a.blocks.find(x=>x.id==='$EXP_BLOCK').body.includes('TEACHER EDIT'));
"
echo "== regenerate a block that was NOT edited (no confirm needed)"
echo '{"baseVersion":3}' | post /api/experiences/$ID/blocks/$OTHER/regenerate | cut -c1-120
echo "== restore version 2 (the teacher edit)"
echo '{"baseVersion":4,"versionNumber":2}' | post /api/experiences/$ID/restore | cut -c1-120
get | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('after restore: version',j.version,'| has teacher edit:',j.document.blocks.some(b=>b.body.includes('TEACHER EDIT')))"
echo "== validate"
curl -s -b $J -X POST "$H/api/experiences/$ID/validate" | cut -c1-200; echo
echo "== derived rows in DB (latest version)"
docker compose exec -T db psql -U econlens -d econlens -At -c "select (select count(*) from \"ExperienceBlock\" b where b.\"experienceVersionId\"=e.\"currentVersionId\") blocks, (select count(*) from \"AssessmentItem\" i where i.\"experienceVersionId\"=e.\"currentVersionId\") items, (select count(*) from \"ExperienceVersion\" v where v.\"experienceId\"=e.id) versions from \"Experience\" e where e.id='$ID'"
rm -f export_tmp.json edit_tmp.json before_tmp.json after_tmp.json ids_tmp.txt
