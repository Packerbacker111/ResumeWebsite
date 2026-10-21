"use strict";

const { app } = require("@azure/functions");
const { createBlogStore } = require("../../blog-store.js");
const { createBlogRuntime } = require("../../blog-runtime.js");
let runtime;

app.http("blog", {
  methods: ["GET", "POST", "PUT", "DELETE"],
  authLevel: "anonymous",
  route: "blog/{*path}",
  handler: request => {
    try {
      runtime ||= createBlogRuntime(createBlogStore(process.env.BLOG_STORAGE_CONNECTION_STRING, process.env.BLOG_CONTAINER_NAME || "blog-posts"));
      return runtime(request);
    }
    catch { return { status: 503, jsonBody: { error: "Blog storage is not configured" } }; }
  }
});
