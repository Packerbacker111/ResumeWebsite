"use strict";

const { app } = require("@azure/functions");
const { createBlogStore } = require("../../blog-store.js");
const { handleBlog } = require("../../blog-core.js");

app.http("blog", {
  methods: ["GET", "POST", "PUT"],
  authLevel: "anonymous",
  route: "blog/{*path}",
  handler: request => {
    try { return handleBlog(request, createBlogStore(process.env.BLOG_STORAGE_CONNECTION_STRING, process.env.BLOG_CONTAINER_NAME || "blog-posts")); }
    catch { return { status: 503, jsonBody: { error: "Blog storage is not configured" } }; }
  }
});
