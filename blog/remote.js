"use strict";

const list = document.getElementById("blogList");
const post = document.getElementById("remotePost");

function textNode(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}

async function loadBlog() {
  if (list) {
    const response = await fetch("/api/blog/posts", { credentials: "same-origin" });
    if (!response.ok) return;
    const posts = await response.json();
    if (!posts.length) return;
    list.querySelector(".blog-empty")?.remove();
    for (const item of posts) {
      const article = document.createElement("article");
      article.className = "blog-card";
      const date = textNode("time", item.date);
      date.dateTime = item.date;
      const heading = document.createElement("h2");
      const link = textNode("a", item.title);
      link.href = `/blog/post.html?slug=${encodeURIComponent(item.slug)}`;
      heading.append(link);
      article.append(date, heading, textNode("p", item.excerpt));
      list.append(article);
    }
    const articles = [...list.querySelectorAll(".blog-card")];
    articles.sort((a, b) => b.querySelector("time").dateTime.localeCompare(a.querySelector("time").dateTime));
    list.append(...articles);
  }
  if (post) {
    const slug = new URLSearchParams(location.search).get("slug") || "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
    const response = await fetch(`/api/blog/posts/${slug}`, { credentials: "same-origin" });
    if (!response.ok) return;
    const item = await response.json();
    const meta = document.createElement("div");
    meta.className = "blog-post-meta";
    const byline = textNode("p", "By: Samuel Regelbrugge");
    byline.className = "blog-byline";
    meta.append(byline);
    if (item.source_url) {
      const source = document.createElement("p");
      source.className = "blog-source";
      const link = textNode("a", "View original post on LinkedIn ↗");
      link.href = item.source_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.append(link);
      meta.append(source);
    }
    post.replaceChildren(textNode("p", `Blog / ${item.date}`), textNode("h1", item.title), meta);
    const body = document.createElement("article");
    body.className = "blog-body";
    body.innerHTML = window.renderBlogMarkdown(item.body);
    post.append(body);
    document.title = `${item.title} | Samuel Regelbrugge`;
  }
}

loadBlog().catch(() => {});
