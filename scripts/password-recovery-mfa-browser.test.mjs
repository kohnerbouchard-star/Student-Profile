import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { chromium } from "playwright";
const proxy = createRequire(import.meta.url)("../api/password-reset.js");
const project = "eecvbssdvarfcykcfrny";
const low = "header123.payload123.signature123", high = "header456.payload456.signature456";
const factor = `mfa1.${"a".repeat(16)}.${"b".repeat(80)}`;

test("disposable browser recovery: MFA, isolation, expiry, missing/lost factors and memory-only handoff", async () => {
  const originalFetch = globalThis.fetch;
  let mode = "valid", calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.ok(url.startsWith(`https://${project}.supabase.co/`), "no cross-project fallback");
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.endsWith("password-reset-api")) {
      return options.headers.Authorization === `Bearer ${high}`
        ? Response.json({ ok: true })
        : Response.json({ error: { code: "staff_mfa_required" } }, { status: 403 });
    }
    if (mode === "expired") return Response.json({ error: { code: "session_expired" } }, { status: 401 });
    if (url.endsWith("/verify")) {
      assert.equal(body.factorHandle, factor);
      return body.code === "123456" ? Response.json({ ok: true, session: {
        assuranceLevel: "aal2", accessToken: high, refreshToken: "must-not-reach-browser"
      } }) : Response.json({ error: { code: "mfa_verification_failed" } }, { status: 401 });
    }
    return Response.json({ ok: true, factors: mode === "missing" ? [] : [
      { handle: factor, friendlyName: "Recovery authenticator", factorType: "totp", status: "verified" }
    ] });
  };
  const server = createServer(async (req, res) => {
    if (req.url.startsWith("/api/password-reset")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      req.body = body;
      return proxy(req, res);
    }
    if (req.url === "/runtime-config.env.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(`window.EconovariaRuntimeConfig={projectRef:"${project}",passwordResetApiUrl:"/api/password-reset"};`);
    }
    if (req.url === "/frontend/src/core/runtime-config.js") return res.end("");
    if (!["/auth/reset-password.html", "/auth/reset-password.js", "/auth/reset-password.css"].includes(req.url)) {
      res.statusCode = 404; return res.end();
    }
    res.setHeader("Content-Type", req.url.endsWith(".js") ? "text/javascript" : req.url.endsWith(".css") ? "text/css" : "text/html");
    res.end(await readFile(`.${req.url}`));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route("**/*", route => route.request().url().startsWith(origin) &&
      !(mode === "offline" && route.request().url().includes("operation=mfa-status")) ? route.continue() : route.abort());
    const start = async (ref = project) => {
      calls = [];
      await page.goto("about:blank");
      await page.goto(`${origin}/auth/reset-password.html#access_token=${low}&type=recovery&project_ref=${ref}`);
      await page.locator("#resetPasswordForm").waitFor({ state: "visible" });
      assert.equal(new URL(page.url()).hash, "");
      await page.locator('[name="password"]').fill("SyntheticPassword123!");
      await page.locator('[name="confirmPassword"]').fill("SyntheticPassword123!");
      await page.getByRole("button", { name: "Update Password" }).click();
    };
    await start();
    await page.locator("#recoveryMfaForm").waitFor({ state: "visible" });
    assert.equal(await page.locator('[name="password"]').inputValue(), "");
    await page.locator('#recoveryMfaForm [name="code"]').fill("000000");
    await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
    await page.getByText("The authenticator code is invalid or expired.", { exact: true }).waitFor();
    await page.locator('#recoveryMfaForm [name="code"]').fill("123456");
    await page.getByRole("button", { name: "Verify authenticator", exact: true }).click();
    await page.getByText("Authenticator verified. Choose your new password.", { exact: true }).waitFor();
    assert.equal(calls.filter(c => c.url.endsWith("password-reset-api")).length, 1, "no automatic password submission");
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.locator('[name="password"]').fill("SyntheticPassword456!");
    await page.locator('[name="confirmPassword"]').fill("SyntheticPassword456!");
    await page.getByRole("button", { name: "Update Password" }).click();
    await page.getByText(/Password updated and existing administrator sessions revoked/).waitFor();
    assert.equal(calls.at(-1).options.headers.Authorization, `Bearer ${high}`);
    for (const scenario of ["missing", "expired", "lost", "offline"]) {
      mode = scenario;
      await start();
      if (scenario === "lost") {
        await page.getByRole("button", { name: "I can’t access this authenticator" }).click();
      }
      await page.getByText(scenario === "expired" ? /Recovery expired/ : /Contact your administrator/).waitFor();
      assert.equal(await page.locator("#resetPasswordForm").isVisible(), false);
      assert.equal(await page.locator("#recoveryMfaForm").isVisible(), false);
    }
    mode = "valid";
    await start();
    await page.locator("#recoveryMfaForm").waitFor({ state: "visible" });
    const count = calls.length;
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.evaluate(() => document.getElementById("recoveryMfaForm").dispatchEvent(new Event("submit", { cancelable: true })));
    assert.equal(calls.length, count, "discarded token cannot initiate verification");
    await page.goto("about:blank");
    await page.goto(`${origin}/auth/reset-password.html#access_token=${low}&type=recovery&project_ref=wrongproject`);
    await page.getByText(/invalid or has expired/).waitFor();
    assert.equal(calls.length, count);
  } finally {
    globalThis.fetch = originalFetch;
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

for (const project of ["eecvbssdvarfcykcfrny","cgiukdjwicykrmtkhudh"]) test(`system-approved ${project} recovery enrolls exact primary and backup before password`, async () => {
  const priorUrl=process.env.ECONOVARIA_SUPABASE_URL,priorKey=process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;
  process.env.ECONOVARIA_SUPABASE_URL=`https://${project}.supabase.co`;
  process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY="sb_publishable_disposable_recovery_fixture";
  const originalFetch=globalThis.fetch;
  const calls=[];
  let enrolled=0,verified=0;
  globalThis.fetch=async(url,options)=>{
    assert.ok(url.startsWith(`https://${project}.supabase.co/`));
    const body=JSON.parse(options.body||'{}');
    calls.push({url,body});
    if(url.endsWith('/auth/v1/verify')) return Response.json({access_token:low});
    assert.equal(body.grant,'g'.repeat(43));
    if(url.endsWith('/claim')) return Response.json({ok:true,primaryVerified:false,backupVerified:false});
    if(url.endsWith('/enroll')) {
      assert.equal(body.slot,enrolled===0?'primary':'backup');
      assert.equal(verified,enrolled);
      enrolled++;
      return Response.json({ok:true,factor:{handle:factor,qrCode:'data:image/svg+xml;base64,PHN2Zy8+',secret:'A'.repeat(32)}});
    }
    if(url.endsWith('/verify')) {
      assert.equal(body.factorHandle,factor);
      assert.equal(body.slot,verified===0?'primary':'backup');
      if(body.code!=='123456') return Response.json({error:{code:'mfa_verification_failed'}},{status:401});
      verified++;
      return Response.json({ok:true,accessToken:high});
    }
    assert.ok(url.endsWith('password-reset-api'));
    assert.equal(verified,2);
    assert.equal(body.password,'SyntheticPassword456!');
    return Response.json({ok:true,passwordReset:true,sessionsRevoked:true});
  };
  const server=createServer(async(req,res)=>{
    if(req.url.startsWith('/api/password-reset')) {
      let body='';for await(const chunk of req)body+=chunk;req.body=body;return proxy(req,res);
    }
    if(req.url==='/runtime-config.env.js')return res.end(`window.EconovariaRuntimeConfig={projectRef:"${project}",passwordResetApiUrl:"/api/password-reset"};`);
    if(req.url==='/frontend/src/core/runtime-config.js')return res.end('');
    try {res.end(await readFile(new URL(`../${req.url.split('?')[0].slice(1)}`,import.meta.url)));}
    catch {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try {
    const page=await browser.newPage();
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.goto(`${origin}/auth/reset-password.html#recovery_grant=${'g'.repeat(43)}&token_hash=${'t'.repeat(32)}&type=recovery&project_ref=${project}`);
    assert.equal(new URL(page.url()).hash,'');
    assert.equal(calls.length,0,'email scanners do not consume the link');
    await page.getByRole('button',{name:'Continue approved account recovery'}).click();
    for(let i=0;i<2;i++) {
      await page.locator('#systemRecoveryForm').waitFor({state:'visible'});
      await page.locator('#systemRecoveryForm [name="code"]').fill('123456');
      await page.getByRole('button',{name:'Verify replacement authenticator'}).click();
      if(i===0)await page.getByText(/separate backup factor/).waitFor();
    }
    await page.getByText('Both authenticators verified. Choose your new password.').waitFor();
    assert.equal(await page.locator('#systemRecoverySecret').textContent(),'');
    assert.equal(calls.filter(c=>c.url.endsWith('password-reset-api')).length,0);
    await page.locator('[name="password"]').fill('SyntheticPassword456!');
    await page.locator('[name="confirmPassword"]').fill('SyntheticPassword456!');
    await page.getByRole('button',{name:'Update Password'}).click();
    await page.getByText(/Password updated and existing administrator sessions revoked/).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    assert.equal(verified,2);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;
    if(priorUrl===undefined)delete process.env.ECONOVARIA_SUPABASE_URL;else process.env.ECONOVARIA_SUPABASE_URL=priorUrl;
    if(priorKey===undefined)delete process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY;else process.env.ECONOVARIA_SUPABASE_PUBLISHABLE_KEY=priorKey;
  }
});
