# FIELDLINE — design before implementation

## Reference study and scope

The Fleet 1 application in the repository root is retained unchanged as the
reference and fallback. Its types, shift helpers, fleet mutations, offline queue,
Firebase adapter and screens establish the domain. PROJECT_RULES.md and
src/constants/equipmentConstants.ts are absent in this checkout. The reference
uses mutable fleet documents, a localStorage outbox and many overlapping screens.
The new app lives in fieldline/ and deliberately uses a separate Firestore namespace.

## Flows

Start of shift: open Spread, see the clock-derived shift/date, running pumps,
standby condition and unresolved work. Enter hours: open Hours, choose a viewed
sheet (live by default), enter each meter with autosave on blur; previous meters
are independent, suspicious values remain visible for review. A problem: open a
pump, Report issue, choose Down/Derated/Watch, component, holes and notes. Repair
and Back running keep the issue ID. Spot check: one tap in pump detail opens an
active unavailable event; results come later, on that same event. Swap: choose a
replacement and a required pull reason, then atomically change assignment and
append movement/pull history. Completed service is a different record. End of
shift: finalize the viewed hours sheet, capture a handoff snapshot from live
fleet state and shift events, export/print or open an email draft.

## Screen map

Four destinations: Spread, Hours, Work, Records. Desktop left rail; mobile fixed
bottom rail. Spread is a station roster and standby list. Pump detail is a drawer
for identity, issues, assignments, movement, service and permanent history. Hours
is an operator-independent shift sheet. Work shows unresolved issues and a
read-only Mechanics mode. Records hosts dates, finalized sheets, handoffs,
reports and export. Settings is a small dialog for operator name, demo/backend
mode and sync conflicts. There is no redundant More menu or dashboard hierarchy.

## Visual system

Industrial daylight tool: white surfaces, cool gray #f4f5f7 canvas, ink #16212c,
red #A83232 primary actions, restrained 6px corners, open lists and thin dividers.
System sans typography, 16px body, 12–14px supporting text, 32px screen titles.
48px minimum phone controls (40px compact desktop controls), distinct textual statuses with consistent color dots.
Desktop roster with a work rail; mobile reduces columns rather than shrinking
text. No images are needed in the functional app; all UI is native HTML.
A generated primary-screen concept guides layout/tokens; functional state/data,
clock dates and accessible responsive details may differ deliberately.

## Data model

Each record is a versioned entity in fieldline/{fleetId}/entities/{id}:

- Pump: immutable ID, number, location, condition, control software, fluid end brand.
- Assignment: station ID and pump ID (or null), independent of pump condition.
- Issue: ID, pump, original station, category/component/holes, status, Watch flag,
  openedAt/downAt/resolvedAt, findings and immutable original operator.
- Reading: date/shift/station/pump identity, independent meters and entered-by audit.
- Sheet: date/shift, finalized/reopened state, finalizer and notes.
- Movement: leaving/returning/standby/assignment/swap/pull reason with pump identity.
- Service: actually completed work, separately from movement/pull reasons.
- Handoff: immutable snapshot of issues, Watch, repairs, swaps, lineup and notes.
- Audit: command ID, actor, timestamp and changed record IDs for permanent history.
  No Stage fields. Shared equipment constants and derived status live in domain/.
  Pump location, assignment and condition are never represented by one status field.

## Offline and sync

IndexedDB stores confirmed entities and a durable command outbox. Each local
command saves its outbox entry and optimistic entities atomically BEFORE reporting
success. Failed storage writes surface an error. Stable UUID commands and record
IDs survive refresh. Backend transactions read a command receipt plus every
expected revision before writing: all-or-nothing multi-record changes; stale
revisions conflict without overwriting current server state. A receipt makes
retries idempotent. A real-time snapshot supplies confirmed server entities;
pending commands overlay in order. Conflicted commands remain in the outbox,
stop dependent commands, and are plainly displayed with review/export/discard
options. Discard is explicit and exports recovery data first when requested.
A single browser Web Lock serializes queue drains across tabs, and IndexedDB
transactions serialize storage changes. Queued changes to a finalized sheet
also guard the sheet revision. Offline local data is scoped by mode, project, database, and fleet.
Demo uses the same command/domain/storage path, backed by durable local server
state. It never makes Firebase calls. A simulation control pauses demo sync and
can introduce a newer server revision for conflict evaluation.

