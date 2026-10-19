const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const labScript = fs.readFileSync(path.join(root, "response-lab.js"), "utf8");
const labCss = fs.readFileSync(path.join(root, "response-lab.css"), "utf8");
const { Investigation, cases } = require("../lab-model.js");
const headScript = fs.readFileSync(path.join(root, "theme.js"), "utf8");

test("security policy permits page assets without allowing inline execution", () => {
  const { globalHeaders: headers } = JSON.parse(fs.readFileSync(path.join(root, "staticwebapp.config.json"), "utf8"));
  const policy = Object.fromEntries(headers["Content-Security-Policy"].split(";").map(part => {
    const [name, ...sources] = part.trim().split(/\s+/);
    return [name, sources];
  }));
  for (const name of ["default-src", "connect-src", "object-src", "base-uri", "form-action", "frame-ancestors"]) {
    assert.deepEqual(policy[name], ["'none'"]);
  }
  assert.deepEqual(policy["script-src"], ["'self'"]);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|<style\b/i);
  const origin = "https://samuel.regelbrugge.net";
  const allowed = (url, directive) => {
    const source = new URL(url, origin).origin;
    assert.ok(policy[directive].includes(source === origin ? "'self'" : source), url);
  };
  for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\btype="application\/ld\+json"/.test(attributes)) {
      assert.doesNotThrow(() => JSON.parse(body), "Structured data must be valid JSON");
      continue; // JSON-LD is metadata, not executable JavaScript.
    }
    assert.equal(body.trim(), "", "Inline script would be blocked");
    const src = attributes.match(/\bsrc="([^"]+)"/);
    assert.ok(src, "Scripts must use a local file");
    allowed(src[1], "script-src");
  }
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    if (tag.includes('rel="stylesheet"')) allowed(tag.match(/href="([^"]+)"/)[1], "style-src");
  }
  for (const [, src] of html.matchAll(/<img\b[^>]*src="([^"]+)"/g)) allowed(src, "img-src");
  assert.doesNotMatch(headScript + script + labScript, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
});

test("search metadata and discovery files agree on the canonical profile", () => {
  const canonical = html.match(/rel="canonical" href="([^"]+)"/)[1];
  const profile = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(profile.url, canonical);
  assert.equal(profile.mainEntity.url, canonical);
  assert.equal(profile.mainEntity.name, "Samuel Regelbrugge");
  for (const url of profile.mainEntity.sameAs) assert.ok(html.includes('href="' + url + '"'));
  assert.ok(fs.existsSync(path.join(root, new URL(profile.mainEntity.image).pathname)));
  const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
  const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
  assert.ok(robots.includes("Sitemap: " + canonical + "sitemap.xml"));
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
  assert.ok(sitemap.includes("<loc>" + canonical + "</loc>"));
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/azure-static-web-apps-zealous-tree-00eae9110.yml"), "utf8");
  assert.match(workflow, /cp index\.html[^\n]*robots\.txt[^\n]*sitemap\.xml[^\n]*_site\//);
});

// Small isolated event fixture: tests behavior without a browser or dependencies.
class Element {
  constructor() {
    this.attributes = {};
    this.dataset = {};
    this.events = {};
    this.hidden = true;
    this.textContent = "";
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
      toggle: (value, force) => {
        const enabled = force === undefined ? !classes.has(value) : force;
        if (enabled) classes.add(value); else classes.delete(value);
        return enabled;
      }
    };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(event, callback) { (this.events[event] ??= []).push(callback); }
  dispatch(event, data = {}) { for (const callback of this.events[event] ?? []) callback(data); }
  contains(target) { return this === target || this.children.includes(target); }
  focus() { this.focused = true; }
  click() { this.dispatch("click"); }
  scrollIntoView() { this.scrolled = true; }
  closest() { return this.editable ? this : null; }
  querySelectorAll() { return this.children; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatch("close"); }
}

