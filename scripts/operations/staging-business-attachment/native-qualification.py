#!/usr/bin/env python3
"""Synthetic PostgreSQL 17, Unix socket only. No connection URL, secrets or network."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ORIGINAL = HERE.parent / "staging-inert-sidecar"
PIN = "abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312"
NODE = r"""
import {preflightSql,protectedSql,parseCommit,parsePreflight} from './scripts/operations/staging-business-attachment/sql.mjs';
import {readFileSync} from 'node:fs';
const i=JSON.parse(readFileSync(0,'utf8')), n=Date.now();
const req={action:i.action,maintenance:{startsAt:new Date(n-60000).toISOString(),endsAt:new Date(n+15*60000).toISOString()},
 ...(i.action==='detach-open'?{attach:{head:'a'.repeat(40),runId:'7001',receiptSha256:i.attachReceipt}}:{})};
const context={req,head:(i.action==='attach-open'?'a':'b').repeat(40),runId:i.action==='attach-open'?'7001':'7002'};
switch(i.mode){
  case 'pre':process.stdout.write(preflightSql(req));break;
  case 'operate':process.stdout.write(protectedSql(req,i.observed));break;
  case 'receipt':process.stdout.write(JSON.stringify(parseCommit(i.stdout,context,i.observed)));break;
  case 'reject-fake':parsePreflight(i.stdout,req);break;
  default:throw Error('invalid synthetic fixture mode');
}
"""


def evaluate(tools, work):
    path = os.defpath
    env = {"PATH": path, "HOME": str(work), "TZ": "UTC", "LC_ALL": "C"}
    pgdir = work / "pg"
    ctl = [str(tools / "pg_ctl"), "-D", str(pgdir)]
    psql = [str(tools / "psql"), "-XwqAt", "-v", "ON_ERROR_STOP=1", "-h", str(work), "-p", "55483",
            "-U", "postgres", "-d", "postgres", "-f", "-"]
    node = shutil.which("node")
    assert node
    inp = (ORIGINAL / "business/install-inert.sql").read_text()
    other = (ORIGINAL / "auth/original/install-inert.sql").read_text()
    policy = re.search(r"\$targets\$(.+?)\$targets\$;", inp, re.DOTALL)
    names = re.findall(r"^\s*\('([a-z_]+)',(?:true|false)\)[,;]?\s*$", policy[1], re.MULTILINE)
    assert len(names) == len(set(names)) == 23 and names == sorted(names)

    def proc(argv, script=None, timeout=25):
        return subprocess.run(argv, input=script, text=True, capture_output=True, timeout=timeout, env=env, cwd=ROOT)

    def checked(p, detail=""):
        if p.returncode:
            raise AssertionError(f"{detail} failed: {p.stderr}")
        return p.stdout.strip()

    def sql(script):
        return proc(psql, script)

    def get(script):
        return checked(sql(script), "synthetic SQL")

    def refuses(script, contains):
        p=sql(script)
        assert p.returncode and contains in p.stderr, (contains,p.stderr)

    def js(mode, action="attach-open", reject=False, **kwargs):
        p=proc([node,"--input-type=module","--eval",NODE], json.dumps({"mode":mode,"action":action,**kwargs}))
        if reject:
            assert p.returncode, "production receipt verifier accepted a synthetic receipt"
            return
        return checked(p,"adapter")

    checked(proc([str(tools/"initdb"), "-D", str(pgdir), "-U","postgres","-A","trust","--no-locale","-E","UTF8"]), "initdb")
    boot=proc(ctl+["-o", f"-c listen_addresses= -c unix_socket_directories={work} -c port=55483",
                  "-l",str(work/"postgres.log"),"-w","start"])
    if boot.returncode and (work/"postgres.log").is_file():
        raise AssertionError((work/"postgres.log").read_text()[-3000:])
    checked(boot, "start")
    try:
        assert get("show server_version;").startswith("17.")
        get("""create role anon;create role authenticated;create role service_role;
          create schema supabase_migrations;
          create table supabase_migrations.schema_migrations(version text);
          insert into supabase_migrations.schema_migrations select '20260101'||lpad(i::text,6,'0') from generate_series(1,467)i;
          insert into supabase_migrations.schema_migrations values('20260921044500');
          create schema auth;create schema private;create schema cron;
          create table cron.job(jobid bigint primary key,jobname text,active boolean,schedule text,database text,username text,command text);
          insert into cron.job values(1,'econovaria-autonomous-timed-services-v1',true,'* * * * *','postgres','postgres',
             'select * from public.run_due_autonomous_timed_services_v1(clock_timestamp());');
          create table public.fixture_unrelated(id integer);""" +
          "\n".join("create table public."+n+"(id int primary key"+
            (",seller_kind text not null" if n=="store_seller_offers" else "")+");" for n in names) +
          "grant insert,select,update,delete on all tables in schema public to service_role;")
        digest="""select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by version collate "C")::text,'UTF8')),'hex')
           from supabase_migrations.schema_migrations m;"""
        fixture=get(digest)
        assert fixture!=PIN and len(fixture)==64

        def bind(sql_text):
            # The only test override: replace the reviewed lineage digest
            # to obtain a synthetic PG fixture; never accepts an operator DSN.
            assert sql_text.count(PIN)>=1
            return sql_text.replace(PIN,fixture)

        def observe(action="attach-open"):
            out=get(bind(js("pre",action)))
            js("reject-fake",action,stdout=out,reject=True)
            return json.loads(out)

        def op(action, observed, receipt=None):
            return bind(js("operate",action,observed=observed,attachReceipt=receipt))

        get(bind(inp));get(bind(other))
        before=observe()
        prepared=op("attach-open",before)
        assert get("select attached or held from staging_economic_pause.scopes;")=="f"
        get("set role service_role;insert into public.loan_applications values(1);")
        get("create schema staging_campaign;")
        refuses(bind(js("pre")),"BUSINESS_BOUNDARY")
        get("drop schema staging_campaign;")
        get("update staging_app_auth_guard.control set deployment='eecvbssdvarfcykcfrny_00000000-0000-4000-8000-000000000001_99';")
        refuses(bind(js("pre")),"BUSINESS_PHASE_DRIFT")
        get("update staging_app_auth_guard.control set deployment=null;")
        get("update cron.job set active=false;")
        refuses(bind(js("pre")),"BUSINESS_PHASE_DRIFT")
        get("update cron.job set active=true;")
        get("alter table public.fixture_unrelated add column unexpected text;")
        refuses(prepared,"BUSINESS_OBSERVATION_DRIFT")
        get("alter table public.fixture_unrelated drop column unexpected;")
        changed="\nend $attach$;\nalter table public.fixture_unrelated add column unexpected text;\n"
        assert prepared.count("\nend $attach$;\n")==1
        refuses(prepared.replace("\nend $attach$;\n",changed),"BUSINESS_OUT_OF_SCOPE_DELTA")
        assert get("select exists(select 1 from pg_attribute where attrelid='public.fixture_unrelated'::regclass and attname='unexpected' and not attisdropped);")=="f"
        busy=subprocess.Popen(psql,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=ROOT,env=env)
        try:
            busy.stdin.write("begin; lock table public.loan_applications in row exclusive mode;\n\\echo LOCKED\n")
            busy.stdin.flush()
            assert busy.stdout.readline().strip()=="LOCKED"
            refuses(prepared,"lock timeout")
        finally:
            busy.stdin.write("rollback;\n");busy.stdin.close();busy.wait(timeout=8)
        assert observe()==before
        print("PASS guard refusal: Campaign, Auth state, cron witness, observed drift, same-transaction unexpected DDL and concurrent table timeout leave open/unattached epoch unchanged")

        output=get(prepared)
        first=json.loads(js("receipt",stdout=output,observed=before))
        assert first["attached"] and not first["held"] and first["guardCount"]==24
        after=observe("detach-open")
        assert before["epoch"]!=after["epoch"]
        assert {k:v for k,v in before.items() if k not in ("epoch","guardDigest")}=={k:v for k,v in after.items() if k not in ("epoch","guardDigest")}
        get("set role service_role;insert into public.loan_applications values(2);")
        refuses(prepared,"BUSINESS_PHASE_DRIFT")
        js("receipt",stdout=output.splitlines()[0],observed=before,reject=True)
        assert observe("detach-open")==after  # ambiguous marker is not replay
        print("PASS attach leaves writes open; exactly 24 guards and new receipt; stale repeat denied; lost marker resolved by read-only state")
        inverse=op("detach-open",after,first["receiptSha256"])
        get("alter table public.loan_applications disable trigger a00_staging_economic_guard;")
        refuses(bind(js("pre","detach-open")),"STAGING_ECONOMIC_TOPOLOGY_CHANGED")
        get("alter table public.loan_applications enable always trigger a00_staging_economic_guard;")
        repaired=observe("detach-open")
        assert repaired==after
        result=json.loads(js("receipt","detach-open",stdout=get(inverse),observed=after,attachReceipt=first["receiptSha256"]))
        assert not result["attached"] and not result["held"] and result["guardCount"]==0
        restored=observe()
        assert restored["epoch"] not in (before["epoch"],after["epoch"])
        assert {k:v for k,v in before.items() if k!='epoch'}=={k:v for k,v in restored.items() if k!='epoch'}
        assert len({first["receiptSha256"],result["receiptSha256"],first["priorReceipt"]})==3
        assert get(digest)==fixture and get("select count(*) from public.loan_applications;")=="2"
        print("PASS exact detach and distinct receipt with zero guards; original catalog/ledger, Auth, cron, and fixture application rows unchanged")
    finally:
        checked(proc(ctl+["-w","-m","fast","stop"]),"stop fixture")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pg_tools",type=Path)
    args=parser.parse_args()
    tools=args.pg_tools.resolve(strict=True)
    assert all((tools/b).is_file() for b in ("initdb","postgres","pg_ctl","psql"))
    with tempfile.TemporaryDirectory(prefix="econ-adapter-native-",dir="/tmp") as work:
        evaluate(tools,Path(work))
