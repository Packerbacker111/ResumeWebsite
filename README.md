# Samuel Regelbrugge

Personal cybersecurity portfolio. Plain HTML, CSS, and JavaScript; no build step or production dependencies.

## Preview

Run the local preview from this directory:

```sh
python tools/preview.py
```

Open http://127.0.0.1:4173/. Refresh after making changes. The preview disables caching (including old conditional requests), binds only to this computer, and hides directory listings and dotfiles. Versioned stylesheet and script URLs also prevent the earlier preview from reusing outdated assets.

## Content and behavior

- `index.html`: portfolio content and social metadata.
- `style.css`: dark and light themes, responsive layouts, reduced-motion and print styles.
- `script.js`: theme preference, mobile navigation, and optional critical-alert effects.
- `lab-model.js`: two fictional investigations with evidence-gated decisions and different outcomes.
- `response-lab.js` / `response-lab.css`: accessible modal workbench, evidence tabs, activity trail, simulated collection, decision feedback, and recovery. No telemetry is requested from a real system or sent to a server.
- `content/SRegelbruggeResume.pdf`: public résumé. Keep phone numbers and other private contact information out of this file; do not add the private source PDF to this repository.
- `public/og.png`: social-sharing image.

The demo is illustrative, not a live SOC feed or a report of a real employer incident. It uses reserved documentation IP addresses and a fictional `.example` hostname. The critical badge pulse and panel-edge glow repeat on a slow 3.2-second cycle without flashing text. A visible pause/resume control remembers the visitor's preference; effects stop off-screen (when IntersectionObserver is available), in hidden tabs, and behind the open lab. Reduced-motion preferences disable them entirely. Without JavaScript, the alert remains static. The collection playback lasts 1.26 seconds; reduced-motion preferences skip it and disable the dialog entrance. Closing, resetting, or switching cases cancels pending playback. All main content and links work without JavaScript.

The Vivmark/Equity role is one continuous tenure starting July 2025. Work history highlights incident response, HackerOne validation, and detection tuning (documented in the earlier résumé). The Microsoft Entra and AI-assisted telemetry outcomes remain in the selected-work cards, without repeating them in the role bullets or adding an employee-count callout. Certification dates are earned dates, not claims about current renewal status.

## Checks

Run `node --test tests/site.test.cjs` for the dependency-free source and interaction tests. These cover both investigations, evidence gating, incorrect decisions, recovery, replay, interrupted collection, keyboard tab state, reduced motion, theme storage, menu behavior, local links, and text contrast. They do not replace visual browser testing.

The Earlier Foundations tile uses the [CompTIA wordmark from Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Comptia-logo.svg), attributed to CompTIA. It identifies the credential issuer, not an endorsement.

## Publishing

The existing Azure Static Web Apps workflow remains unchanged. A push to `master` triggers publication. Review the page and public résumé before pushing; local edits alone do not publish the site.

Keep the canonical URL and social image URLs aligned with the production domain if it changes.
