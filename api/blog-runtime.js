"use strict";

const { handleBlog, excerpt } = require("./blog-core.js");

// One runtime per worker. No client-controlled IP headers or unbounded key maps.
function createBlogRuntime(store, clock = Date.now) {
  let cached, pending, failure, retryAt = 0, expires = 0, generation = 0;
  let tokens = 120, lastRefill = clock();
  const invalidate = () => { generation++; cached = undefined; pending = undefined; failure = undefined; retryAt = 0; expires = 0; };
  const publicStore = {
    ...store,
    async listPublic() {
      if (cached && clock() < expires) return cached;
      if (failure && clock() < retryAt) throw failure;
      if (pending) return pending;
      const version = generation;
      const load = (async () => {
        const posts = (await store.list()).filter(p => p.published === true).map(p => ({
          slug: p.slug, title: p.title, date: p.date, published: true,
          ...(p.publish_at ? { publish_at: p.publish_at } : {}),
          ...(p.source_url ? { source_url: p.source_url } : {}), excerpt: excerpt(p.body)
        }));
        if (Buffer.byteLength(JSON.stringify(posts)) > 2 * 1024 * 1024) throw new Error("Public index exceeds cache budget");
        if (version === generation) { cached = posts; expires = clock() + 30000; }
        return posts;
      })();
      pending = load;
      try { return await load; }
      catch (error) {
        if (version === generation) { failure = error; retryAt = clock() + 1000; }
        throw error;
      }
      finally { if (pending === load) pending = undefined; }
    },
    async save(...args) { await store.save(...args); invalidate(); },
    async delete(...args) { await store.delete(...args); invalidate(); }
  };
  return request => {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && /^\/api\/blog\/(?:posts(?:\/|$)|images\/)/.test(path)) {
      const now = clock();
      tokens = Math.min(120, tokens + Math.max(0, now - lastRefill) * 2 / 1000);
      lastRefill = now;
      if (tokens < 1) return Promise.resolve({
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "Retry-After": "1" },
        jsonBody: { error: "Too many blog requests. Try again shortly." }
      });
      tokens--;
    }
    return handleBlog(request, publicStore, clock);
  };
}

module.exports = { createBlogRuntime };
