"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("../api/node_modules/sharp");
const { createBlogRuntime } = require("../api/blog-runtime");
const { handleBlog } = require("../api/blog-core");
const principal = Buffer.from(JSON.stringify({ userRoles: ["blog_editor"] })).toString("base64");
const post = { slug: "a-note", title: "A note", date: "2026-10-19", body: "Secret full body", published: true };
const req = (path = "posts", method = "GET", body) => new Request(`https://example.com/api/blog/${path}`, {
  method, headers: { origin: "https://example.com", "x-ms-client-principal": principal, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {})
});
function fixture() {
  let now = 1000, lists = 0, gets = 0, rows = [{ ...post, etag: "private-etag" }, { ...post, slug: "draft", published: false }];
  const store = {
    list: async () => { lists++; return rows; },
    get: async slug => { gets++; return rows.find(p => p.slug === slug) || null; },
    save: async value => { rows = [...rows.filter(p => p.slug !== value.slug), value]; },
    delete: async slug => { rows = rows.filter(p => p.slug !== slug); },
    deleteImages: async () => {}
  };
  return { store, run: createBlogRuntime(store, () => now), time: value => { now = value; }, lists: () => lists, gets: () => gets };
}

test("public listing coalesces concurrent reads and caches only summaries until expiry", async () => {
  const f = fixture();
  const responses = await Promise.all(Array.from({ length: 20 }, () => f.run(req())));
  assert.equal(f.lists(), 1);
  assert.equal(responses[0].jsonBody.length, 1);
  assert.equal(responses[0].jsonBody[0].body, undefined);
  assert.equal(responses[0].jsonBody[0].etag, undefined);
  f.time(30999);
  await f.run(req());
  assert.equal(f.lists(), 1);
  f.time(31000);
  await f.run(req());
  assert.equal(f.lists(), 2);
});

test("cached summaries honor the exact release instant and writes invalidate the cache", async () => {
  const f = fixture();
  const scheduled = { ...post, publish_at: new Date(5000).toISOString() };
  await f.run(req("admin/posts/a-note", "PUT", scheduled));
  assert.deepEqual((await f.run(req())).jsonBody, []);
  f.time(4999);
  assert.deepEqual((await f.run(req())).jsonBody, []);
  f.time(5000);
  assert.equal((await f.run(req())).jsonBody.length, 1);
  assert.equal(f.lists(), 1);
  await f.run(req("admin/posts/a-note", "PUT", { ...post, published: false }));
  assert.deepEqual((await f.run(req())).jsonBody, []);
  assert.equal((await f.run(req("posts/a-note"))).status, 404);
  await f.run(req("admin/posts/a-note", "DELETE"));
  await f.run(req());
  assert.equal(f.lists(), 3);
});

test("an invalidated in-flight listing cannot repopulate the cache", async () => {
  const f = fixture();
  let resolve;
  const original = f.store.list;
  f.store.list = () => new Promise(done => { resolve = done; });
  const pending = f.run(req());
  await f.run(req("admin/posts/a-note", "PUT", { ...post, published: false }));
  f.store.list = original;
  resolve([post]);
  await pending;
  assert.deepEqual((await f.run(req())).jsonBody, []);
});

test("rate limit bounds public reads before storage, ignores spoofed IPs, and refills", async () => {
  const f = fixture();
  for (let i = 0; i < 120; i++) assert.equal((await f.run(req("posts/a-note"))).status, 200);
  const spoof = req("posts/unknown");
  spoof.headers.set("x-forwarded-for", "1.2.3.4");
  const limited = await f.run(spoof);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["Retry-After"], "1");
  assert.equal((await f.run(req("images/a-note/123e4567-e89b-42d3-a456-426614174000.png"))).status, 429);
  assert.equal(f.gets(), 120);
  assert.equal((await f.run(req("admin/posts"))).status, 200);
  f.time(1500);
  assert.equal((await f.run(req("posts/a-note"))).status, 200);
  assert.equal((await f.run(req())).status, 429);
});

