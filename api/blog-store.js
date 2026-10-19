"use strict";

const { BlobServiceClient } = require("@azure/storage-blob");

function createBlogStore(connectionString) {
  if (!connectionString) throw new Error("BLOG_STORAGE_CONNECTION_STRING is not configured");
  const container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient("blog-posts");
  const blob = slug => container.getBlockBlobClient(`posts/${slug}.json`);
  return {
    async list() {
      await container.createIfNotExists();
      const posts = [];
      for await (const item of container.listBlobsFlat({ prefix: "posts/" })) {
        if (!/^posts\/[a-z0-9-]+\.json$/.test(item.name)) continue;
        const client = container.getBlobClient(item.name);
        const download = await client.download();
        const chunks = [];
        for await (const chunk of download.readableStreamBody) chunks.push(chunk);
        posts.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      }
      return posts;
    },
    async get(slug) {
      const client = blob(slug);
      try {
        const download = await client.download();
        const chunks = [];
        for await (const chunk of download.readableStreamBody) chunks.push(chunk);
        return { ...JSON.parse(Buffer.concat(chunks).toString("utf8")), etag: download.etag };
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw error;
      }
    },
    async save(post, etag) {
      await container.createIfNotExists();
      const content = JSON.stringify(post);
      await blob(post.slug).upload(content, Buffer.byteLength(content), {
        blobHTTPHeaders: { blobContentType: "application/json" },
        conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" }
      });
    }
  };
}

module.exports = { createBlogStore };
