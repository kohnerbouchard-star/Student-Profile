import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadCountdown() {
  let now = 1_000_000;
  let timerId = 0;
  const intervals = new Map();
  const timeouts = new Map();
  const button = {
    disabled: false,
    getAttribute() {
      return null;
    },
  };
  const form = {
    querySelector(selector) {
      return selector === "button[type='submit']" ? button : null;
    },
  };
  const classes = new Set(["hidden"]);
  const node = {
    textContent: "",
    dataset: {},
    classList: {
      add(...values) {
        values.forEach((value) => classes.add(value));
      },
      remove(...values) {
        values.forEach((value) => classes.delete(value));
      },
    },
    closest(selector) {
      return selector === "form" ? form : selector === ".login-message" ? node : null;
    },
  };

  class FakeDate extends Date {
    static now() {
      return now;
    }
  }

  const runtime = {
    Econovaria: {},
    document: {
      readyState: "loading",
      addEventListener() {},
      querySelectorAll() {
        return [];
      },
      body: {},
    },
    setInterval(callback) {
      const id = ++timerId;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      const id = ++timerId;
      timeouts.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
  };

  const source = fs.readFileSync("frontend/src/core/login-retry-countdown.js", "utf8");
  vm.runInNewContext(source, {
    window: runtime,
    Date: FakeDate,
    MutationObserver: class {},
    Number,
    Math,
    String,
    Object,
    Set,
    WeakMap,
  });

  return {
    api: runtime.Econovaria.loginRetryCountdown,
    button,
    classes,
    intervals,
    node,
    setNow(value) {
      now = value;
    },
  };
}

test("retry countdown decrements and unlocks the form", () => {
  const fixture = loadCountdown();
  fixture.api.start(fixture.node, "Too many failed sign-in attempts.", 2);

  assert.equal(
    fixture.node.textContent,
    "Too many failed sign-in attempts. Try again in 2 seconds.",
  );
  assert.equal(fixture.button.disabled, true);
  assert.equal(fixture.classes.has("bad"), true);

  fixture.setNow(1_001_100);
  [...fixture.intervals.values()][0]();
  assert.equal(
    fixture.node.textContent,
    "Too many failed sign-in attempts. Try again in 1 second.",
  );

  fixture.setNow(1_002_100);
  [...fixture.intervals.values()][0]();
  assert.equal(fixture.node.textContent, "You can try signing in again now.");
  assert.equal(fixture.button.disabled, false);
  assert.equal(fixture.classes.has("bad"), false);
});

test("static Retry-After text is upgraded into a live countdown", () => {
  const fixture = loadCountdown();
  fixture.node.textContent =
    "Too many failed sign-in attempts. Try again in 5 seconds.";

  fixture.api.inspect(fixture.node);

  assert.equal(fixture.button.disabled, true);
  assert.equal(fixture.node.dataset.retryCountdownActive, "true");
  assert.equal(fixture.intervals.size, 1);
});

test("login surface statically loads MFA and countdown modules", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const apiIndex = html.indexOf('src="frontend/src/core/api.js"');
  const mfaIndex = html.indexOf('src="frontend/src/core/admin-mfa.js"');
  const loginIndex = html.indexOf('src="frontend/src/core/login.js"');
  const countdownIndex = html.indexOf(
    'src="frontend/src/core/login-retry-countdown.js"',
  );

  assert.ok(apiIndex >= 0);
  assert.ok(apiIndex < mfaIndex);
  assert.ok(mfaIndex < loginIndex);
  assert.ok(loginIndex < countdownIndex);
});
