"use strict";

const { BlobServiceClient } = require("@azure/storage-blob");

function createBlogStore(connectionString, containerName = "blog-posts") {
  if (!connectionString) throw new Error("BLOG_STORAGE_CONNECTION_STRING is not configured");
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(containerName)) throw new Error("Invalid blog storage container");
  const container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  const blob = slug => container.getBlockBlobClient(`posts/${slug}.json`);
  const imageBlob = (slug, id) => container.getBlockBlobClient(`images/${slug}/${id}`);
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
    },
    async delete(slug, etag) {
      await blob(slug).delete({ conditions: { ifMatch: etag } });
    },
    async saveImage(slug, id, bytes, contentType) {
      await imageBlob(slug, id).upload(bytes, bytes.length, {
        blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: "public, max-age=3600" },
        conditions: { ifNoneMatch: "*" }
      });
    },
    async getImage(slug, id) {
      try {
        const download = await imageBlob(slug, id).download();
        const chunks = [];
        for await (const chunk of download.readableStreamBody) chunks.push(chunk);
        return { bytes: Buffer.concat(chunks), contentType: download.contentType };
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw error;
      }
    },
    async deleteImages(slug) {
      for await (const item of container.listBlobsFlat({ prefix: `images/${slug}/` })) {
        await container.getBlobClient(item.name).deleteIfExists();
      }
    }
  };
}

module.exports = { createBlogStore };
