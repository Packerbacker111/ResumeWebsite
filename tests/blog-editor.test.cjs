"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { handleBlog } = require("../api/blog-core.js");
const { renderBlogMarkdown } = require("../blog/markdown.js");

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

test("editor Markdown renders readable blocks without treating author text as HTML", () => {
  const html = renderBlogMarkdown("## A heading\n\nHello **friend** and *reader*.\n\n- First\n- Second\n\n> A thought\n\n```js\n<script>alert(1)</script>\n```\n\n[Reference](https://example.com/?a=1&b=2) [bad](javascript:alert(1))");
  assert.match(html, /<h2>A heading<\/h2>/);
  assert.match(html, /<strong>friend<\/strong> and <em>reader<\/em>/);
  assert.match(html, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>A thought<\/p><\/blockquote>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
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

test("public listing uses a plain-text excerpt from Markdown", async () => {
  memory.clear();
  const markdownPost = { ...post, body: "## Details\n\nA **clear** [link](https://example.com) and `code`.", published: true };
  await handleBlog(request("admin/posts", "POST", markdownPost), store);
  const listing = (await handleBlog(request("posts"), store)).jsonBody;
  assert.equal(listing[0].excerpt, "Details A clear link and code.");
});

test("write requests reject foreign origins and unsafe post fields", async () => {
  memory.clear();
  const foreign = request("admin/posts", "POST", post);
  foreign.headers.set("origin", "https://other.example");
  assert.equal((await handleBlog(foreign, store)).status, 403);
  assert.equal((await handleBlog(request("admin/posts", "POST", { ...post, slug: "../draft" }), store)).status, 400);
  assert.equal((await handleBlog(request("admin/posts", "POST", { ...post, source_url: "https://evil.example" }), store)).status, 400);
});

test("the production custom domain can save through Azure's default API host", async () => {
  memory.clear();
  const customDomainRequest = request("admin/posts", "POST", post);
  customDomainRequest.url = "https://zealous-tree-00eae9110.4.azurestaticapps.net/api/blog/admin/posts";
  customDomainRequest.headers.set("origin", "https://samuel.regelbrugge.net");
  assert.equal((await handleBlog(customDomainRequest, store)).status, 201);
  customDomainRequest.headers.set("origin", "https://samuel.regelbrugge.net.evil.example");
  assert.equal((await handleBlog(customDomainRequest, store)).status, 403);
});
