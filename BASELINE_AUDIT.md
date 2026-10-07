# First development pass

Imported the supplied Fleet 1 ZIP as the working baseline. The original baseline
passed TypeScript, the existing scenario suite, and the production build.

## Architecture preserved

`FleetContext` holds cached and optimistic state, Firebase authentication,
Firestore snapshot listeners for fleet/logs/operational events, and mutation APIs.
`fleetMutations` applies transaction-safe lineup/inventory changes. Operational
issues have independent IDs. Mechanics uses read-only issue extraction; Hours
looks up the two previous meters independently. The durable queue uses localStorage.
Dates use the device's local time: 05:30/17:30 boundaries and the Night Shift's
starting calendar date. No database, framework, or permission-system migration.

## Fixes

- Queue reconciliation preserves writes added during network requests and retains
  failures. Failed writes block dependent writes to the same document.
- Issue edits send changed fields with transactional expected-state checks.
  Identity, original station/pump, created time, and opened time are not editable.
  Conflicting queued edits are retained and surfaced in Sync Error details.
- Queue recovery overlays only pending changes, preserving independent server
  fields. Retried event creates and already-applied pump swaps are idempotent.
- Assigning to an expected empty station rejects newer server assignments.
  Direct swap conflicts restore the server state rather than the optimistic cache.
- Fleet transactions replace the current transaction result so removed map keys
  are actually removed. Listener initialization waits for confirmed server absence
  and checks again in a transaction; snapshots no longer auto-write station lists.
- Clear Watch preserves DOWN/REPAIRING/DERATED issues. Watch-only items resolve
  and display WATCH rather than RUNNING in Mechanics/reports.
- DOWN transitions start `downAt` at the transition; repair retains it. Spot Check
  results and explicit failure conversion retain the event and downtime. Unchanged Spot Check issue edits preserve
  its display type. Never-down DERATED return-to-service has zero downtime.
- Removed unreachable duplicate-issue prompts and Stage/Recheck Next Stage UI.
  Historical fields are retained in records/types, without migration or deletion.
- Fixed mobile Home overflow, added fixed bottom navigation with safe-area spacing,
  removed duplicate navigation and floating Hours button, made inactive shift
  compact, and separated Spot Check from DOWN counts on Home.
- Firebase client configuration now comes from environment variables. Supplied
  configuration remains in ignored local files, excluded from commits.

## Verification

TypeScript, the original scenario suite, the added regression suite, frozen-lock
installation, and production build are required checks. Browser QA uses isolated
cached data with Firebase requests blocked: mobile and desktop layout/navigation,
one-tap Spot Check, in-place results, and read-only Mechanics. These are offline
checks, not evidence of live multi-device synchronization.

## Remaining risks / follow-up

- Live Firebase could not be checked: the environment proxy denied the Auth
  destination (CONNECT 403). Save the proposed Firebase domain additions in
  environment settings, then validate authentication, database access, deployed
  rules, and real device reconnect/conflict scenarios using a test project.
- Hour autosave still sends both meters/notes for one reading. Simultaneous edits
  to the same reading can overwrite newer values; use field-level expected-state
  mutations in a subsequent focused pass. Moving readings uses multiple writes.
- localStorage read/modify/write is not atomic across browser tabs. Multiple tabs
  sharing storage and storage corruption/quota failures need dedicated validation.
  Storage failures now surface rather than silently reporting success.
- Legacy queued full-document writes remain supported for recovery; review them
  before reconnecting. New issue edits use the safer patch protocol.
- Online operations are not all durably queued before network acknowledgement;
  closing a tab during an in-flight write needs additional crash/reload testing.
- Existing rules allow any authenticated user to write the fleet. Mechanics is
  read-only in the UI, not a separate backend permission boundary. RBAC remains
  deferred as requested; do not interpret the view as security enforcement.
- The initial bundle remains about 1.16 MB before compression. No service worker
  caches the app shell. Safari/iPhone, Android, real printing, and slow/offline
  reload behavior remain unverified in this Chromium pass.
- Some original tests simulate operations rather than exercising the Firebase SDK.
  The added tests exercise production helpers but do not replace emulator or live
  multi-device tests.
