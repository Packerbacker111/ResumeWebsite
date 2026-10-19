"use strict";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function principalFromHeader(header) {
  if (!header) return null;
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    return principal && Array.isArray(principal.userRoles) ? principal : null;
  } catch {
    return null;
  }
}

function isEditor(header) {
  return principalFromHeader(header)?.userRoles.includes("blog_editor") === true;
}

function validatePost(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Post must be an object");
  const post = {};
  for (const [field, limit] of [["slug", 72], ["title", 160], ["body", 100000]]) {
    if (typeof input[field] !== "string") throw new Error(`${field} is required`);
    post[field] = input[field].trim();
    if (!post[field] || post[field].length > limit) throw new Error(`${field} has an invalid length`);
  }
  if (!slugPattern.test(post.slug)) throw new Error("slug must use lowercase letters, numbers, and hyphens");
  const date = typeof input.date === "string" ? input.date : "";
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("date must be YYYY-MM-DD");
  post.date = input.date;
  post.published = input.published === true;
  if (input.source_url) {
    let url;
    try { url = new URL(input.source_url); } catch { throw new Error("source_url must be a LinkedIn HTTPS URL"); }
    if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname)) throw new Error("source_url must be a LinkedIn HTTPS URL");
    post.source_url = url.href;
  }
  return post;
}

const responseHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };
function json(status, body) { return { status, headers: responseHeaders, jsonBody: body }; }

async function handleBlog(request, store) {
  const path = new URL(request.url).pathname.replace(/^\/api\/blog\/?/, "");
  const admin = path.startsWith("admin/");
  if (admin && !isEditor(request.headers.get("x-ms-client-principal"))) return json(403, { error: "Editor access required" });
  if (admin && request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return json(403, { error: "Invalid origin" });
  }
  try {
    if (path === "posts" && request.method === "GET") {
      const posts = await store.list();
      return json(200, posts.filter(p => p.published).sort((a, b) => b.date.localeCompare(a.date)).map(({ body, ...summary }) => ({ ...summary, excerpt: body.slice(0, 190) })));
    }
    if (path === "admin/posts" && request.method === "GET") return json(200, await store.list());
    if (path === "admin/posts" && request.method === "POST") {
      let post;
      try { post = validatePost(await request.json()); } catch (error) { return json(400, { error: error.message }); }
      const existing = await store.get(post.slug);
      if (existing) return json(409, { error: "That slug already exists" });
      await store.save(post, null);
      return json(201, post);
    }
    const slug = path.replace(/^admin\/posts\//, "").replace(/^posts\//, "");
    if (!slugPattern.test(slug)) return json(404, { error: "Not found" });
    if (path === `posts/${slug}` && request.method === "GET") {
      const post = await store.get(slug);
      if (!post?.published) return json(404, { error: "Not found" });
      const { etag, ...publicPost } = post;
      return json(200, publicPost);
    }
    if (path === `admin/posts/${slug}` && request.method === "PUT") {
      let post;
      try { post = validatePost(await request.json()); } catch (error) { return json(400, { error: error.message }); }
      if (post.slug !== slug) return json(400, { error: "Slug cannot be changed" });
      const existing = await store.get(slug);
      if (!existing) return json(404, { error: "Not found" });
      await store.save(post, existing.etag);
      return json(200, post);
    }
    return json(404, { error: "Not found" });
  } catch (error) {
    if (error.statusCode === 412) return json(409, { error: "This post changed elsewhere. Reload before saving." });
    return json(503, { error: "Blog storage is unavailable" });
  }
}

module.exports = { handleBlog, isEditor, validatePost };