test("failed refreshes do not serve stale posts and back off before retrying", async () => {
  const f = fixture();
  await f.run(req());
  f.time(31000);
  let failures = 0;
  f.store.list = async () => { failures++; throw new Error("offline"); };
  assert.equal((await f.run(req())).status, 503);
  assert.equal((await f.run(req())).status, 503);
  assert.equal(failures, 1);
  f.time(32000);
  assert.equal((await f.run(req())).status, 503);
  assert.equal(failures, 2);
});

test("oversized public indexes fail closed at the cache memory budget", async () => {
  const f = fixture();
  f.store.list = async () => Array.from({ length: 25000 }, (_, i) => ({ ...post, slug: `note-${i}` }));
  assert.equal((await f.run(req())).status, 503);
});

async function upload(bytes, type) {
  let saved;
  const request = req("admin/posts/a-note/images", "POST");
  request.headers.set("content-type", type);
  // Same body interface used by Azure's request, without JSON serialization.
  request.arrayBuffer = async () => bytes;
  const result = await handleBlog(request, {
    get: async () => post,
    saveImage: async (_slug, _id, value) => { saved = value; }
  });
  return { result, saved };
}

test("JPEG, PNG, and WebP uploads strip embedded metadata and preserve visual orientation", async () => {
  for (const [format, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const input = await sharp({ create: { width: 3, height: 2, channels: 3, background: "red" } })
      .withMetadata({ orientation: 6, exif: {
        IFD0: { Artist: "private-camera-owner" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 1/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "80/1 1/1 0/1" }
      } }).withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">private-location</x:xmpmeta>').toFormat(format).toBuffer();
    assert.ok((await sharp(input).metadata()).exif);
    const { result, saved } = await upload(input, type);
    assert.equal(result.status, 201);
    const meta = await sharp(saved).metadata();
    assert.equal(meta.width, 2);
    assert.equal(meta.height, 3);
    for (const key of ["exif", "xmp", "iptc", "icc", "orientation"]) assert.equal(meta[key], undefined, `${format}: ${key}`);
    assert.equal(saved.includes(Buffer.from("private-camera-owner")), false);
    assert.equal(saved.includes(Buffer.from("private-location")), false);
  }
});

test("GIF comments are removed while GIF and WebP animation frames and timing survive", async () => {
  const pixels = Buffer.concat([Buffer.alloc(2 * 2 * 3, 40), Buffer.alloc(2 * 2 * 3, 200)]);
  const gif = await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
    .gif({ loop: 0, delay: [100, 200] }).toBuffer();
  const comment = Buffer.from("private-camera-owner");
  const input = Buffer.concat([gif.subarray(0, -1), Buffer.from([0x21, 0xfe, comment.length]), comment, Buffer.from([0, 0x3b])]);
  const { result, saved } = await upload(input, "image/gif");
  assert.equal(result.status, 201);
  assert.equal(saved.includes(comment), false);
  const meta = await sharp(saved, { animated: true }).metadata();
  assert.equal(meta.pages, 2);
  assert.deepEqual(meta.delay, [100, 200]);
  const webp = await sharp(input, { animated: true }).webp().toBuffer();
  const sanitizedWebp = await upload(webp, "image/webp");
  assert.equal(sanitizedWebp.result.status, 201);
  const webpMeta = await sharp(sanitizedWebp.saved, { animated: true }).metadata();
  assert.equal(webpMeta.pages, 2);
  assert.deepEqual(webpMeta.delay, [100, 200]);
});

test("truncated images and decompression bombs are rejected without storage writes", async () => {
  const truncated = Buffer.from("iVBORw0KGgo=", "base64");
  const huge = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "red" } }).png().toBuffer();
  for (const bytes of [truncated, huge]) {
    const { result, saved } = await upload(bytes, "image/png");
    assert.equal(result.status, 400);
    assert.equal(saved, undefined);
  }
});
