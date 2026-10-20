"use strict";

const form = document.getElementById("postForm");
const status = document.getElementById("editorStatus");
const postList = document.getElementById("postList");
const deleteButton = document.getElementById("deleteDraft");
let posts = [];
let currentSlug = null;

function say(message) { status.textContent = message; }
function formValue(name) { return form.elements.namedItem(name).value.trim(); }
function choose(post) {
  currentSlug = post?.slug || null;
  document.getElementById("postPreview").hidden = true;
  for (const name of ["title", "slug", "date", "body", "source_url"]) form.elements.namedItem(name).value = post?.[name] || "";
  form.elements.namedItem("image").value = "";
  form.elements.namedItem("image_alt").value = "";
  if (!post) form.elements.namedItem("date").value = new Date().toISOString().slice(0, 10);
  form.elements.namedItem("slug").readOnly = !!post;
  deleteButton.hidden = !post || post.published;
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
async function deleteDraft() {
  const post = posts.find(item => item.slug === currentSlug);
  if (!post || post.published || !window.confirm(`Delete draft "${post.title}"? This cannot be undone.`)) return;
  deleteButton.disabled = true;
  say("Deleting draft…");
  try {
    const response = await fetch(`../api/blog/admin/posts/${encodeURIComponent(post.slug)}`, {
      method: "DELETE", credentials: "same-origin"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Delete failed");
    posts = posts.filter(item => item.slug !== post.slug);
    render();
    choose(null);
    say("Draft deleted.");
  } catch (error) { say(error.message); }
  finally { deleteButton.disabled = false; }
}
async function insertImage() {
  if (!currentSlug) { say("Save this post as a draft before adding an image."); return; }
  const fileInput = form.elements.namedItem("image");
  const file = fileInput.files[0];
  const alt = formValue("image_alt").replace(/\]/g, "").trim();
  if (!file) { say("Choose an image first."); return; }
  if (!alt) { say("Add a short image description first."); return; }
  if (file.size > 5 * 1024 * 1024) { say("Images must be 5 MB or smaller."); return; }
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) { say("Choose a PNG, JPEG, GIF, or WebP image."); return; }
  const button = document.getElementById("insertImage");
  button.disabled = true;
  say("Uploading image…");
  try {
    const response = await fetch(`../api/blog/admin/posts/${encodeURIComponent(currentSlug)}/images`, {
      method: "POST", headers: { "Content-Type": file.type }, credentials: "same-origin", body: file
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Image upload failed");
    const body = form.elements.namedItem("body");
    body.setRangeText(`\n\n![${alt}](${result.url})\n\n`, body.selectionStart, body.selectionEnd, "end");
    body.focus();
    fileInput.value = "";
    form.elements.namedItem("image_alt").value = "";
    say("Image inserted. Save the post to keep the change.");
  } catch (error) { say(error.message); }
  finally { button.disabled = false; }
}

document.getElementById("newPost").addEventListener("click", () => choose(null));
document.getElementById("saveDraft").addEventListener("click", () => save(false));
document.getElementById("previewPost").addEventListener("click", () => {
  const preview = document.getElementById("postPreview");
  preview.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = formValue("title") || "Untitled";
  preview.append(heading);
  const byline = document.createElement("p");
  byline.className = "blog-byline";
  byline.textContent = "By: Samuel Regelbrugge";
  preview.append(byline);
  const body = document.createElement("div");
  body.className = "blog-body";
  body.innerHTML = window.renderBlogMarkdown(formValue("body"));
  preview.append(body);
  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth" });
});
document.getElementById("publishPost").addEventListener("click", () => save(true));
document.getElementById("unpublishPost").addEventListener("click", () => save(false));
deleteButton.addEventListener("click", deleteDraft);
document.getElementById("insertImage").addEventListener("click", insertImage);
form.addEventListener("submit", event => event.preventDefault());
refresh().catch(error => say(error.message));
