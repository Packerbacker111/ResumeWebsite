const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

class Element {
  constructor() { this.value = ""; this.attributes = {}; this.events = {}; this.dataset = {}; this.disabled = false; this.hidden = false; this.textContent = ""; this.classList = { toggle() {} }; }
  addEventListener(name, fn) { (this.events[name] ??= []).push(fn); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  toggleAttribute(name, value) { if (value) this.setAttribute(name, ""); else this.removeAttribute(name); }
  fire(name) { if (name === "click" && this.disabled) return; for (const fn of this.events[name] ?? []) fn(); }
  focus() { this.focused = true; }
}
function fixture(page, script = "field-lab.js") {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const nodes = Array.from({ length: 4 }, () => new Element());
  const perspectives = ["defender", "attacker"].map(value => { const el = new Element(); el.dataset.perspective = value; return el; });
  const tour = Array.from({ length: 4 }, () => new Element());
  const document = new Element();
  document.getElementById = id => elements[id] ?? null;
  document.querySelectorAll = selector => selector === "[data-perspective]" ? perspectives : selector === "[data-tour]" ? tour : nodes;
  const timers = new Map(); let nextTimer = 0;
  const context = { document, setInterval: fn => { timers.set(++nextTimer, fn); return nextTimer; }, clearInterval: id => timers.delete(id), selectRpmView: index => { context.rpmView = index; } };
  vm.runInNewContext(fs.readFileSync(path.join(root, script), "utf8"), context);
  return { el: elements, nodes, perspectives, document, timers, tour, context, tick: () => { for (const fn of [...timers.values()]) fn(); } };
}

test("replay scrubbing, perspectives, boundary controls, and hidden-tab pause", () => {
  const f = fixture("field-lab.html");
  assert.equal(f.el["replay-prev"].disabled, true);
  f.el["replay-next"].fire("click");
  assert.match(f.el["replay-artifact"].textContent, /WINWORD/);
  f.perspectives[1].fire("click");
  assert.match(f.el["replay-copy"].textContent, /attacker|document starts/i);
  assert.equal(f.perspectives[0].attributes["aria-pressed"], "false");
  f.el["replay-position"].value = "3";
  f.el["replay-position"].fire("input");
  assert.equal(f.el["replay-next"].disabled, true);
  assert.equal(f.nodes[3].attributes["aria-current"], "step");
  f.el["replay-play"].fire("click");
  assert.equal(f.el["replay-count"].textContent, "1 / 4");
  f.tick(); f.tick(); f.tick();
  assert.equal(f.timers.size, 0);
  assert.equal(f.el["replay-count"].textContent, "4 / 4");
  f.el["replay-play"].fire("click");
  f.document.hidden = true; f.document.fire("visibilitychange");
  assert.equal(f.timers.size, 0);
});

test("authorization exercise verifies both cross-account denial and legitimate access after fixing", () => {
  const { el } = fixture("field-lab.html");
  el["export-id"].value = "2001";
  el["export-request"].fire("click");
  assert.match(el["export-response"].textContent, /200 OK.*\nowner: account A/);
  el["export-fix"].fire("click");
  assert.match(el["export-response"].textContent, /404/);
  el["export-id"].value = "2002"; el["export-request"].fire("click");
  assert.match(el["export-response"].textContent, /200 OK.*\nowner: account B/);
  assert.match(el["export-progress"].textContent, /Verified/);
  el["export-id"].value = ""; el["export-request"].fire("click");
  assert.match(el["export-response"].textContent, /400/);
  el["export-fix"].fire("click");
  el["export-id"].value = "2001"; el["export-request"].fire("click");
  assert.match(el["export-response"].textContent, /200 OK/);
});

test("forged browser role works only before the server-side check", () => {
  const { el } = fixture("field-lab.html");
  el["client-role"].value = "admin"; el["role-request"].fire("click");
  assert.match(el["role-response"].textContent, /200 OK/);
  el["role-fix"].fire("click");
  assert.match(el["role-response"].textContent, /403 Forbidden/);
  assert.match(el["role-progress"].textContent, /Verified/);
  el["role-fix"].fire("click");
  assert.match(el["role-response"].textContent, /200 OK/);
});

test("automation routes all evidence scenarios, resets progress, and prevents overlapping runs", () => {
  const f = fixture("work.html");
  for (const [scenario, expected] of [["review", /analyst decides/i], ["known", /lower-priority/], ["missing", /incomplete evidence/]]) {
    f.el["automation-scenario"].value = scenario;
    f.el["automation-run"].fire("click");
    assert.equal(f.el["automation-run"].disabled, true);
    assert.equal(f.el["automation-scenario"].disabled, true);
    f.el["automation-run"].fire("click");
    assert.equal(f.timers.size, 1);
    assert.equal(f.nodes[3].attributes["data-complete"], undefined);
    f.tick(); f.tick(); f.tick();
    assert.match(f.el["automation-copy"].textContent, expected);
    assert.equal(f.timers.size, 0);
    assert.equal(f.el["automation-run"].disabled, false);
  }
});

test("RPM tour switches between product views and explicitly conceptual unlock illustrations", () => {
  const f = fixture("public/rpm-preview.html", "public/rpm-tour.js");
  f.tour[1].fire("click");
  assert.equal(f.context.rpmView, 1);
  assert.equal(f.el["unlock-concept"].hidden, true);
  f.tour[2].fire("click");
  assert.equal(f.el["rpm-preview-window"].hidden, true);
  assert.match(f.el["tour-step-copy"].textContent, /concept illustration/);
  f.el["tour-next"].fire("click");
  assert.match(f.el["unlock-title"].textContent, /Android/);
  assert.equal(f.el["tour-next"].disabled, true);
  f.tour[0].fire("click");
  assert.equal(f.el["rpm-preview-window"].hidden, false);
  assert.equal(f.el["tour-prev"].disabled, true);
});

test("new page links, labels, script assets, and deployment staging resolve", () => {
  for (const name of ["field-lab.html", "work.html", "public/rpm-preview.html"]) {
    const html = fs.readFileSync(path.join(root, name), "utf8");
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => id);
    assert.equal(ids.length, new Set(ids).size, name);
    assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|<style\b/i);
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^[a-z]+:/i.test(url)) continue;
      const [file, anchor] = url.split("#");
      const target = path.resolve(root, path.dirname(name), file.split("?")[0] || path.basename(name));
      assert.ok(fs.existsSync(target), `${name}: ${url}`);
      if (anchor) assert.ok(fs.readFileSync(target, "utf8").includes(`id="${anchor}"`) || anchor.startsWith("lab-"), url);
    }
  }
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/azure-static-web-apps-zealous-tree-00eae9110.yml"), "utf8");
  for (const file of ["field-lab.html", "field-lab.css", "field-lab.js", "public/rpm-tour.js"]) assert.ok(workflow.includes(file), file);
});
