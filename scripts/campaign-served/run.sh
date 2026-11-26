#!/usr/bin/env bash
set -euo pipefail
umask 077
STAGE=preflight
trap 'echo "{\"status\":\"FAILED\",\"stage\":\"$STAGE\"}"' ERR
cd "$(git rev-parse --show-toplevel)"
test "${GITHUB_ACTIONS:-}" = true
test "${GITHUB_EVENT_NAME:-}" = pull_request
test "$(git rev-parse HEAD)" = "${CAMPAIGN_HEAD_SHA:?missing PR head}"
test "$(node -p 'require("./package.json").devDependencies.supabase')" = 2.109.1
test "$(./node_modules/.bin/supabase --version)" = 2.109.1
test "$(docker context inspect --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock
test -z "$(git diff b62f10ffda169fd6f884cc3a254c136fbd6b862d -- backend/src backend/supabase/functions backend/supabase/config.toml)"
test -z "$(docker ps -aq --filter label=com.supabase.cli.project=econovaria)"
WORK="$(mktemp -d "$RUNNER_TEMP/campaign-served.XXXXXXXX")"
export WORK
RUNTIME_ID=''
CONTROL_ID=''
NETWORK_ID=''
STACK_STARTED=0
remove_owned_container() {
  local id="$1"
  docker container inspect "$id" >/dev/null 2>&1 || return 0
  test "$(docker inspect --format '{{index .Config.Labels "campaign-ci-owner"}}' "$id")" = "$OWNER" || return 1
  docker rm --force "$id" >/dev/null
}
OWNER="$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
cleanup() {
  result=$?
  trap - EXIT
  if test -n "$CONTROL_ID"; then remove_owned_container "$CONTROL_ID" || result=1; fi
  if test -n "$RUNTIME_ID"; then remove_owned_container "$RUNTIME_ID" || result=1; fi
  if test "$STACK_STARTED" = 1; then
    ./node_modules/.bin/supabase stop --workdir backend --no-backup >"$WORK/stop.private" 2>&1 || result=1
  fi
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
# The official archive loader is the acceptance path. Exercise identical
# commands on tiny no-network controls and record extractor exit separately.
STAGE=native-controls
CONTROL_SRC="$WORK/control-source"
CONTROL_OUT="$WORK/control-output"
mkdir -p "$CONTROL_SRC"/{no-import,local-import/fixture} "$CONTROL_OUT"
cat >"$CONTROL_SRC/deno.json" <<'JSON'
{
  "imports": {
    "https://campaign-fixture.invalid/value.ts": "./local-import/fixture/value.ts"
  },
  "scopes": {
    "./local-import/fixture/value.ts": {
      "https://campaign-fixture.invalid/leaf.ts": "./local-import/fixture/leaf.ts"
    }
  }
}
JSON
cat >"$CONTROL_SRC/no-import/index.ts" <<'TS'
Deno.serve(() => new Response("campaign-control-no-import"));
TS
cat >"$CONTROL_SRC/local-import/index.ts" <<'TS'
import { value } from "https://campaign-fixture.invalid/value.ts";
Deno.serve(() => new Response(value));
TS
cat >"$CONTROL_SRC/local-import/fixture/value.ts" <<'TS'
import { leaf } from "https://campaign-fixture.invalid/leaf.ts";
export const value = "campaign-control-" + leaf;
TS
cat >"$CONTROL_SRC/local-import/fixture/leaf.ts" <<'TS'
export const leaf = "local-import";
TS

RUNTIME_DOCKER=(--pull never --platform linux/amd64 --user "$(id -u):$(id -g)" --cap-drop ALL
  --security-opt no-new-privileges --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m
  -e DENO_DIR=/tmp/deno)

for control in no-import local-import; do
  STAGE="native-control-bundle-$control"
  docker run --rm "${RUNTIME_DOCKER[@]}" --network none --workdir /src \
    -v "$CONTROL_SRC:/src:ro" -v "$CONTROL_OUT:/out:rw" "$IMAGE_ID" bundle \
    --entrypoint "/src/$control/index.ts" --timeout 45 --output "/out/$control.eszip" \
    >"$WORK/control-$control.bundle.private" 2>&1
  test -s "$CONTROL_OUT/$control.eszip"

  STAGE="native-control-unbundle-$control"
  mkdir "$WORK/extracted-$control"
  extractor_exit=0
  timeout 20s docker run --rm "${RUNTIME_DOCKER[@]}" --network none \
    -v "$CONTROL_OUT:/artifact:ro" -v "$WORK/extracted-$control:/out:rw" \
    "$IMAGE_ID" unbundle --eszip "/artifact/$control.eszip" --output /out \
    >"$WORK/control-$control.unbundle.private" 2>&1 || extractor_exit=$?
  extractor_kind=returned
  if grep -q 'panicked at' "$WORK/control-$control.unbundle.private"; then
    extractor_kind=rust-panic
  fi
  printf '{"stage":"native-control-unbundle","control":"%s","exit":%d,"kind":"%s"}\n' \
    "$control" "$extractor_exit" "$extractor_kind"

  STAGE="native-control-serve-$control"
  CONTROL_ID="$(docker create "${RUNTIME_DOCKER[@]}" --network none \
    --label "campaign-ci-owner=$OWNER" -v "$CONTROL_OUT:/artifact:ro" \
    "$IMAGE_ID" start --main-service "/artifact/$control.eszip" --port 9000)"
  test "$(docker inspect --format '{{index .Config.Labels "campaign-ci-owner"}}' "$CONTROL_ID")" = "$OWNER"
  test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$CONTROL_ID")" = none
  docker start "$CONTROL_ID" >/dev/null
  control_ready=0
  for attempt in {1..15}; do
    if response="$(timeout 3s docker exec "$CONTROL_ID" /bin/bash -c \
      'exec 3<>/dev/tcp/127.0.0.1/9000; printf "GET / HTTP/1.0\\r\\n\\r\\n" >&3; cat <&3' \
      2>"$WORK/control-$control.http.private")" &&
      [[ "$response" == HTTP/1.*' 200 '*$'\r\n\r\n'"campaign-control-$control" ]]; then
      control_ready=1
      break
    fi
    if test "$(docker inspect --format '{{.State.Running}}' "$CONTROL_ID")" = false; then break; fi
    sleep 1
  done
  if test "$control_ready" != 1; then
    docker logs "$CONTROL_ID" >"$WORK/control-$control.runtime.private" 2>&1 || true
    node - "$control" <<'NODE'
const fs = require('node:fs');
const control = process.argv[2];
const log = fs.readFileSync(process.env.WORK + '/control-' + control + '.runtime.private', 'utf8');
const kind = /Module not found|failed to load/i.test(log) ? 'module-loading' : 'unexpected-http';
console.log(JSON.stringify({status: 'FAILED', stage: 'native-control-serve', control, kind}));
NODE
    exit 1
  fi
  remove_owned_container "$CONTROL_ID"
  CONTROL_ID=''
  printf '{"status":"PASS","stage":"native-control-serve","control":"%s"}\n' "$control"
done

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
if ! node scripts/campaign-served/vendor.mjs "$WORK/graph.json" backend/supabase/functions/deno.lock "$WORK/deps" >"$WORK/vendor.json"; then
  cat "$WORK/vendor.json"
  exit 1
fi
STAGE=vendor-readability
mkdir -p backend/supabase/functions/campaign-orchestrator/ci_vendor "$WORK/bundle"
SDK_HASH="$(node -p 'JSON.parse(require("fs").readFileSync("./backend/supabase/functions/deno.lock","utf8")).remote["https://esm.sh/@supabase/supabase-js@2.108.2"]')"
READ_HASH="$(docker run --rm --pull never --network none --user "$(id -u):$(id -g)" --cap-drop ALL --read-only -v "$WORK/deps:/deps:ro" --entrypoint /bin/sh "$IMAGE_ID" -c "test -r /deps/$SDK_HASH.ts && sha256sum /deps/$SDK_HASH.ts")"
test "${READ_HASH%% *}" = "$SDK_HASH"
echo '{"status":"PASS","stage":"vendor-readability","actualContainerUid":true}'
STAGE=native-provider-package
if ! docker run --rm "${RUNTIME_DOCKER[@]}" --network none --workdir /src/backend \
  -v "$PWD:/src:ro" \
  -v "$WORK/deps:/src/backend/supabase/functions/campaign-orchestrator/ci_vendor:ro" \
  -v "$WORK/deps/runtime-deno.json:/src/backend/supabase/functions/campaign-orchestrator/deno.json:ro" \
  -v "$WORK/bundle:/out:rw" "$IMAGE_ID" bundle \
  --entrypoint /src/backend/supabase/functions/campaign-orchestrator/index.ts \
  --timeout 45 --output /out/campaign.eszip >"$WORK/bundle.private" 2>&1; then
 node - <<'NODE'
const fs=require('fs'),s=fs.readFileSync(process.env.WORK+'/bundle.private','utf8');
console.log(JSON.stringify({status:'FAILED',stage:'native-provider-package',syntheticStartupDiagnostic:s.split('\n').filter(l=>/error|caused by|not found|failed|specifier/i.test(l)).slice(-8).join('\n').slice(0,1800)}));
NODE
 exit 1
fi
test -s "$WORK/bundle/campaign.eszip"
sha256sum "$WORK/bundle/campaign.eszip" | awk '{print "{\"status\":\"PASS\",\"stage\":\"native-provider-package\",\"artifactSha256\":\"" $1 "\"}"}'
STAGE=disposable-start
STACK_STARTED=1
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
RUNTIME_ID="$(docker create "${RUNTIME_DOCKER[@]}" --network "$NETWORK_ID" \
  --label "campaign-ci-owner=$OWNER" --env-file "$WORK/runtime.env" \
  -v "$WORK/bundle:/artifact:ro" "$IMAGE_ID" start --main-service /artifact/campaign.eszip --port 9000)"
docker start "$RUNTIME_ID" >/dev/null
export RUNTIME_CONTAINER_ID="$RUNTIME_ID"
export DATABASE_CONTAINER_ID="$(docker inspect --format '{{.Id}}' supabase_db_econovaria)"
if ! node - <<'NODE'
const {execFileSync}=require('child_process');
const c=JSON.parse(execFileSync('docker',['inspect',process.env.RUNTIME_CONTAINER_ID],{encoding:'utf8'}))[0];
if(c.Config.Labels['campaign-ci-owner']!==process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT)throw Error('OWNER');
const nets=Object.values(c.NetworkSettings.Networks);if(nets.length!==1||nets[0].NetworkID!==process.env.NETWORK_ID)throw Error('NETWORK');
const ip=nets[0].IPAddress;if(!/^172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+$/.test(ip))throw Error('PRIVATE_IP');
(async()=>{for(let i=0;i<30;i++){try{const r=await fetch('http://'+ip+':9000/',{redirect:'error',signal:AbortSignal.timeout(2000)});if(r.status===405)return;}catch{}await new Promise(r=>setTimeout(r,1000));}process.exitCode=1;})();
NODE
then
  docker logs "$RUNTIME_ID" >"$WORK/runtime.private" 2>&1 || true
  node - <<'NODE'
const fs=require('fs'),s=fs.readFileSync(process.env.WORK+'/runtime.private','utf8').toLowerCase();
const kind=s.includes('unexpected argument')||s.includes('unrecognized')?'runtime-cli':s.includes('permission denied')?'filesystem-permission':s.includes('module not found')||s.includes('failed to load')?'module-loading':s.includes('read-only')?'readonly-filesystem':'runtime-unready';
let diagnostic=fs.readFileSync(process.env.WORK+'/runtime.private','utf8');
for(const line of fs.readFileSync(process.env.WORK+'/runtime.env','utf8').split('\n')){const i=line.indexOf('=');if(i>0){const value=line.slice(i+1);if(value.length>8)diagnostic=diagnostic.split(value).join('[local-fixture-value]');}}
diagnostic=diagnostic.split('\n').filter(l=>/error|caused by|not found|failed|relative import|unsupported|specifier/i.test(l)).slice(-8).join('\n').slice(0,1800);
console.log(JSON.stringify({status:'FAILED',stage:'served-runtime',kind,syntheticStartupDiagnostic:diagnostic}));
NODE
  exit 1
fi
STAGE=acceptance
CAMPAIGN_DISPOSABLE=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/campaign-served/acceptance.mjs
node -e 'console.log(JSON.stringify({source:process.env.CAMPAIGN_HEAD_SHA,officialIndex:"'"$INDEX"'",amd64Child:"'"$CHILD"'",imageId:"'"$IMAGE_ID"'",hostedModified:false,providerBundleAttested:false}))'
