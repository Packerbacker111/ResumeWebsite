# Samuel Regelbrugge — Cybersecurity Portfolio

**Calm in the critical moments.**

My personal portfolio, bringing together security operations, offensive testing, and practical automation. Alongside my experience and projects, an interactive Response Lab gives visitors a hands-on look at investigating an alert and making an evidence-based decision.

[Explore the website →](https://samuel.regelbrugge.net/)

## What’s inside

- **Selected work:** AI-assisted endpoint telemetry, Microsoft Entra workflow automation, vulnerability validation, and offensive security experience.
- **Project stories:** dedicated pages for the telemetry and Entra workflows, plus RPM’s development and interface preview.
- **Professional background:** work history, education, certifications, cybersecurity competitions, and a downloadable résumé.
- **Interactive design:** dark and light themes, a SOC-inspired alert panel, and an investigation workbench built for desktop and mobile.
- **Shareable lab cases:** open the endpoint and identity investigations directly with `#lab-endpoint` and `#lab-identity` links.
- **Small details:** a textured hero, visual project workflows, subtle section entrances, and a searchable quick-jump palette (press `/` or use the navigation button).
- **Currently tinkering:** RPM — Real Password Manager, the Trump countdown site, CTF challenges, and CCDC red teaming.
- **Cookie challenge:** a separate, real HTTP challenge backed by a managed Azure Function. The flag is generated on the server.
- **Blog:** static notes, with a LinkedIn archive importer that creates drafts for review.
- **Accessibility-minded interactions:** keyboard navigation, reduced-motion support, pausable alert effects, and core portfolio content that remains available without JavaScript.

## Response Lab

Take the analyst seat in two scenarios: suspicious endpoint execution and an impossible-travel alert. Collect simulated telemetry, review process, network, and identity evidence, then decide whether to contain a threat or close an alert as benign.

The lab includes an activity trail, feedback on decisions, recovery steps, and replayable cases. Each completed case ends with an evidence debrief and the reasoning behind the response. The emphasis is on context and judgment—not treating every alert as a confirmed incident.

All cases and telemetry are fictional. The lab runs entirely in the browser, makes no connections to live security systems, and does not expose employer data or tooling.

## Built with

- **HTML, CSS, and vanilla JavaScript** — no frontend framework; a small Python step optimizes the portrait.
- **Separate investigation logic and interface code** — the case model drives the interactive workbench.
- **Node.js’s built-in test runner** — automated checks for case logic, interactions, accessibility-related behavior, links, and color contrast.
- **Azure Static Web Apps and GitHub Actions** — hosting and automated deployment from `master`.

## Run locally

With Python 3 installed, run this command from the repository directory:

```sh
python tools/preview.py
```

Open [localhost:4173](http://127.0.0.1:4173/) in your browser. The preview server runs locally and serves fresh assets without caching.

To run the automated checks with Node.js:

```sh
python tools/blog.py build
node --test tests/*.test.cjs
```

## Replacing the portrait

Replace `images/pfp3.jpg` with the new original, keeping that filename. Install the image dependency once, then regenerate the variants:

```sh
python -m pip install -r tools/requirements.txt
python tools/optimize_portrait.py
```

The script applies the photo’s orientation, makes a centered square crop, removes source metadata, and writes WebP sizes from 96 to 1080 pixels plus JPEG fallbacks. It preserves the original. Both portrait locations already select an appropriate size for the screen, so no image paths need changing. Update the about-photo alt text if the photo’s context changes.

Review the crop in the local preview before committing the original and generated files. To check that the variants match the current original without changing files:

```sh
python tools/optimize_portrait.py --check
```

Deployment regenerates the variants and excludes the full-size original from the published site. `images/portrait/manifest.json` records the source fingerprint and generated file sizes and hashes.

## RPM interface preview

`public/rpm-preview.html` illustrates RPM’s Windows password-health and credential-detail views with fictional entries. Its colors, logo, labels, and checks are based on the RPM repository’s `BRAND.md`, `PasswordHealthView.xaml`, and `CredentialDetailView.xaml`. It is a browser illustration of those layouts, not a native-app screenshot or a working vault.

The portfolio thumbnail is an optimized capture of the health overview from that page. When RPM’s design changes, update the preview HTML/CSS, capture the health overview again, and replace the 480/960-pixel WebP images and 960-pixel JPEG in `images/rpm`. Keep its example data and illustration caption visible. The preview supports click and keyboard tab selection, including arrow keys, Home, and End.

## Blog publishing

The browser editor is staged at `/blog/editor.html`. Azure Static Web Apps must
assign your Microsoft Entra account the `blog_editor` role through Role Management
before it can be opened. Both that page and `/api/blog/admin/*` require the role;
the API checks the principal again before reading drafts or accepting changes.
Create a Standard GPv2 Azure Storage account with a private blob container and
set `BLOG_STORAGE_CONNECTION_STRING` as a Static Web Apps API application setting.
The API creates a private `blog-posts` container on first use. Do not put the
connection string in the repository or browser. The editor can create and update
posts, save drafts, publish, and unpublish. Publishing makes a post available
immediately through the public blog API. Existing repository posts continue to
render as static pages. The browser editor is not active until storage and the
role invitation are configured.

Write a post in `blog/posts.json` with `slug`, `title`, `date` (`YYYY-MM-DD`),
`body`, and `published: true`, then run `python tools/blog.py build`. A published
post gets its own page at `/blog/<slug>.html`. Treat `blog/posts.json` as public
source code and keep private drafts outside it.

To backfill from LinkedIn, request your account archive and locate `Shares.csv`.
Run `python tools/blog.py import-linkedin path/to/Shares.csv`. The importer saves
new entries in git-ignored `blog/drafts.json`. Review them, then copy only the
selected entries into `blog/posts.json` and set `published: true`. Re-importing
the same archive skips existing links. Keep the original archive outside this
repository; it may contain private data.
If you only have copied LinkedIn activity text, run
`python tools/blog.py import-paste path/to/activity.txt`. This extracts your own
post excerpts and skips reposts, but the pasted view provides approximate ages
instead of exact dates or post links. Open the generated, git-ignored
`blog/draft-review.html` to review them. Check those details before publishing.
LinkedIn currently restricts the API permission for reading member posts, so
future posts require another export/import or manual entry. The importer does
not scrape LinkedIn or publish anything automatically.

## Cookie challenge deployment

The challenge endpoint is `/api/cookie-challenge`. Its flag is generated with
cryptographic randomness when a Function instance starts, so no Azure setting
is required. It may change after a cold start; that is fine for a standalone
puzzle without scoring. For a scored event that needs one stable flag, set the
optional Azure application setting `COOKIE_CTF_FLAG` to a private value. Never
commit that value or put it in `api/local.settings.json`.
The API is intentionally a small vulnerable exercise: it trusts the editable
`show-flag` cookie only for this one endpoint. The page needs the live Azure API;
the local static preview cannot run it. `api/` is deployed as a managed Function,
while only the staged public files in `_site/` are served as site assets.

## Security maintenance

The site has no authentication or visitor-submitted content. The cookie challenge
has one isolated backend endpoint; it is not an access-control mechanism. Lab data is
fictional and rendered as text. `staticwebapp.config.json` sets browser security
headers, including a Content Security Policy that allows local scripts and the
Google Fonts stylesheet/font origins, and blocks inline scripts, network APIs,
embedding, and form submission. Only the cookie challenge page allows same-origin
API requests. The local preview uses the global headers.

Deployment runs the tests and stages only the listed public files and images in
`_site`; repository metadata, tests, and development tools are excluded. Add new
public assets to the staging step when needed. Keep credentials in GitHub Secrets.

After deploying, verify the response headers on the live site and check the theme,
Response Lab, fonts, and résumé link in a browser. Local checks do not verify Azure
account permissions, DNS/TLS configuration, or the deployed site's headers.

See [Azure's configuration reference](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration)
for the hosting header settings.

## Credits

The [CompTIA wordmark](https://commons.wikimedia.org/wiki/File:Comptia-logo.svg) is sourced from Wikimedia Commons and attributed to CompTIA. Company and certification marks identify their respective organizations and do not imply endorsement.