function fixture(saved = {}, blocked = false, reducedMotion = false, observeVisibility = false, initialHash = "") {
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  elements.themeToggle.firstElementChild = new Element();
  elements.incidentDemo.dataset.stage = "detected";
  elements.incidentDemo.children = Array.from({ length: 4 }, () => new Element());
  elements.incidentDemo.children[0].setAttribute("aria-current", "step");
  elements.navLinks.children = Array.from({ length: 4 }, () => new Element());
  elements.commandResults.children = [...html.matchAll(/<button\b[^>]*data-command="([^"]+)"[^>]*data-keywords="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)].map(([, action, keywords, copy]) => {
    const command = action === "theme" ? elements.commandTheme : new Element();
    command.dataset = { command: action, keywords };
    command.textContent = copy.replace(/<[^>]+>/g, " ");
    command.parentElement = new Element();
    command.parentElement.hidden = false;
    return command;
  });
  const document = new Element();
  document.hidden = false;
  document.documentElement = new Element();
  document.body = new Element();
  document.querySelectorAll = () => [];
  document.activeElement = elements.commandToggle;
  document.getElementById = id => elements[id] ?? null;
  document.createElement = () => new Element();
  document.createTextNode = value => value;
  const values = new Map(Object.entries(saved));
  const localStorage = {
    getItem: key => { if (blocked) throw Error("Storage blocked"); return values.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error("Storage blocked"); values.set(key, value); }
  };
  const timers = new Map();
  let timerId = 0;
  const motionPreference = new Element();
  motionPreference.matches = reducedMotion;
  let visibilityCallback;
  const opened = [];
  const window = new Element();
  window.matchMedia = () => motionPreference;
  window.open = (...args) => opened.push(args);
  window.location = { href: "https://samuel.regelbrugge.net/" + initialHash, hash: initialHash, pathname: "/", search: "" };
  window.history = { replaceState: () => { window.location.hash = ""; } };
  const context = vm.createContext({ document, localStorage, Date,
    ResponseLabModel: { Investigation, cases },
    window, URL,
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  if (observeVisibility) context.IntersectionObserver = class {
    constructor(callback, options) { if (options.threshold === .1) visibilityCallback = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vm.runInContext(headScript, context);
  vm.runInContext(script, context);
  vm.runInContext(labScript, context);
  const flush = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); };
  const setPanelVisible = visible => visibilityCallback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
  return { elements, document, window, values, timers, flush, motionPreference, setPanelVisible, opened };
}

test("all local assets and anchor destinations exist", () => {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "Duplicate IDs");
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (url.startsWith("#")) assert.ok(ids.includes(url.slice(1)), url);
    else if (!/^[a-z]+:/i.test(url)) {
      assert.ok(fs.existsSync(path.join(root, url.split(/[?#]/)[0])), url);
    }
  }
  for (const [, reference] of html.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) {
    for (const id of reference.split(" ")) assert.ok(ids.includes(id), id);
  }
  for (const [, sources] of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const source of sources.split(",")) {
      assert.ok(fs.existsSync(path.join(root, source.trim().split(/\s+/)[0])), source);
    }
  }
});

test("project pages and their case study destinations exist", () => {
  const work = fs.readFileSync(path.join(root, "work.html"), "utf8");
  const rpm = fs.readFileSync(path.join(root, "rpm.html"), "utf8");
  assert.match(work, /id="endpoint-telemetry"/);
  assert.match(work, /id="entra-workflow"/);
  assert.match(rpm, /public\/rpm-preview\.html/);
  for (const page of [work, rpm]) assert.match(page, /href="index\.html#/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/azure-static-web-apps-zealous-tree-00eae9110.yml"), "utf8");
  assert.match(workflow, /cp index\.html work\.html rpm\.html/);
});

test("direct case links open the selected response lab case", () => {
  const { elements: el, window } = fixture({}, false, false, false, "#lab-identity");
  assert.equal(el.responseLab.open, true);
  assert.equal(el.caseIdentity.attributes["aria-pressed"], "true");
  window.location.hash = "#lab-endpoint";
  window.dispatch("hashchange");
  assert.equal(el.caseEndpoint.attributes["aria-pressed"], "true");
  el.labClose.dispatch("click");
  assert.equal(window.location.hash, "");
});

test("portrait variants match the current original and deployment uses optimized assets", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "images/portrait/manifest.json"), "utf8"));
  const hash = data => createHash("sha256").update(data).digest("hex");
  const original = fs.readFileSync(path.join(root, "images/pfp3.jpg"));
  assert.equal(manifest.source_sha256, hash(original), "Rebuild variants after replacing the portrait");
  assert.equal(manifest.source_bytes, original.length);
  assert.equal(Object.keys(manifest.variants).length, 7);
  for (const [name, info] of Object.entries(manifest.variants)) {
    const data = fs.readFileSync(path.join(root, "images/portrait", name));
    assert.equal(data.length, info.bytes, name);
    assert.equal(hash(data), info.sha256, name);
  }
  assert.doesNotMatch(html, /pfp3\.jpg/);
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/azure-static-web-apps-zealous-tree-00eae9110.yml"), "utf8");
  assert.match(workflow, /python tools\/optimize_portrait\.py/);
  assert.match(workflow, /rm _site\/images\/pfp3\.jpg/);
});