## Backend and deployment

React/TypeScript/Vite + Firebase retained: no reason to change the crew's default
stack. New VITE*FIELDLINE*\* configuration is distinct from the old project.
Anonymous Auth is supported for initial evaluation; production access policies
must be reviewed before deployment. The included rules restrict namespace access
to signed-in users and preserve revision/receipt protocol. No old data is mutated.
Service worker caches the built app shell for offline reopen after one online load.
Live Firebase integration requires a dedicated project and external validation;
demo tests do not prove deployed Firebase behavior.

## Capability coverage and simplification

1 Hours: Hours sheet for assigned and standby pumps, validation, finalize/reopen.
2 Lineup/location: Spread + pump drawer; leaving preserves identity/history.
3 Live status: Spread + Work, derived from independent active issues.
4 Issues: pump drawer + Work; edit/repair/resolve same ID.
5 Spot check: one tap in drawer; per-hole results in Work/detail.
6 Swaps: drawer swap form with mandatory pull reason.
7 Service: drawer completed-service form and permanent history.
8 Identity/history: drawer attributes and timeline; retained left-location pumps.
9 Handoff: Records snapshot creation and report.
10 Mechanics: read-only Work mode, no mutation controls.
11 Reports: Records selector, print/export/email drafts, historical sheets.
The drawer centralizes pump actions; the four screens remove duplicated paths.

## Future import of Fleet 1

A separate read-only export/import tool can map fleet.pumps to permanent Pump
entities, stationPumps to assignments, logs to fleet-wide keyed Readings, finalized
sheets to Sheet entities, ops events to Issues with original IDs/timestamps,
sourceSpotCheck references to related IDs, and lifecycle events to Movement.
Ignore Stage. Preserve independent pump/deck readings, unknown operators, existing
resolved timestamps and legacy dates. Reconcile duplicate pump IDs/station
assignments explicitly; never silently merge or replace live records. Import in
a new namespace with stable source IDs, receipts, dry-run counts and operator
review. No importer or automatic production migration is run by this app.

## Implementation comparison and verification

The generated concept and rendered 1440px desktop / 390px phone screens were
inspected with view_image. Compared features: (1) the four-item left navigation
and fixed mobile bottom navigation, (2) white station roster plus right work rail,
(3) cool-gray canvas, ink typography, company-red primary action, (4) distinct
status dots with text labels and thin dividers, (5) station/pump rows with one View
action and stacked mobile details, (6) a prominent Enter hours action. All six
are implemented. Deliberate differences: six status counts include Watch; actual
issues/clock values replace concept fixtures; taller rows and 48px phone controls
accommodate gloves; searchable lineup and retained identities add working depth.
Previous meter values sit below inputs so four-digit readings remain readable on
phones. Forms have explicit label associations, a keyboard focus trap and Escape
close. Native Playwright/Chromium was used because no Browser tool is available.

25 domain/queue tests pass. The full browser workflow passes against both Vite
and the built app, including actual IndexedDB persistence, tab broadcast, PDF
printing, conflict UI, and offline reload/edit/reload of the production shell.
The offline test found Vite's Vary: Origin header prevented asset cache hits;
shell lookups now ignore Vary for this origin's cached build assets. Firebase is
loaded on demand rather than inflating the demo's initial JavaScript bundle.
The emulator binary download returned HTTP 403 Domain forbidden. Deployed
Firebase rules, real SDK transactions/subscriptions and two-device reconnection
remain external checks, not inferred from the in-memory or local-demo tests.
