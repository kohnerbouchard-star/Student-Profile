#!/usr/bin/env bash
set -euo pipefail
umask 077
STAGE=preflight
trap 'echo "{\"status\":\"FAILED\",\"stage\":\"$STAGE\"}"' ERR
cd "$(git rev-parse --show-toplevel)"
test "${GITHUB_ACTIONS:-}" = true
test "${GITHUB_EVENT_NAME:-}" = pull_request
test "$(node -p 'require("./package.json").devDependencies.supabase')" = 2.109.1
test "$(./node_modules/.bin/supabase --version)" = 2.109.1
test "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock
test -z "$(git diff b62f10ffda169fd6f884cc3a254c136fbd6b862d -- backend/src backend/supabase/functions backend/supabase/config.toml)"
test -z "$(docker ps -aq --filter label=com.supabase.cli.project=econovaria)"
WORK="$(mktemp -d "$RUNNER_TEMP/campaign-served.XXXXXXXX")"
export WORK
RUNTIME_ID=''
NETWORK_ID=''
cleanup() {
  result=$?
  trap - EXIT
  if test -n "$RUNTIME_ID"; then
    if docker container inspect "$RUNTIME_ID" >/dev/null 2>&1; then
      test "$(docker inspect --format '{{index .Config.Labels "campaign-ci-owner"}}' "$RUNTIME_ID")" = "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" || exit 1
      docker stop --time 5 "$RUNTIME_ID" >/dev/null || result=1
      docker rm "$RUNTIME_ID" >/dev/null || result=1
    fi
  fi
  ./node_modules/.bin/supabase stop --workdir backend --no-backup >"$WORK/stop.private" 2>&1 || result=1
  if test -n "$NETWORK_ID"; then docker network rm "$NETWORK_ID" >/dev/null || result=1; fi
  rm -rf "$WORK"
  exit "$result"
}
trap cleanup EXIT
STAGE=oci-index
INDEX='sha256:a82676277615aee03c4f288cbbbf68dedb5ba8693073e567ab8dbfdd11ba5d45'
IMAGE="ghcr.io/supabase/edge-runtime@$INDEX"
docker buildx imagetools inspect --raw "$IMAGE" >"$WORK/index.json"
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto');
const p=process.env.WORK;
const b=fs.readFileSync(p+'/index.json');const digest='sha256:'+crypto.createHash('sha256').update(b).digest('hex');
if(digest!=='sha256:a82676277615aee03c4f288cbbbf68dedb5ba8693073e567ab8dbfdd11ba5d45')throw Error('INDEX_DIGEST');
const matches=JSON.parse(b).manifests.filter(x=>x.platform?.os==='linux'&&x.platform?.architecture==='amd64');
if(matches.length!==1||!/^sha256:[a-f0-9]{64}$/.test(matches[0].digest))throw Error('AMD64_CHILD');
fs.writeFileSync(p+'/child.digest',matches[0].digest);
NODE
CHILD="$(cat "$WORK/child.digest")"
docker buildx imagetools inspect --raw "ghcr.io/supabase/edge-runtime@$CHILD" >"$WORK/child.json"
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),p=process.env.WORK,b=fs.readFileSync(p+'/child.json');
if('sha256:'+crypto.createHash('sha256').update(b).digest('hex')!==fs.readFileSync(p+'/child.digest','utf8'))throw Error('CHILD_DIGEST');
fs.writeFileSync(p+'/config.digest',JSON.parse(b).config.digest);
NODE
STAGE=runtime-image
docker pull --platform linux/amd64 "ghcr.io/supabase/edge-runtime@$CHILD" >"$WORK/pull.private" 2>&1
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "ghcr.io/supabase/edge-runtime@$CHILD")"
test "$IMAGE_ID" = "$(cat "$WORK/config.digest")"
test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_ID")" = linux/amd64
# Deno resolves and verifies the existing frozen lock; it never invokes a standalone bundler.
STAGE=frozen-dependencies
if ! DENO_DIR="$WORK/deno" deno info --json --config backend/supabase/functions/campaign-orchestrator/deno.json --lock backend/supabase/functions/deno.lock --frozen backend/supabase/functions/campaign-orchestrator/index.ts >"$WORK/graph.json" 2>"$WORK/cache.private"; then
  node - <<'NODE'
