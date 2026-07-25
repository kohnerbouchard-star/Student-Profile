import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const INDEX = new URL("../admin/index.html", import.meta.url);
const CSS = new URL("../admin/css/admin-scroll-integrity.css", import.meta.url);

const [index, css] = await Promise.all([
  readFile(INDEX, "utf8"),
  readFile(CSS, "utf8"),
]);

test("desktop Admin shell has one right-side page scroller", () => {
  assert.match(index, /admin-scroll-integrity\.css/);
  assert.match(css, /@media \(min-width: 1101px\)/);
  assert.match(css, /html,[\s\S]*body[\s\S]*overflow:\s*hidden/);
  assert.match(css, /body\s*\{[\s\S]*box-sizing:\s*border-box[\s\S]*height:\s*100dvh/);
  assert.match(css, /#adminPreview\s*\{[\s\S]*height:\s*calc\(100dvh - 48px\)[\s\S]*max-height:\s*calc\(100dvh - 48px\)/);
  assert.match(css, /\.admin-terminal-left-menu[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.admin-terminal-shell-main:not\(\.admin-shape-skeleton-stage\)[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.admin-terminal-shell-main:not\(\.admin-shape-skeleton-stage\)[\s\S]*overscroll-behavior-y:\s*contain/);
  assert.match(css, /\.econovaria-admin-game-session-card[\s\S]*align-self:\s*end/);
});

test("page skeleton reserves one gutter without becoming the scroll owner", () => {
  assert.match(css, /\.admin-terminal-shell-main:not\(\.admin-shape-skeleton-stage\) > \.admin-qol-page-skeleton\[data-admin-shape-skeleton="page"\][\s\S]*overflow-y:\s*scroll/);
  assert.match(css, /\.admin-terminal-shell-main:not\(\.admin-shape-skeleton-stage\) > \.admin-qol-page-skeleton\[data-admin-shape-skeleton="page"\][\s\S]*scrollbar-color:\s*transparent transparent/);
  assert.match(css, /\.admin-qol-page-skeleton\[data-admin-shape-skeleton="page"\]::-webkit-scrollbar[\s\S]*width:\s*8px/);
  assert.doesNotMatch(css, /(?:^|\n)\s*\.admin-terminal-shell-main\s*\{[\s\S]*?scrollbar-gutter:/);
});

test("Player dossier owns one bounded tab-panel scroller", () => {
  assert.match(css, /\.admin-terminal-player-dossier-v296[\s\S]*max-height:/);
  assert.match(css, /\.admin-terminal-player-dossier-v296[\s\S]*overflow:\s*hidden/);
  assert.match(css, /\.admin-terminal-player-drawer-tabs-v301[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-terminal-player-tab-panels-v301[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.admin-terminal-player-tab-panels-v301[\s\S]*overscroll-behavior:\s*contain/);
});

test("specialized Player modal never clips inaccessible fields", () => {
  assert.match(css, /\.admin-terminal-modal\.is-player-modal \.admin-terminal-player-form[\s\S]*min-height:\s*0/);
  assert.match(css, /\.admin-terminal-modal\.is-player-modal \.admin-terminal-player-main,[\s\S]*\.admin-terminal-player-access[\s\S]*overflow-y:\s*auto\s*!important/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.admin-terminal-player-container[\s\S]*overflow-y:\s*auto\s*!important/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.admin-terminal-player-main,[\s\S]*\.admin-terminal-player-access[\s\S]*overflow:\s*visible\s*!important/);
});
