const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const { challengeResponse, hasAccess } = require("../api/cookie-challenge-core.js");

test("the real HTTP challenge starts denied and sets an editable cookie", () => {
  const response = challengeResponse("", "CTF{test-only}");
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.state, "denied");
  assert.match(response.headers["Set-Cookie"], /^show-flag=false; Path=\/api\/cookie-challenge; Secure; SameSite=Lax$/);
  assert.equal(response.headers["Cache-Control"], "no-store, private");
  assert.equal(response.headers.Vary, "Cookie");
  assert.equal(response.jsonBody.flag, undefined);
});

test("only the tampered request receives the server-held flag", () => {
  const secret = "CTF{test-only}";
  assert.equal(hasAccess("other=true; show-flag=TRUE"), true);
  assert.equal(hasAccess("show-flag=false; other=true"), false);
  const denied = challengeResponse("show-flag=false", secret);
  assert.equal(denied.jsonBody.flag, undefined);
  const solved = challengeResponse("show-flag=true", secret);
  assert.deepEqual(solved.jsonBody, { state: "solved", flag: secret });
  assert.equal(solved.headers["Set-Cookie"], undefined);
  assert.equal(challengeResponse("show-flag=true", "").status, 503);
});

test("the Azure handler generates a stable server-only flag without app settings", async () => {
  const originalLoad = Module._load;
  const previousFlag = process.env.COOKIE_CTF_FLAG;
  let registration;
  delete process.env.COOKIE_CTF_FLAG;
  Module._load = function (request, parent, isMain) {
    if (request === "@azure/functions") return { app: { http: (_name, options) => { registration = options; } } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    require("../api/src/functions/cookie-challenge.js");
  } finally {
    Module._load = originalLoad;
    if (previousFlag === undefined) delete process.env.COOKIE_CTF_FLAG;
    else process.env.COOKIE_CTF_FLAG = previousFlag;
  }
  assert.equal(registration.authLevel, "anonymous");
  assert.equal(registration.route, "cookie-challenge");
  const request = { headers: { get: () => "show-flag=true" } };
  const first = await registration.handler(request);
  const second = await registration.handler(request);
  assert.match(first.jsonBody.flag, /^COOKIE\{[0-9a-f]{32}\}$/);
  assert.equal(second.jsonBody.flag, first.jsonBody.flag);
});

test("deployment keeps drafts and the flag out of public files", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/azure-static-web-apps-zealous-tree-00eae9110.yml"), "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(root, "staticwebapp.config.json"), "utf8"));
  const challenge = fs.readFileSync(path.join(root, "cookie-challenge.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "cookie-challenge.js"), "utf8");
  const blog = fs.readFileSync(path.join(root, "blog/index.html"), "utf8");
  assert.match(workflow, /api_location: "api"/);
  assert.match(workflow, /cp blog\/\*\.html _site\/blog\//);
  assert.doesNotMatch(workflow, /cp -R blog/);
  assert.equal(config.platform.apiRuntime, "node:22");
  assert.ok(config.routes.some(route => route.route === "/cookie-challenge.html" && route.headers["Content-Security-Policy"].includes("connect-src 'self'")));
  assert.match(challenge, /id="challengeRetry"/);
  assert.match(client, /fetch\("\/api\/cookie-challenge"/);
  assert.doesNotMatch(challenge + client + blog, /CTF\{/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "blog/posts.json"), "utf8")).length, 0);
});