const fs=require('fs'),s=fs.readFileSync(process.env.WORK+'/cache.private','utf8').toLowerCase();
const kind=s.includes('unexpected argument')?'argument':s.includes('certificate')?'tls':s.includes('lockfile')||s.includes('integrity')?'frozen-integrity':s.includes('429')?'rate-limit':s.includes('404')?'module-not-found':s.includes('timed out')?'network-timeout':s.includes('error sending request')?'request-transport':'unclassified';
console.log(JSON.stringify({status:'FAILED',stage:'frozen-dependencies',kind}));
NODE
  exit 1
fi
node scripts/campaign-served/vendor.mjs "$WORK/graph.json" backend/supabase/functions/deno.lock "$WORK/deps" >"$WORK/vendor.json"
STAGE=disposable-start
./node_modules/.bin/supabase start --workdir backend --exclude studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,mailpit >"$WORK/start.private" 2>&1
STAGE=disposable-replay
./node_modules/.bin/supabase db reset --workdir backend --local >"$WORK/reset.private" 2>&1
./node_modules/.bin/supabase status --workdir backend -o env >"$WORK/local.env" 2>"$WORK/status.private"
# Fresh exclusive GitHub runner; transfer only inspected project-owned IDs/aliases
# to a private bridge before any worker starts. No hosted route remains.
STAGE=network-isolation
NETWORK_ID="$(docker network create --internal --label "campaign-ci-owner=$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" "campaign-ci-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")"
export NETWORK_ID
node - <<'NODE'
const {execFileSync}=require('child_process'),fs=require('fs');
const run=(...a)=>execFileSync('docker',a,{encoding:'utf8'}).trim();
const ids=run('ps','--filter','label=com.supabase.cli.project=econovaria','--format','{{.ID}}').split('\n').filter(Boolean);
if(ids.length<3)throw Error('MISSING_LOCAL_STACK');
for(const id of ids){const c=JSON.parse(run('inspect',id))[0];if(c.Config.Labels['com.supabase.cli.project']!=='econovaria')throw Error('FOREIGN_CONTAINER');
 for(const [name,net] of Object.entries(c.NetworkSettings.Networks)){
 const args=['network','connect'];for(const alias of new Set([c.Name.slice(1),...(net.Aliases||[])]))args.push('--alias',alias);
 run(...args,process.env.NETWORK_ID,c.Id);run('network','disconnect',name,c.Id);
 }}
const env=Object.fromEntries(fs.readFileSync(process.env.WORK+'/local.env','utf8').split('\n').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')]}));
if(env.API_URL!=='http://127.0.0.1:54321'||!(env.SERVICE_ROLE_KEY||env.SECRET_KEY))throw Error('LOCAL_CREDENTIALS');
fs.writeFileSync(process.env.WORK+'/runtime.env','SUPABASE_URL=http://supabase_kong_econovaria:8000\nSUPABASE_SERVICE_ROLE_KEY='+(env.SERVICE_ROLE_KEY||env.SECRET_KEY)+'\n');
NODE
STAGE=served-runtime
RUNTIME_ID="$(docker create --pull never --platform linux/amd64 --network "$NETWORK_ID" --cap-drop ALL --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m --label "campaign-ci-owner=$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" -p 127.0.0.1:9091:9000 -e DENO_DIR=/tmp/deno --env-file "$WORK/runtime.env" -v "$PWD:/src:ro" -v "$WORK/deps:/deps:ro" "$IMAGE_ID" start --main-service /src/backend/supabase/functions/campaign-orchestrator --import-map /deps/import-map.json --port 9000)"
docker start "$RUNTIME_ID" >/dev/null
for attempt in $(seq 1 30); do
  if test "$(curl --silent --max-time 2 --output /dev/null --write-out '%{http_code}' http://127.0.0.1:9091/ || true)" = 405; then break; fi
  sleep 1
done
STAGE=acceptance
CAMPAIGN_DISPOSABLE=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/campaign-served/acceptance.mjs
node -e 'console.log(JSON.stringify({source:process.env.GITHUB_SHA,officialIndex:"'"$INDEX"'",amd64Child:"'"$CHILD"'",imageId:"'"$IMAGE_ID"'",hostedModified:false,providerBundleAttested:false}))'
