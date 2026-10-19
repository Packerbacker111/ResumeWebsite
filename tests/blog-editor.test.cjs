"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleBlog } = require("../api/blog-core.js");

const principal = Buffer.from(JSON.stringify({ userId: "owner", userRoles: ["authenticated", "blog_editor"] })).toString("base64");
const post = { slug: "a-note", title: "A note", date: "2026-10-19", body: "A private thought", published: false };
const memory = new Map();
const store = {
  list: async () => [...memory.values()],
  get: async slug => memory.get(slug) || null,
  save: async value => memory.set(value.slug, value)
};
function request(path, method = "GET", body, role = principal) {
  const headers = new Headers({ origin: "https://example.com" });
  if (role) headers.set("x-ms-client-principal", role);
  return { url: `https://example.com/api/blog/${path}`, method, headers, json: async () => body };
}

test("Azure protects the editor page and admin API by role", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../staticwebapp.config.json"), "utf8"));
  assert.deepEqual(config.routes.find(route => route.route === "/blog/editor.html").allowedRoles, ["blog_editor"]);
  assert.deepEqual(config.routes.find(route => route.route === "/api/blog/admin/*").allowedRoles, ["blog_editor"]);
});

test("the short /blog URL resolves its loader and post links", () => {
  const page = fs.readFileSync(path.join(__dirname, "../blog/index.html"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "../blog/remote.js"), "utf8");
  assert.match(page, /src="\/blog\/remote\.js"/);
  assert.match(client, /\/blog\/post\.html\?slug=/);
  assert.match(client, /fetch\("\/api\/blog\/posts"/);
});

test("only the invited editor can read or change drafts", async () => {
  memory.clear();
  assert.equal((await handleBlog(request("admin/posts", "POST", post, null), store)).status, 403);
  assert.equal((await handleBlog(request("admin/posts", "POST", post), store)).status, 201);
  assert.equal((await handleBlog(request("admin/posts", "GET", null, null), store)).status, 403);
  assert.deepEqual((await handleBlog(request("posts"), store)).jsonBody, []);
  assert.equal((await handleBlog(request("posts/a-note"), store)).status, 404);
});

test("publishing exposes the post, and unpublishing hides it", async () => {
  memory.clear();
  await handleBlog(request("admin/posts", "POST", post), store);
  const published = { ...post, published: true };
  assert.equal((await handleBlog(request("admin/posts/a-note", "PUT", published), store)).status, 200);
  assert.equal((await handleBlog(request("posts/a-note"), store)).jsonBody.body, post.body);
  assert.equal((await handleBlog(request("posts"), store)).jsonBody.length, 1);
  await handleBlog(request("admin/posts/a-note", "PUT", post), store);
  assert.equal((await handleBlog(request("posts/a-note"), store)).status, 404);
});

test("write requests reject foreign origins and unsafe post fields", async () => {
  memory.clear();
  const foreign = request("admin/posts", "POST", post);
  foreign.headers.set("origin", "https://other.example");
  assert.equal((await handleBlog(foreign, store)).status, 403);
  assert.equal((await handleBlog(request("admin/posts", "POST", { ...post, slug: "../draft" }), store)).status, 400);
  assert.equal((await handleBlog(request("admin/posts", "POST", { ...post, source_url: "https://evil.example" }), store)).status, 400);
});
