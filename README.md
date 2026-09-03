# Samuel Regelbrugge — Cybersecurity Portfolio

**Calm in the critical moments.**

My personal portfolio, bringing together security operations, offensive testing, and practical automation. Alongside my experience and projects, an interactive Response Lab gives visitors a hands-on look at investigating an alert and making an evidence-based decision.

[Explore the website →](https://samuel.regelbrugge.net/)

## What’s inside

- **Selected work:** AI-assisted endpoint telemetry, Microsoft Entra workflow automation, vulnerability validation, and offensive security experience.
- **Professional background:** work history, education, certifications, cybersecurity competitions, and a downloadable résumé.
- **Interactive design:** dark and light themes, a SOC-inspired alert panel, and an investigation workbench built for desktop and mobile.
- **Accessibility-minded interactions:** keyboard navigation, reduced-motion support, pausable alert effects, and core portfolio content that remains available without JavaScript.

## Response Lab

Take the analyst seat in two scenarios: suspicious endpoint execution and an impossible-travel alert. Collect simulated telemetry, review process, network, and identity evidence, then decide whether to contain a threat or close an alert as benign.

The lab includes an activity trail, feedback on decisions, recovery steps, and replayable cases. The emphasis is on context and judgment—not treating every alert as a confirmed incident.

All cases and telemetry are fictional. The lab runs entirely in the browser, makes no connections to live security systems, and does not expose employer data or tooling.

## Built with

- **HTML, CSS, and vanilla JavaScript** — no frontend framework or build step.
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
node --test tests/site.test.cjs
```

## Credits

The [CompTIA wordmark](https://commons.wikimedia.org/wiki/File:Comptia-logo.svg) is sourced from Wikimedia Commons and attributed to CompTIA. Company and certification marks identify their respective organizations and do not imply endorsement.