test("RPM illustration assets resolve and clearly identify their example data", () => {
  const previewHtml = fs.readFileSync(path.join(root, "public/rpm-preview.html"), "utf8");
  const ids = [...previewHtml.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.match(previewHtml, /Windows interface illustration · Fictional entries/);
  assert.match(previewHtml, /Password hidden/);
  assert.match(previewHtml, /name="robots" content="noindex"/);
  assert.doesNotMatch(previewHtml, /\son[a-z]+\s*=|\sstyle\s*=|<style\b|<input\b/i);
  for (const [, url] of previewHtml.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (!/^[a-z]+:/i.test(url)) assert.ok(fs.existsSync(path.resolve(root, "public", url.split("#")[0])), url);
  }
  for (const [, reference] of previewHtml.matchAll(/aria-(?:controls|labelledby)="([^"]+)"/g)) {
    assert.ok(ids.includes(reference), reference);
  }
});

test("RPM view selection updates the accessible state and keyboard focus", () => {
  const elements = Object.fromEntries(["healthTab", "credentialTab", "healthPanel", "credentialPanel", "rpmViews"].map(id => [id, new Element()]));
  const media = new Element();
  media.matches = false;
  vm.runInNewContext(fs.readFileSync(path.join(root, "public/rpm-preview.js"), "utf8"), {
    document: { getElementById: id => elements[id] }, window: { matchMedia: () => media }
  });
  const { healthTab, credentialTab, healthPanel, credentialPanel, rpmViews } = elements;
  assert.equal(rpmViews.attributes["aria-orientation"], "vertical");
  credentialTab.click();
  assert.equal(healthPanel.hidden, true);
  assert.equal(credentialPanel.hidden, false);
  assert.equal(credentialTab.attributes["aria-selected"], "true");
  assert.equal(healthTab.tabIndex, -1);
  assert.equal(credentialTab.tabIndex, 0);
  assert.equal(credentialTab.focused, true);
  let prevented = false;
  credentialTab.dispatch("keydown", { key: "ArrowLeft", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(healthPanel.hidden, false);
  assert.equal(credentialPanel.hidden, true);
  assert.equal(healthTab.attributes["aria-selected"], "true");
  assert.equal(healthTab.focused, true);
  healthTab.dispatch("keydown", { key: "End", preventDefault() {} });
  assert.equal(credentialPanel.hidden, false);
  credentialTab.dispatch("keydown", { key: "Home", preventDefault() {} });
  assert.equal(healthPanel.hidden, false);
  media.matches = true;
  media.dispatch("change");
  assert.equal(rpmViews.attributes["aria-orientation"], "horizontal");
});

test("initial page stays calm and the demo is explicitly fictional", () => {
  const { elements, document } = fixture();
  assert.equal(elements.incidentDemo.dataset.stage, "detected");
  assert.equal(elements.incidentAction.hidden, false);
  assert.equal(elements.themeToggle.hidden, false);
  assert.equal(document.documentElement.dataset.theme, undefined);
  assert.equal(elements.themeToggle.attributes["aria-label"], "Use light theme");
  assert.match(html, /Simulated incident/);
  assert.match(html, /Fictional cases, synthetic telemetry, no live systems/);
  assert.doesNotMatch(script + labScript, /\b(fetch|WebSocket|setInterval)\s*\(/);
});

test("endpoint investigation requires evidence, containment, and recovery", () => {
  const model = new Investigation();
  assert.equal(model.decide("contain"), false);
  assert.equal(model.review(0), false);
  assert.equal(model.recover(), false);
  assert.equal(model.collect(), true);
  assert.equal(model.collect(), false);
  assert.equal(model.completeCollection(), true);
  assert.equal(model.reviewed.size, 1);
  assert.equal(model.decide("contain"), false);
  assert.match(model.feedback, /all three/);
  model.review(1); model.review(2);
  assert.equal(model.reviewed.size, 3);
  assert.equal(model.decide("benign"), false);
  assert.equal(model.phase, "evidence");
  assert.equal(model.decide("contain"), true);
  assert.equal(model.phase, "contained");
  assert.equal(model.recover(), true);
  assert.equal(model.phase, "resolved");
  assert.equal(model.decide("contain"), false);
  model.reset();
  assert.equal(model.phase, "alert");
  assert.equal(model.reviewed.size, 0);
  assert.equal(model.events.length, 1);
});

test("identity investigation supports a benign closure, not blanket containment", () => {
  const model = new Investigation("identity");
  model.collect(); model.completeCollection(); model.review(1); model.review(2);
  assert.equal(model.decide("contain"), false);
  assert.match(model.feedback, /VPN match alone would not be enough/);
  assert.equal(model.decide("benign"), true);
  assert.equal(model.phase, "resolved");
  assert.equal(model.recover(), false);
  model.select("endpoint");
  assert.equal(model.phase, "alert");
  assert.equal(model.feedback, "");
  assert.equal(model.review(999), false);
  assert.throws(() => model.select("__proto__"), /Unknown case/);
});

test("case evidence uses specific locations without announcing the verdict", () => {
  const signIns = cases.identity.evidence[0].data;
  assert.equal(cases.identity.title, "Paris → Chicago. Two minutes.");
  assert.match(signIns, /10:12:02 UTC  Paris, France/);
  assert.match(signIns, /10:14:09 UTC  Chicago, USA/);
  assert.match(signIns, /Chicago source: 203\.0\.113\.18/);
  assert.match(cases.identity.evidence[2].data, /VPN exit: Chicago, USA/);
  assert.match(cases.identity.evidence[2].note, /Chicago event/);
  for (const incident of Object.values(cases)) {
    const evidenceCopy = incident.evidence.map(view => [view.title, view.kicker, view.data, view.note].join(" ")).join(" ");
    assert.doesNotMatch(evidenceCopy, /Location [AB]|containment|benign closure|explains it|validated explanation|support the same finding/i);
    const model = new Investigation(incident === cases.identity ? "identity" : "endpoint");
    model.collect(); model.completeCollection(); model.review(1); model.review(2);
    assert.equal(model.phase, "evidence");
    assert.equal(model.feedback, "");
  }
});

test("network evidence keeps TLS on 443 with a fictional lookalike domain", () => {
  const network = cases.endpoint.evidence.find(view => view.label === "Network");
  assert.match(network.data, /powershell\.exe → 198\.51\.100\.24:443/);
  assert.match(network.data, /DNS name: cdn\.micr0soft-updates\.example/);
  assert.match(network.data, /Approved services: no inventory match/);
  assert.match(network.note, /hostname and service inventory/);
  assert.match(network.note, /no DNS lookup or connection is made/);
  assert.doesNotMatch(network.data, /:1337/);
});

test("dialog collection, keyboard tabs, decisions, and replay update accessible state", () => {
  const { elements: el, document, flush } = fixture();
  el.incidentAction.dispatch("click");
  assert.equal(el.responseLab.open, true);
  assert.equal(document.body.classList.contains("lab-open"), true);
  el.labCollect.dispatch("click");
  assert.equal(el.labCollection.hidden, false);
  flush();
  assert.equal(el.labEvidence.hidden, false);
  assert.equal(el.labTab0.focused, true);
  el.labContain.dispatch("click");
  assert.equal(el.labFeedback.hidden, false);
  assert.equal(el.labFeedback.focused, true);
  el.labTab0.dispatch("keydown", { key: "ArrowRight", preventDefault() {} });
  assert.equal(el.labTab1.attributes["aria-selected"], "true");
  el.labTab1.dispatch("keydown", { key: "End", preventDefault() {} });
  assert.equal(el.labEvidencePanel.attributes["aria-labelledby"], "labTab2");
  assert.equal(el.labReviewed.textContent, "3 / 3 views");
  el.labContain.dispatch("click");
  assert.equal(el.labRecover.hidden, false);
  assert.equal(el.labRecover.focused, true);
  el.labRecover.dispatch("click");
  assert.equal(el.labOutcome.hidden, false);
  assert.equal(el.labStepOutcome.attributes["aria-current"], "step");
  el.labNext.dispatch("click");
  assert.equal(el.caseIdentity.attributes["aria-pressed"], "true");
  assert.equal(el.labEvidence.hidden, true);
  el.labClose.dispatch("click");
  assert.equal(el.responseLab.open, false);
  assert.equal(document.body.classList.contains("lab-open"), false);
  assert.equal(el.incidentAction.focused, true);
});

test("closing, resetting, or switching cases cancels collection playback", () => {
  for (const action of ["labClose", "labReset", "caseIdentity"]) {
    const { elements: el, timers, flush } = fixture();
    el.incidentAction.dispatch("click");
    el.labCollect.dispatch("click");
    const staleCallbacks = [...timers.values()];
    assert.equal(timers.size, 3);
    el[action].dispatch("click");
    assert.equal(timers.size, 0);
    staleCallbacks.forEach(callback => callback());
    flush();
    assert.equal(el.labReviewed.textContent, "0 / 3 views");
    assert.equal(el.labEvidence.hidden, true);
    assert.equal(el.labCollect.disabled, false);
    assert.equal(el.labStepAlert.attributes["aria-current"], "step");
  }
});

test("reduced motion collects instantly without playback timers", () => {
  const { elements: el, timers } = fixture({}, false, true);
  el.incidentAction.dispatch("click");
  el.labCollect.dispatch("click");
  assert.equal(timers.size, 0);
  assert.equal(el.labEvidence.hidden, false);
  assert.match(labCss, /prefers-reduced-motion: reduce/);
});

test("theme preference restores, persists, and migrates the old preference", () => {
  const saved = fixture({ "samuel-theme": "light" });
  assert.equal(saved.document.documentElement.dataset.theme, "light");
  assert.equal(saved.elements.themeToggle.attributes["aria-label"], "Use dark theme");
  saved.elements.themeToggle.dispatch("click");
  assert.equal(saved.document.documentElement.dataset.theme, "dark");
  assert.equal(saved.values.get("samuel-theme"), "dark");
  assert.equal(fixture({ "samuel-dark": "false" }).document.documentElement.dataset.theme, "light");
  assert.equal(fixture({ "samuel-theme": "dark", "samuel-dark": "false" }).document.documentElement.dataset.theme, undefined);
});

test("blocked storage does not break theme, navigation, or response lab", () => {
  const { elements, document } = fixture({}, true);
  elements.themeToggle.dispatch("click");
  assert.equal(document.documentElement.dataset.theme, "light");
  elements.burger.dispatch("click");
  assert.equal(elements.burger.attributes["aria-expanded"], "true");
  elements.incidentAction.dispatch("click");
  assert.equal(elements.responseLab.open, true);
});

test("navigation closes via Escape, destination selection, and outside interaction", () => {
  const { elements, document } = fixture();
  const { burger, navLinks } = elements;
  burger.dispatch("click");
  assert.equal(navLinks.classList.contains("open"), true);
  document.dispatch("keydown", { key: "Escape" });
  assert.equal(navLinks.classList.contains("open"), false);
  assert.equal(burger.attributes["aria-expanded"], "false");
  assert.equal(burger.focused, true);
  burger.dispatch("click");
  navLinks.children[0].dispatch("click");
  assert.equal(navLinks.classList.contains("open"), false);
  burger.dispatch("click");
  document.dispatch("click", { target: new Element() });
  assert.equal(navLinks.classList.contains("open"), false);
});

test("critical effects repeat slowly and can be paused, resumed, and remembered", () => {
  const { elements, values } = fixture();
  assert.equal(elements.incidentDemo.dataset.effects, "running");
  assert.equal(elements.alertEffectsToggle.hidden, false);
  elements.alertEffectsToggle.dispatch("click");
  assert.equal(elements.incidentDemo.dataset.effects, "paused");
  assert.equal(elements.alertEffectsToggle.attributes["aria-label"], "Resume critical alert effects");
  assert.equal(values.get("samuel-alert-effects"), "paused");
  elements.alertEffectsToggle.dispatch("click");
  assert.equal(elements.incidentDemo.dataset.effects, "running");
  assert.equal(values.get("samuel-alert-effects"), "running");
  assert.equal(fixture({ "samuel-alert-effects": "paused" }).elements.incidentDemo.dataset.effects, "paused");
  const blocked = fixture({}, true);
  blocked.elements.alertEffectsToggle.dispatch("click");
  assert.equal(blocked.elements.incidentDemo.dataset.effects, "paused");
  assert.match(css, /alert-pulse 3\.2s ease-out infinite/);
  assert.match(css, /critical-glow 3\.2s ease-in-out infinite/);
});

test("alert effects stop off-screen, in hidden tabs, and for reduced-motion preferences", () => {
  const { elements, document, motionPreference, setPanelVisible } = fixture({}, false, false, true);
  assert.equal(elements.incidentDemo.dataset.effects, "paused");
  setPanelVisible(true);
  assert.equal(elements.incidentDemo.dataset.effects, "running");
  setPanelVisible(false);
  assert.equal(elements.incidentDemo.dataset.effects, "paused");
  setPanelVisible(true);
  document.hidden = true;
  document.dispatch("visibilitychange");
  assert.equal(elements.incidentDemo.dataset.effects, "paused");
  document.hidden = false;
  document.dispatch("visibilitychange");
  assert.equal(elements.incidentDemo.dataset.effects, "running");
  motionPreference.matches = true;
  motionPreference.dispatch("change");
  assert.equal(elements.incidentDemo.dataset.effects, "paused");
  assert.equal(elements.alertEffectsToggle.hidden, true);
  motionPreference.matches = false;
  motionPreference.dispatch("change");
  assert.equal(elements.incidentDemo.dataset.effects, "running");
  assert.equal(elements.alertEffectsToggle.hidden, false);
  assert.equal(fixture({}, false, true).elements.incidentDemo.dataset.effects, "paused");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /scroll-behavior: auto/);
  assert.match(css, /body\.lab-open #incidentDemo::after[^}]+animation-play-state: paused/);
});

test("basic document accessibility and no-JavaScript fallback are present", () => {
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip-link" href="#main"/);
  assert.match(html, /role="status" aria-atomic="true"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /<details class="work-details">/);
  assert.match(css, /\.js \.nav-links \{ display: none;/);
  for (const [img] of html.matchAll(/<img\b[^>]*>/g)) assert.match(img, /alt="/);
  for (const [anchor] of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) assert.match(anchor, /rel="noopener"/);
});

test("public content contains the current role without old metrics or phone links", () => {
  assert.match(html, /Vivmark Residential/);
  assert.match(html, /Joined Equity Residential in July 2025/);
  assert.doesNotMatch(html, /Current post-merger environment|5,000\+ employees|scope-note/);
  const currentRole = html.match(/<article class="timeline-item current-role">([\s\S]*?)<\/article>/)[1];
  assert.match(currentRole, /Tuned security detections across multiple alert categories/);
  assert.match(currentRole, /reducing false positives and alert fatigue while improving alert fidelity/);
  assert.doesNotMatch(currentRole, /Microsoft Entra|AI-assisted|15–20|hours to minutes/);
  const selectedWork = html.match(/<section id="impact"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(selectedWork, /AI-assisted endpoint telemetry/);
  assert.match(selectedWork, /Tines stories that connect Entra risk data sources/);
  assert.match(currentRole, /HackerOne submissions, assess risk/);
  assert.match(html, /hours move to minutes/);
  assert.match(html, /AI-assisted endpoint telemetry/);
  assert.match(html, /Equity Residential<\/dt><dd>Jul 2025–Aug 2026/);
  assert.match(html, /Vivmark Residential<\/dt><dd>Aug 2026–present/);
  assert.match(html, /images\/comptia-logo.svg/);
  assert.doesNotMatch(html, /Security operations today, purple-team impact next/);
  assert.doesNotMatch(html, /\$25B|2,500\+|tel:/);
  assert.match(fs.readFileSync(path.join(root, ".gitattributes"), "utf8"), /\*\.pdf binary/);
});

test("CCDC card links to the updated competition domain", () => {
  const card = html.match(/<a\b[^>]*class="competition-card"[\s\S]*?<\/a>/g)
    .find(item => item.includes("National Collegiate Cyber Defense Competition"));
  assert.match(card, /href="https:\/\/ccdc\.io\/"/);
  assert.doesNotMatch(html, /nccdc\.org/);
});

test("social preview has a real image and a trusted production origin", () => {
  assert.ok(fs.statSync(path.join(root, "public/og.png")).size > 1000);
  for (const field of ["og:image", "twitter:image"]) {
    assert.ok(html.includes(field + '" content="https://samuel.regelbrugge.net/public/og.png"'));
  }
});

test("quick jump filters actions, handles the keyboard, and restores focus", () => {
  const { elements: el, document } = fixture();
  const commands = el.commandResults.children;
  let prevented = false;
  document.dispatch("keydown", { key: "/", target: document.body, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(el.commandPalette.open, true);
  assert.equal(el.commandSearch.focused, true);
  assert.equal(document.body.classList.contains("command-open"), true);
  el.commandSearch.value = "automation";
  el.commandSearch.dispatch("input");
  assert.equal(commands.filter(command => !command.parentElement.hidden).length, 1);
  el.commandSearch.dispatch("keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(commands[0].focused, true);
  el.commandSearch.dispatch("keydown", { key: "Enter", preventDefault() {} });
  assert.equal(el.commandPalette.open, false);
  assert.equal(el.impact.focused, true);
  assert.equal(el.impact.scrolled, true);
  assert.equal(document.body.classList.contains("command-open"), false);
  el.commandToggle.click();
  assert.equal(commands.every(command => !command.parentElement.hidden), true);
  el.commandSearch.value = "no matching destination";
  el.commandSearch.dispatch("input");
  assert.equal(el.commandEmpty.hidden, false);
  el.commandSearch.dispatch("keydown", { key: "Enter", preventDefault() {} });
  assert.equal(el.commandPalette.open, true);
  el.commandClose.click();
  assert.equal(el.commandToggle.focused, true);
  el.burger.click();
  el.commandToggle.click();
  assert.equal(el.navLinks.classList.contains("open"), false);
  el.commandClose.click();
  assert.equal(el.burger.focused, true);
});

test("quick jump respects editing and modal boundaries and dispatches actions", () => {
  const { elements: el, document, opened } = fixture();
  const editable = new Element();
  editable.editable = true;
  const shortcut = target => document.dispatch("keydown", { key: "/", target, preventDefault() {} });
  shortcut(editable);
  assert.ok(!el.commandPalette.open);
  el.incidentAction.click();
  shortcut(document.body);
  assert.ok(!el.commandPalette.open);
  el.labClose.click();
  const choose = query => {
    el.commandToggle.click();
    el.commandSearch.value = query;
    el.commandSearch.dispatch("input");
    el.commandSearch.dispatch("keydown", { key: "Enter", preventDefault() {} });
  };
  choose("theme");
  assert.equal(document.documentElement.dataset.theme, "light");
  el.commandToggle.click();
  assert.equal(el.commandThemeLabel.textContent, "Switch to dark theme");
  el.commandClose.click();
  choose("pdf");
  assert.deepEqual(opened[0], ["content/SRegelbruggeResume.pdf", "_blank", "noopener"]);
  choose("lab");
  assert.equal(el.responseLab.open, true);
  assert.equal(el.commandPalette.open, false);
  assert.equal(document.body.classList.contains("lab-open"), true);
  assert.equal(document.body.classList.contains("command-open"), false);
});

test("case debriefs stay hidden until resolution and reset with the case", () => {
  const { elements: el, flush } = fixture();
  el.incidentAction.click();
  for (const key of ["endpoint", "identity"]) {
    if (key === "identity") el.caseIdentity.click();
    el.labCollect.click();
    flush();
    el.labTab1.click(); el.labTab2.click();
    assert.equal(el.labDebrief.children.length, 0);
    assert.equal(el.labOutcome.hidden, true);
    if (key === "endpoint") {
      el.labContain.click();
      assert.equal(el.labOutcome.hidden, true);
      el.labRecover.click();
    } else el.labBenign.click();
    assert.equal(el.labOutcome.hidden, false);
    assert.equal(el.labOutcome.focused, true);
    assert.equal(el.labDebrief.children.length, 3);
    assert.equal(el.labRationale.textContent, cases[key].rationale);
    assert.equal(el.labClosedLabel.textContent, key === "endpoint" ? "Incident closed" : "Alert closed / benign");
    assert.deepEqual(el.labDebrief.children.map(item => item.children[0].textContent), cases[key].evidence.map(item => item.label));
    el.labReset.click();
    assert.equal(el.labOutcome.hidden, true);
    assert.equal(el.labDebrief.children.length, 0);
  }
});

test("text colors meet AA contrast in both themes", () => {
  const luminance = hex => {
    const rgb = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x,y) => y-x);
    return (values[0] + .05) / (values[1] + .05);
  };
  for (const [fg,bg] of [
    ["edf0e8","101819"], ["a8b5b1","1d292a"], ["10291b","b9edc8"], ["ff9d95","3a2425"],
    ["192b27","f3f3ea"], ["58665f","e8ede3"], ["fffef7","286844"], ["a52f2b","f9e5df"]
  ]) assert.ok(contrast(fg,bg) >= 4.5, fg + " on " + bg);
});
