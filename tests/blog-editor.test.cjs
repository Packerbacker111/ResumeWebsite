"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { handleBlog } = require("../api/blog-core.js");
const { renderBlogMarkdown } = require("../blog/markdown.js");

const principal = Buffer.from(JSON.stringify({ userId: "owner", userRoles: ["authenticated", "blog_editor"] })).toString("base64");
const post = { slug: "a-note", title: "A note", date: "2026-10-19", body: "A private thought", published: false };
const memory = new Map();
const images = new Map();
const store = {
  list: async () => [...memory.values()],
  get: async slug => memory.get(slug) || null,
  save: async value => memory.set(value.slug, value),
  delete: async slug => memory.delete(slug),
  saveImage: async (slug, id, bytes, contentType) => images.set(`${slug}/${id}`, { bytes, contentType }),
  getImage: async (slug, id) => images.get(`${slug}/${id}`) || null,
  deleteImages: async slug => {
    for (const key of images.keys()) if (key.startsWith(`${slug}/`)) images.delete(key);
  }
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

test("uploaded image Markdown renders a safe, responsive image", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000.png";
  const html = renderBlogMarkdown(`![A <test> image](/api/blog/images/a-note/${id})`);
  assert.match(html, new RegExp(`<img src="/api/blog/images/a-note/${id.replaceAll(".", "\\.")}" alt="A &lt;test&gt; image" loading="lazy">`));
  assert.doesNotMatch(renderBlogMarkdown("![bad](javascript:alert(1))"), /<img/);
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
  const published = { ...post, published: true, source_url: "https://www.linkedin.com/posts/example" };
  assert.equal((await handleBlog(request("admin/posts/a-note", "PUT", published), store)).status, 200);
  assert.equal((await handleBlog(request("posts/a-note"), store)).jsonBody.body, post.body);
  assert.equal((await handleBlog(request("posts/a-note"), store)).jsonBody.source_url, published.source_url);
  assert.equal((await handleBlog(request("posts"), store)).jsonBody.length, 1);
  await handleBlog(request("admin/posts/a-note", "PUT", post), store);
  assert.equal((await handleBlog(request("posts/a-note"), store)).status, 404);
});

test("only an authorized editor can delete an unpublished draft", async () => {
  memory.clear();
  await handleBlog(request("admin/posts", "POST", post), store);
  assert.equal((await handleBlog(request("admin/posts/a-note", "DELETE", null, null), store)).status, 403);
  const foreign = request("admin/posts/a-note", "DELETE");
  foreign.headers.set("origin", "https://other.example");
  assert.equal((await handleBlog(foreign, store)).status, 403);
  assert.equal(memory.has(post.slug), true);

  await handleBlog(request("admin/posts/a-note", "PUT", { ...post, published: true }), store);
  assert.equal((await handleBlog(request("admin/posts/a-note", "DELETE"), store)).status, 409);
  assert.equal(memory.has(post.slug), true);

  await handleBlog(request("admin/posts/a-note", "PUT", post), store);
  assert.equal((await handleBlog(request("admin/posts/a-note", "DELETE"), store)).status, 200);
  assert.equal(memory.has(post.slug), false);
  assert.equal((await handleBlog(request("admin/posts/a-note", "DELETE"), store)).status, 404);
});

test("image uploads stay private until referenced by a published post", async () => {
  memory.clear();
  images.clear();
  await handleBlog(request("admin/posts", "POST", post), store);
  const png = Buffer.from("iVBORw0KGgo=", "base64");
  const upload = request("admin/posts/a-note/images", "POST");
  upload.headers.set("content-type", "image/png");
  upload.arrayBuffer = async () => png;
  const uploaded = await handleBlog(upload, store);
  assert.equal(uploaded.status, 201);
  const imagePath = uploaded.jsonBody.url.replace("/api/blog/", "");
  assert.equal((await handleBlog(request(imagePath, "GET", null, null), store)).status, 404);
  assert.equal((await handleBlog(request(imagePath), store)).status, 200);

  await handleBlog(request("admin/posts/a-note", "PUT", { ...post, published: true }), store);
  assert.equal((await handleBlog(request(imagePath, "GET", null, null), store)).status, 404);
  await handleBlog(request("admin/posts/a-note", "PUT", { ...post, published: true, body: `![Test](${uploaded.jsonBody.url})` }), store);
  const image = await handleBlog(request(imagePath, "GET", null, null), store);
  assert.equal(image.status, 200);
  assert.equal(image.headers["Content-Type"], "image/png");
  assert.deepEqual(image.body, png);

  await handleBlog(request("admin/posts/a-note", "PUT", post), store);
  assert.equal((await handleBlog(request(imagePath, "GET", null, null), store)).status, 404);
  await handleBlog(request("admin/posts/a-note", "DELETE"), store);
  assert.equal(images.size, 0);
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

test("editing while a draft save finishes does not erase newer text", async () => {
  const handlers = new Map();
  const fields = Object.fromEntries(["title", "slug", "date", "body", "source_url", "image", "image_alt"].map(name => [name, { value: "", focus() {} }]));
  const form = { elements: { namedItem: name => fields[name] }, reportValidity: () => true, addEventListener() {} };
  const status = { textContent: "" };
  const controls = new Map([["postForm", form], ["editorStatus", status]]);
  function element() {
    return { disabled: false, hidden: false, addEventListener(name, handler) { this.handler = handler; }, replaceChildren() {}, append() {}, focus() {} };
  }
  const document = {
    getElementById(id) {
      if (!controls.has(id)) controls.set(id, element());
      return controls.get(id);
    },
    createElement: element
  };
  let finishSave;
  const stored = { slug: "a-note", title: "A note", date: "2026-10-19", body: "Earlier text", published: false };
  const fetch = async (_url, options) => options?.method
    ? new Promise(resolve => { finishSave = () => resolve({ ok: true, json: async () => stored }); })
    : { ok: true, json: async () => [stored] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../blog/editor.js"), "utf8"), { document, fetch, window: {} });
  fields.title.value = stored.title;
  fields.slug.value = stored.slug;
  fields.date.value = stored.date;
  fields.body.value = stored.body;
  const pending = controls.get("saveDraft").handler();
  fields.body.value = "Earlier text plus a new paragraph";
  finishSave();
  await pending;
  assert.equal(fields.body.value, "Earlier text plus a new paragraph");
  assert.match(status.textContent, /Edits made while saving are still unsaved/);
});
