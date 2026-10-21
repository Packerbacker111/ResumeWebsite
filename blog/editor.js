"use strict";

const form = document.getElementById("postForm");
const status = document.getElementById("editorStatus");
const postList = document.getElementById("postList");
const deleteButton = document.getElementById("deleteDraft");
let posts = [];
let currentSlug = null;
let saving = false;

function say(message) { status.textContent = message; }
function formValue(name) { return form.elements.namedItem(name).value.trim(); }
function localDateTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function postStatus(post) {
  return !post.published ? "Draft" : post.publish_at && Date.parse(post.publish_at) > Date.now() ? "Scheduled" : "Published";
}
function scheduleLabel(value) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
document.getElementById("scheduleHelp").textContent = `Choose a time in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Posts and images stay private until then. The Date above is the date displayed on the post.`;
function choose(post) {
  currentSlug = post?.slug || null;
  document.getElementById("postPreview").hidden = true;
  for (const name of ["title", "slug", "date", "body", "source_url"]) form.elements.namedItem(name).value = post?.[name] || "";
  form.elements.namedItem("publish_at").value = post?.publish_at ? localDateTime(post.publish_at) : "";
  document.getElementById("saveChanges").hidden = !post;
  form.elements.namedItem("image").value = "";
  form.elements.namedItem("image_alt").value = "";
  if (!post) form.elements.namedItem("date").value = new Date().toISOString().slice(0, 10);
  form.elements.namedItem("slug").readOnly = !!post;
  deleteButton.hidden = !post || post.published;
  form.elements.namedItem("title").focus();
  say(post ? `Editing ${postStatus(post).toLowerCase()}: ${post.title}${postStatus(post) === "Scheduled" ? ` · Publishes ${scheduleLabel(post.publish_at)}` : ""}` : "New private draft");
}
function render() {
  postList.replaceChildren();
  for (const post of posts.sort((a, b) => b.date.localeCompare(a.date))) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${postStatus(post)} · ${post.title}${postStatus(post) === "Scheduled" ? ` · ${scheduleLabel(post.publish_at)}` : ""}`;
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
async function save(mode) {
  if (saving) return;
  if (!form.reportValidity()) return;
  const existing = posts.find(item => item.slug === currentSlug);
  const published = mode === "keep" ? existing?.published === true : mode !== "draft";
  const post = { slug: formValue("slug"), title: formValue("title"), date: formValue("date"), body: formValue("body"), published };
  const scheduleValue = formValue("publish_at");
  if (mode === "schedule") {
    const date = new Date(scheduleValue);
    if (!scheduleValue || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now() || localDateTime(date) !== scheduleValue) {
      say("Choose a valid future publication time. Times skipped by daylight saving changes cannot be used.");
      return;
    }
    post.publish_at = date.toISOString();
  } else if (mode === "keep" && existing?.publish_at) post.publish_at = existing.publish_at;
  if (formValue("source_url")) post.source_url = formValue("source_url");
  const selectedSlug = currentSlug;
  saving = true;
  for (const id of ["saveDraft", "saveChanges", "schedulePost", "publishPost", "unpublishPost"]) document.getElementById(id).disabled = true;
  say(mode === "schedule" ? "Scheduling…" : "Saving…");
  try {
    const response = await fetch(`../api/blog/admin/posts${selectedSlug ? `/${selectedSlug}` : ""}`, {
      method: selectedSlug ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body: JSON.stringify(post)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Save failed");
    await refresh();
    if (currentSlug === selectedSlug && formValue("slug") === post.slug) {
      currentSlug = post.slug;
      form.elements.namedItem("slug").readOnly = true;
      document.getElementById("saveChanges").hidden = false;
      deleteButton.hidden = published;
      const scheduleEdited = formValue("publish_at") !== scheduleValue;
      const editedDuringSave = ["title", "date", "body", "source_url"].some(name => formValue(name) !== (post[name] || ""));
      if (!scheduleEdited && mode !== "keep") form.elements.namedItem("publish_at").value = post.publish_at ? localDateTime(post.publish_at) : "";
      say(editedDuringSave ? "Saved. Edits made while saving are still unsaved." : `${postStatus(post) === "Scheduled" ? `Scheduled for ${scheduleLabel(post.publish_at)}.` : published ? "Published. The post is on /blog now." : "Draft saved privately. Schedule canceled."}${scheduleEdited || (mode === "keep" && scheduleValue !== (post.publish_at ? localDateTime(post.publish_at) : "")) ? " Publication time edits have not been applied; use Schedule to change the time." : ""}`);
    }
  } catch (error) { say(error.message); }
  finally {
    saving = false;
    for (const id of ["saveDraft", "saveChanges", "schedulePost", "publishPost", "unpublishPost"]) document.getElementById(id).disabled = false;
  }
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
document.getElementById("saveDraft").addEventListener("click", () => save("draft"));
document.getElementById("saveChanges").addEventListener("click", () => save("keep"));
document.getElementById("schedulePost").addEventListener("click", () => save("schedule"));
document.getElementById("previewPost").addEventListener("click", () => {
  const preview = document.getElementById("postPreview");
  preview.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = formValue("title") || "Untitled";
  preview.append(heading);
  const meta = document.createElement("div");
  meta.className = "blog-post-meta";
  const byline = document.createElement("p");
  byline.className = "blog-byline";
  byline.textContent = "By: Samuel Regelbrugge";
  meta.append(byline);
  if (formValue("source_url")) {
    let url;
    try { url = new URL(formValue("source_url")); } catch { /* Invalid URLs are handled when saving. */ }
    if (url?.protocol === "https:" && ["linkedin.com", "www.linkedin.com"].includes(url.hostname)) {
      const source = document.createElement("p");
      source.className = "blog-source";
      const link = document.createElement("a");
      link.href = url.href;
      link.textContent = "View original post on LinkedIn ↗";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.append(link);
      meta.append(source);
    }
  }
  preview.append(meta);
  const body = document.createElement("div");
  body.className = "blog-body";
  body.innerHTML = window.renderBlogMarkdown(formValue("body"));
  preview.append(body);
  preview.hidden = false;
  preview.scrollIntoView({ behavior: "smooth" });
});
document.getElementById("publishPost").addEventListener("click", () => save("publish"));
document.getElementById("unpublishPost").addEventListener("click", () => save("draft"));
deleteButton.addEventListener("click", deleteDraft);
document.getElementById("insertImage").addEventListener("click", insertImage);
form.addEventListener("submit", event => event.preventDefault());
refresh().catch(error => say(error.message));
