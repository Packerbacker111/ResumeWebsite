"use strict";

const form = document.getElementById("postForm");
const status = document.getElementById("editorStatus");
const postList = document.getElementById("postList");
let posts = [];
let currentSlug = null;

function say(message) { status.textContent = message; }
function formValue(name) { return form.elements.namedItem(name).value.trim(); }
function choose(post) {
  currentSlug = post?.slug || null;
  document.getElementById("postPreview").hidden = true;
  for (const name of ["title", "slug", "date", "body", "source_url"]) form.elements.namedItem(name).value = post?.[name] || "";
  if (!post) form.elements.namedItem("date").value = new Date().toISOString().slice(0, 10);
  form.elements.namedItem("slug").readOnly = !!post;
  form.elements.namedItem("title").focus();
  say(post ? `Editing ${post.published ? "published post" : "draft"}: ${post.title}` : "New private draft");
}
function render() {
  postList.replaceChildren();
  for (const post of posts.sort((a, b) => b.date.localeCompare(a.date))) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${post.published ? "Published" : "Draft"} · ${post.title}`;
    button.addEventListener("click", () => choose(post));
    li.append(button);
    postList.append(li);
  }
}
async function refresh() {
  const response = await fetch("../api/blog/admin/posts", { credentials: "same-origin" });
  if (!response.ok) throw new Error(response.status === 503 ? "Azure blog storage is not configured yet." : "Editor access is unavailable.");
  posts = await response.json();
  render();
  say(`${posts.length} posts loaded.`);
}
async function save(published) {
  if (!form.reportValidity()) return;
  const post = { slug: formValue("slug"), title: formValue("title"), date: formValue("date"), body: formValue("body"), published };
  if (formValue("source_url")) post.source_url = formValue("source_url");
  say(published ? "Publishing…" : "Saving draft…");
  try {
    const response = await fetch(`../api/blog/admin/posts${currentSlug ? `/${currentSlug}` : ""}`, {
      method: currentSlug ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(post)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Save failed");
    currentSlug = post.slug;
    await refresh();
    choose(posts.find(item => item.slug === currentSlug));
    say(published ? "Published. The post is on /blog now." : "Draft saved privately.");
  } catch (error) { say(error.message); }
}

document.getElementById("newPost").addEventListener("click", () => choose(null));
document.getElementById("saveDraft").addEventListener("click", () => save(false));
document.getElementById("previewPost").addEventListener("click", () => {
  const preview = document.getElementById("postPreview");
  preview.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = formValue("title") || "Untitled";
  preview.append(heading);
  for (const paragraph of formValue("body").split(/\n\s*\n/)) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    p.style.whiteSpace = "pre-line";
    preview.append(p);
  }
  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth" });
});
document.getElementById("publishPost").addEventListener("click", () => save(true));
document.getElementById("unpublishPost").addEventListener("click", () => save(false));
form.addEventListener("submit", event => event.preventDefault());
refresh().catch(error => say(error.message));
