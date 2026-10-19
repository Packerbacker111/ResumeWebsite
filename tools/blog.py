"""Build the static blog and import LinkedIn's Shares.csv as unpublished drafts."""

import argparse
import csv
import html
import json
import re
from hashlib import sha256
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BLOG = ROOT / "blog"
POSTS = BLOG / "posts.json"
DRAFTS = BLOG / "drafts.json"
REVIEW = BLOG / "draft-review.html"


def esc(value):
    return html.escape(str(value), quote=True)


def slugify(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:72] or "note"


def read_posts():
    posts = json.loads(POSTS.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise ValueError("blog/posts.json must be a list")
    return posts


def validate(post):
    for field in ("slug", "title", "date", "body"):
        if not isinstance(post.get(field), str) or not post[field].strip():
            raise ValueError(f"Post requires {field}")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", post["slug"]):
        raise ValueError(f"Invalid slug: {post['slug']}")
    datetime.strptime(post["date"], "%Y-%m-%d")
    if "source_url" in post:
        url = urlparse(post["source_url"])
        if url.scheme != "https" or url.hostname not in ("linkedin.com", "www.linkedin.com"):
            raise ValueError("source_url must be a LinkedIn HTTPS URL")


def paragraphs(body):
    """Render the same small, escaped Markdown subset as blog/markdown.js."""
    inline_pattern = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`")

    def inline(value):
        output, offset = [], 0
        for match in inline_pattern.finditer(value):
            output.append(esc(value[offset:match.start()]))
            label, link, bold, italic, code = match.groups()
            if label is not None:
                parsed = urlparse(link)
                output.append(f'<a href="{esc(link)}" target="_blank" rel="noopener noreferrer">{esc(label)}</a>'
                              if parsed.scheme in ("http", "https") and parsed.netloc else esc(match.group()))
            elif bold is not None:
                output.append(f"<strong>{esc(bold)}</strong>")
            elif italic is not None:
                output.append(f"<em>{esc(italic)}</em>")
            else:
                output.append(f"<code>{esc(code)}</code>")
            offset = match.end()
        return "".join(output) + esc(value[offset:])

    output, paragraph, quote, items, list_type, code = [], [], [], [], None, None

    def flush():
        nonlocal paragraph, quote, items, list_type
        if paragraph:
            output.append(f'<p>{"<br>".join(map(inline, paragraph))}</p>')
            paragraph = []
        if items:
            output.append(f'<{list_type}>{"".join(f"<li>{inline(item)}</li>" for item in items)}</{list_type}>')
            items, list_type = [], None
        if quote:
            output.append(f'<blockquote><p>{"<br>".join(map(inline, quote))}</p></blockquote>')
            quote = []

    for line in body.replace("\r\n", "\n").replace("\r", "\n").strip().split("\n"):
        if code is not None:
            if re.fullmatch(r"\s*```\s*", line):
                output.append(f'<pre><code>{esc(chr(10).join(code))}</code></pre>')
                code = None
            else:
                code.append(line)
            continue
        if re.fullmatch(r"\s*```(?:[a-z0-9+-]+)?\s*", line, re.I):
            flush()
            code = []
        elif not line.strip():
            flush()
        elif match := re.fullmatch(r"(#{2,3})\s+(.+)", line):
            flush()
            level = len(match.group(1))
            output.append(f'<h{level}>{inline(match.group(2))}</h{level}>')
        elif match := re.fullmatch(r"(?:[-*]\s+|\d+\.\s+)(.+)", line):
            kind = "ol" if re.match(r"\d+\.", line) else "ul"
            if paragraph or quote or (items and list_type != kind):
                flush()
            list_type = kind
            items.append(match.group(1))
        elif match := re.fullmatch(r">\s?(.*)", line):
            if paragraph or items:
                flush()
            quote.append(match.group(1))
        else:
            if quote or items:
                flush()
            paragraph.append(line)
    flush()
    if code is not None:
        output.append(f'<pre><code>{esc(chr(10).join(code))}</code></pre>')
    return "\n".join(output)


def excerpt(body):
    text = re.sub(r"```[\s\S]*?```", " ", body)
    text = re.sub(r"(?m)^\s*(?:#{2,3}\s+|[-*]\s+|\d+\.\s+|>\s*)", "", text)
    text = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", text)
    return re.sub(r"\s+", " ", text.replace("*", "").replace("`", "")).strip()[:190]


def shell(title, description, content, relative="../", extra_script=""):
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="{esc(description)}" /><title>{esc(title)} | Samuel Regelbrugge</title>
<link rel="icon" href="{relative}favicon.ico" /><link rel="stylesheet" href="{relative}style.css" />
<script src="{relative}theme.js" defer></script>{extra_script}</head>
<body><a class="skip-link" href="#main">Skip to content</a>
<header class="site-header"><nav class="site-nav" aria-label="Primary navigation"><a class="brand" href="{relative}index.html"><span class="brand-monogram" aria-hidden="true">sr<span>.</span></span><span class="brand-name">Samuel Regelbrugge<span class="brand-subtitle">Security, with perspective.</span></span></a><a class="text-link" href="{relative}index.html">← Portfolio</a></nav></header>
<main id="main" class="blog-page">{content}</main>
<footer class="site-footer"><p>© 2026 Samuel Regelbrugge</p><a href="{relative}index.html">Back to the portfolio ↑</a></footer></body></html>
'''


def draft_review(drafts):
    cards = []
    for post in drafts:
        age = esc(post.get("date_hint", post.get("date", "Date needed")))
        cards.append(f'<article class="blog-card"><time>{age} · date needs review</time>'
                     f'<h2>{esc(post["title"])}</h2><div class="blog-body">{paragraphs(post["body"])}</div></article>')
    content = '<p class="eyebrow">Private local review</p><h1>LinkedIn drafts.</h1>' \
              '<p class="blog-intro">Check the text and exact dates before selecting posts for the public blog.</p>' \
              f'<div class="blog-list">{"".join(cards)}</div>'
    REVIEW.write_text(shell("Draft review", "Local LinkedIn draft review", content), encoding="utf-8")


def build():
    posts = read_posts()
    for post in posts:
        validate(post)
    slugs = [post["slug"] for post in posts]
    if len(slugs) != len(set(slugs)):
        raise ValueError("Duplicate blog slug")
    published = sorted((post for post in posts if post.get("published") is True), key=lambda post: post["date"], reverse=True)
    cards = []
    for post in published:
        source = f'<a href="{esc(post["source_url"])}" target="_blank" rel="noopener">Original on LinkedIn ↗</a>' if post.get("source_url") else ""
        content = f'<p class="eyebrow">Blog / {esc(post["date"])}</p><h1>{esc(post["title"])}</h1><article class="blog-body">{paragraphs(post["body"])}</article><div class="blog-source">{source}</div><a class="text-link" href="index.html">← All notes</a>'
        (BLOG / f'{post["slug"]}.html').write_text(shell(post["title"], post["body"][:155], content), encoding="utf-8")
        cards.append(f'<article class="blog-card"><time datetime="{esc(post["date"])}">{esc(post["date"])}</time><h2><a href="/blog/{esc(post["slug"])}.html">{esc(post["title"])}</a></h2><p>{esc(excerpt(post["body"]))}</p>{source}</article>')
    listing = "\n".join(cards) if cards else '<p class="blog-empty">No notes published yet. This is where I’ll share the ideas, experiments, and lessons that don’t fit in a résumé.</p>'
    content = f'<p class="eyebrow">Notes / In progress</p><h1>Thinking out loud.</h1><p class="blog-intro">Occasional thoughts on security, building things, competitions, and whatever else catches my attention.</p><div class="blog-list" id="blogList">{listing}</div><p class="blog-editor-link"><a href="/.auth/login/aad?post_login_redirect_uri=/blog/editor.html">Editor sign in</a></p>'
    (BLOG / "index.html").write_text(shell("Blog", "Occasional notes from Samuel Regelbrugge on security, building things, and other interests.", content, extra_script='<script src="/blog/remote.js" defer></script>'), encoding="utf-8")
    print(f"Built blog with {len(published)} published posts and {len(posts) - len(published)} drafts")


def import_linkedin(csv_path):
    published = read_posts()
    drafts = json.loads(DRAFTS.read_text(encoding="utf-8")) if DRAFTS.exists() else []
    posts = published + drafts
    existing = {post.get("source_url") for post in posts}
    added = 0
    with Path(csv_path).open(encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            body = (row.get("ShareCommentary") or "").strip()
            link = (row.get("ShareLink") or "").strip()
            date_raw = (row.get("Date") or "").strip()
            if not body or not link or link in existing:
                continue
            date = date_raw[:10]
            try:
                datetime.strptime(date, "%Y-%m-%d")
            except ValueError:
                continue
            title = next((line.strip() for line in body.splitlines() if line.strip()), "LinkedIn note")[:90]
            slug = slugify(f"{date}-{title}")
            base = slug
            suffix = 2
            while any(post["slug"] == slug for post in posts):
                slug = f"{base}-{suffix}"
                suffix += 1
            post = {"slug": slug, "title": title, "date": date, "body": body, "source_url": link, "published": False}
            try:
                validate(post)
            except ValueError:
                continue
            drafts.append(post)
            posts.append(post)
            existing.add(link)
            added += 1
    DRAFTS.write_text(json.dumps(drafts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    draft_review(drafts)
    print(f"Imported {added} LinkedIn posts into local, git-ignored drafts")


def import_linkedin_paste(text_path):
    """Extract the author's text from a pasted LinkedIn activity page.

    The page copy contains reposts and UI text, so imported entries remain
    private drafts with approximate ages until checked against LinkedIn.
    """
    published = read_posts()
    drafts = json.loads(DRAFTS.read_text(encoding="utf-8")) if DRAFTS.exists() else []
    known = {post.get("paste_fingerprint") for post in published + drafts}
    text = Path(text_path).read_text(encoding="utf-8-sig")
    added = 0
    for section in re.split(r"(?m)^Feed post\s*$", text)[1:]:
        lines = [line.strip() for line in section.splitlines()]
        if "• You" not in lines:
            continue
        author_line = lines.index("• You")
        age_line = next((i for i in range(author_line + 1, min(author_line + 6, len(lines))) if re.fullmatch(r"\d+(?:d|w|mo|yr)", lines[i])), None)
        if age_line is None:
            continue
        body_lines = []
        for line in lines[age_line + 1:]:
            if line.startswith("View ") or line in ("Boost", "Follow") or re.fullmatch(r"[\d,]+(?: impressions)?", line):
                break
            if line:
                body_lines.append(line)
            elif body_lines and body_lines[-1] != "":
                body_lines.append("")
        body = "\n".join(body_lines).strip()
        if not body:
            continue
        fingerprint = sha256(body.encode("utf-8")).hexdigest()[:16]
        if fingerprint in known:
            continue
        title = re.split(r"(?<=[.!?])\s+", body, maxsplit=1)[0].splitlines()[0][:90]
        slug = slugify(title)
        if any(post.get("slug") == slug for post in published + drafts):
            slug = f"{slug[:55]}-{fingerprint[:8]}"
        drafts.append({"slug": slug, "title": title, "date_hint": lines[age_line], "body": body,
                       "paste_fingerprint": fingerprint, "source": "LinkedIn activity page copy",
                       "published": False})
        known.add(fingerprint)
        added += 1
    DRAFTS.write_text(json.dumps(drafts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    draft_review(drafts)
    print(f"Imported {added} original-post excerpts as private drafts; check dates and text before publishing")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "import-linkedin", "import-paste"))
    parser.add_argument("path", nargs="?")
    args = parser.parse_args()
    if args.command == "build":
        build()
    elif args.command == "import-linkedin" and args.path:
        import_linkedin(args.path)
    elif args.command == "import-paste" and args.path:
        import_linkedin_paste(args.path)
    else:
        parser.error("import-linkedin or import-paste needs a source path")
