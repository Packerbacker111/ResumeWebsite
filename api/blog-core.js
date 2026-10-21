"use strict";

const { randomUUID } = require("node:crypto");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imagePattern = /^[a-f0-9-]{36}\.(?:png|jpg|gif|webp)$/;
const imageTypes = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const maxImageBytes = 5 * 1024 * 1024;

function validImage(bytes, type) {
  if (!bytes.length || bytes.length > maxImageBytes) return false;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (type === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  if (type === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

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
  if (input.publish_at != null && input.publish_at !== "") {
    const value = input.publish_at;
    const timestamp = typeof value === "string" ? new Date(value) : new Date(NaN);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
        !Number.isFinite(timestamp.getTime()) || timestamp.toISOString().replace(".000Z", "Z") !== value.replace(".000Z", "Z")) {
      throw new Error("publish_at must be a valid UTC date and time");
    }
    if (post.published) post.publish_at = timestamp.toISOString();
  }
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
function excerpt(body) {
  return body.replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[([^\]]*)\]\(\/api\/blog\/images\/[^)]+\)/g, "$1")
    .replace(/^\s*(?:#{2,3}\s+|[-*]\s+|\d+\.\s+|>\s*)/gm, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
    .replace(/[*`]/g, "").replace(/\s+/g, " ").trim().slice(0, 190);
}

function isPublic(post, now) {
  return post?.published === true && (!post.publish_at || Date.parse(post.publish_at) <= now);
}

async function handleBlog(request, store, clock = Date.now) {
  const now = clock();
  const path = new URL(request.url).pathname.replace(/^\/api\/blog\/?/, "");
  const admin = path.startsWith("admin/");
  if (admin && !isEditor(request.headers.get("x-ms-client-principal"))) return json(403, { error: "Editor access required" });
  if (admin && request.method !== "GET") {
    const origin = request.headers.get("origin");
    const allowedOrigins = [new URL(request.url).origin, "https://samuel.regelbrugge.net"];
    if (!origin || !allowedOrigins.includes(origin)) return json(403, { error: "Invalid origin" });
  }
  try {
    if (path === "posts" && request.method === "GET") {
      const posts = await store.list();
      return json(200, posts.filter(p => isPublic(p, now)).sort((a, b) => b.date.localeCompare(a.date)).map(({ body, ...summary }) => ({ ...summary, excerpt: excerpt(body) })));
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
    const imagePath = /^images\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-f0-9-]{36}\.(?:png|jpg|gif|webp))$/.exec(path);
    if (imagePath && request.method === "GET") {
      const [, slug, id] = imagePath;
      if (!imagePattern.test(id)) return json(404, { error: "Not found" });
      const post = await store.get(slug);
      const url = `/api/blog/images/${slug}/${id}`;
      const referenced = post?.body.includes(`](${url})`);
      if (!post || (!isEditor(request.headers.get("x-ms-client-principal")) && (!isPublic(post, now) || !referenced))) return json(404, { error: "Not found" });
      const image = await store.getImage(slug, id);
      if (!image) return json(404, { error: "Not found" });
      return { status: 200, headers: { "Content-Type": image.contentType, "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" }, body: image.bytes };
    }
    const uploadPath = /^admin\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/images$/.exec(path);
    if (uploadPath && request.method === "POST") {
      const slug = uploadPath[1];
      if (!await store.get(slug)) return json(404, { error: "Save the draft before adding an image" });
      const contentType = request.headers.get("content-type")?.toLowerCase();
      if (!imageTypes[contentType]) return json(415, { error: "Choose a PNG, JPEG, GIF, or WebP image" });
      if (Number(request.headers.get("content-length")) > maxImageBytes) return json(413, { error: "Images must be 5 MB or smaller" });
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.length > maxImageBytes) return json(413, { error: "Images must be 5 MB or smaller" });
      if (!validImage(bytes, contentType)) return json(400, { error: "The image file is invalid" });
      const id = `${randomUUID()}.${imageTypes[contentType]}`;
      await store.saveImage(slug, id, bytes, contentType);
      return json(201, { url: `/api/blog/images/${slug}/${id}` });
    }
    const slug = path.replace(/^admin\/posts\//, "").replace(/^posts\//, "");
    if (!slugPattern.test(slug)) return json(404, { error: "Not found" });
    if (path === `posts/${slug}` && request.method === "GET") {
      const post = await store.get(slug);
      if (!isPublic(post, now)) return json(404, { error: "Not found" });
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
    if (path === `admin/posts/${slug}` && request.method === "DELETE") {
      const existing = await store.get(slug);
      if (!existing) return json(404, { error: "Not found" });
      if (existing.published) return json(409, { error: "Unpublish this post before deleting it" });
      await store.delete(slug, existing.etag);
      try { await store.deleteImages(slug); } catch { /* The draft is already deleted. */ }
      return json(200, { deleted: true });
    }
    return json(404, { error: "Not found" });
  } catch (error) {
    if (error.statusCode === 412) return json(409, { error: "This post changed elsewhere. Reload before trying again." });
    return json(503, { error: "Blog storage is unavailable" });
  }
}

module.exports = { handleBlog, isEditor, validatePost };
