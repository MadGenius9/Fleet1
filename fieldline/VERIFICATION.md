# Verification — 2026-10-10

Executed in this cloud workspace using Node 24.19.0, Bun 1.4.2 and Chromium via
Playwright 1.58.2. No production backend writes or deployment were performed.

| Check                                      | Result                                              |
| ------------------------------------------ | --------------------------------------------------- |
| Frozen dependency installation             | Passed; pinned lockfile unchanged                   |
| `npm run fieldline:typecheck`              | Passed                                              |
| `npm run fieldline:test`                   | 25 tests passed, zero failures                      |
| `npm run fieldline:build`                  | Passed; app shell/manifest/service worker emitted   |
| Browser workflow against Vite              | Passed                                              |
| Browser workflow against production build  | Passed; includes offline reload/edit/reload         |
| Concurrent typing versus newer tab reading | Passed; newer value visible, stale command retained |
| Reference `npm run typecheck`              | Passed                                              |
| Reference `npm test`                       | Scenario suite and 17 regression tests passed       |
| Reference `npm run build`                  | Passed                                              |
| `git diff --check`                         | Passed                                              |

The browser workflow checks all 18 stations and 22 initial hours rows, pump/deck
save, finalize/reopen, actual IndexedDB queued persistence across reload, immediate
spot downtime, results/conversion on the same ID, independent issues/resolution,
atomic swap, separate service and visible history, read-only mechanics, clock-live
handoff while viewing another date, five report selections, print CSS and a generated
handoff PDF, cross-tab state, conflict display, and 390px phone overflow. The built
app additionally reopens offline, records a standby meter offline, and preserves it
through another offline reload. No page exceptions were observed. Browser test
scripts and execution instructions are in README.md.

Firebase uses a separate lazy-loaded bundle. The build reports a non-fatal >500kB
warning for that SDK bundle (approximately 530kB / 156kB gzip); the initial app
bundle is approximately 283kB / 88kB gzip. The service worker precaches both so
configured backend mode can still open offline after the first online load.

## Limits and next checks

The Firestore emulator JAR download returned HTTP 403 `Domain forbidden` from the
current network policy. Its domain, `storage.googleapis.com`, was added to the
saved cloud configuration draft; that draft still requires saving/publishing to
activate. No real Firebase project was configured for FIELDLINE. The SDK adapter,
rules, and emulator development connection compile, but **actual Firebase
transaction/rule/subscription behavior and two physical devices reconnecting are
unverified**. Shared-backend unit tests simulate that protocol; local demo and tab
tests do not substitute for deployed backend validation.

Before production use, run those backend checks in a permitted emulator or dedicated
test project and establish crew/fleet access rules beyond starter anonymous auth.
Also field-test physical glove/sunlight use and iOS PWA installation. Mailto drafts
are implemented, but mail client handoff/delivery is not verified. Legacy import is
planned in DESIGN.md; no importer or automatic migration is implemented.
