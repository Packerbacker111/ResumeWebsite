"use strict";

// A deliberately small Markdown subset. Every bit of author text is escaped
// before HTML is assembled; only http(s) links become clickable.
function escapeBlogHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderBlogInline(value) {
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/g;
  let html = "";
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    html += escapeBlogHtml(value.slice(offset, match.index));
    if (match[1] !== undefined) {
      let safeUrl = "";
      try {
        const url = new URL(match[2]);
        if (["http:", "https:"].includes(url.protocol)) safeUrl = url.href;
      } catch { /* Keep an invalid link as text. */ }
      html += safeUrl
        ? `<a href="${escapeBlogHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeBlogHtml(match[1])}</a>`
        : escapeBlogHtml(match[0]);
    } else if (match[3] !== undefined) html += `<strong>${escapeBlogHtml(match[3])}</strong>`;
    else if (match[4] !== undefined) html += `<em>${escapeBlogHtml(match[4])}</em>`;
    else html += `<code>${escapeBlogHtml(match[5])}</code>`;
    offset = match.index + match[0].length;
  }
  return html + escapeBlogHtml(value.slice(offset));
}

function renderBlogMarkdown(body) {
  const lines = String(body).replace(/\r\n?/g, "\n").trim().split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${paragraph.map(renderBlogInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) output.push(`<${list.type}>${list.items.map(item => `<li>${renderBlogInline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) output.push(`<blockquote><p>${quote.map(renderBlogInline).join("<br>")}</p></blockquote>`);
    quote = [];
  };
  for (const line of lines) {
    if (code) {
      if (/^\s*```\s*$/.test(line)) {
        output.push(`<pre><code>${escapeBlogHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^\s*```(?:[a-z0-9+-]+)?\s*$/i.test(line)) {
      flushParagraph(); flushList(); flushQuote(); code = [];
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList(); flushQuote();
      const level = heading[1].length;
      output.push(`<h${level}>${renderBlogInline(heading[2])}</h${level}>`);
      continue;
    }
    const item = /^(?:([-*])\s+|(\d+)\.\s+)(.+)$/.exec(line);
    if (item) {
      flushParagraph(); flushQuote();
      const type = item[2] ? "ol" : "ul";
      if (list?.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push(item[3]);
      continue;
    }
    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    flushList(); flushQuote(); paragraph.push(line);
  }
  flushParagraph(); flushList(); flushQuote();
  if (code) output.push(`<pre><code>${escapeBlogHtml(code.join("\n"))}</code></pre>`);
  return output.join("\n");
}

if (typeof module !== "undefined") module.exports = { renderBlogMarkdown };
if (typeof window !== "undefined") window.renderBlogMarkdown = renderBlogMarkdown;
