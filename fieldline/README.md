# FIELDLINE

A new phone-first field maintenance app for a pressure-pumping fleet. The original
Fleet 1 app remains in the repository root as a reference. FIELDLINE lives here,
uses a new data model, and never reads or writes the old fleet namespace.

## Run

Use Node 24 and Bun 1.4.2. From the **repository root**:

```sh
bun install --frozen-lockfile
npm run fieldline:dev
```

Vite serves port 3100. Open the browser preview for that port. Demo mode is the
default (`?mode=demo`): 18 stations, four standby pumps, a retained left-location
pump, independent active issues, a pending valves/seats spot check, and prior hours
and service history. Changes persist across refresh in this browser; demo devices
do not share a remote fleet. Demo uses the real command/revision/storage code,
with a local simulated server. Settings identifies the mode and saved queue.

No Firebase credentials are needed for demo. Set an operator name in Settings;
entered-by never separates fleet hours into operator-specific sheets.

## Crew workflow and capability map

| #   | Capability                                                                                                        | Where it lives                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Assigned and standby pump/deck hours, independent previous readings, suspicious-reading warnings, finalize/reopen | **Hours**; blur a field to save                                      |
| 2   | Station lineup, standby, assign, swap, left/return location                                                       | **Spread → View pump → Move / swap**                                 |
| 3   | Running, Down, Repairing, Derated, Spot check, Watch, durations                                                   | **Spread** roster/status counts and **Work**                         |
| 4   | Report/edit independent issues, holes/notes/limitation, Repair → Back running                                     | **View pump → Report issue**; active issue controls                  |
| 5   | Immediate unavailable spot check; later per-hole Good/Watch/Bad and Valve/Seat/Both results                       | **View pump → Start spot check → Enter results**; one retained event |
| 6   | Atomic replacement assignment and required pull reason                                                            | **View pump → Move / swap**, select replacement                      |
| 7   | Completed Valves & Seats, Full Rebuild, Other work, distinct from pull reason                                     | **View pump → Record completed service**                             |
| 8   | Permanent identity/history, location, software, fluid end brand                                                   | **Spread → Pump directory → View**, attributes/history               |
| 9   | Immutable live-shift issues/watches/repairs/swaps/lineup/notes snapshot                                           | **Records → Capture live handoff**                                   |
| 10  | Read-only issue queue and status filters                                                                          | **Work → Mechanics · read-only**                                     |
| 11  | Hours, down equipment, handoff, spread issues, past shift history, print/CSV/JSON/email draft                     | **Records → Report selector** and outgoing summary                   |

Viewing an old sheet/report never changes the clock-derived live shift in the
header or handoff. Day starts 05:30; night starts 17:30 and belongs to its start
date. Devices should use the location's local timezone and a correct clock.

Location, station assignment, and service condition are independent. An unassigned
pump may need repair. Moving left preserves identity/history. Permanent deletion
requires typing the number and is allowed only for an unassigned mistaken identity
with no operational history. Service logging does not resolve unrelated issues.

## Real Firebase project

1. Create a dedicated Firebase project and Firestore database. Enable Anonymous
   Authentication for this initial operator-name workflow.
2. Copy `fieldline/.env.example` to `fieldline/.env.local`; fill in that project's
   browser client configuration. Restart Vite after changes.
3. Deploy the supplied rules to the **new project**; do not overwrite the reference
   application's production rules. Review crew access requirements before opening
   the fleet to real users: the starter rules let authenticated anonymous users
   access fleet namespaces, and do not implement role-based fleet membership.
4. Open `?mode=firebase`, save the operator name, create 18 empty stations from
   Spread, add pump identities, and assign them. The connected fleet starts empty;
   demo data is never uploaded automatically.

| Environment variable           | Purpose                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `VITE_FIELDLINE_API_KEY`       | Firebase web API key                                                            |
| `VITE_FIELDLINE_PROJECT_ID`    | Dedicated project ID                                                            |
| `VITE_FIELDLINE_APP_ID`        | Firebase web app ID                                                             |
| `VITE_FIELDLINE_AUTH_DOMAIN`   | Project's Firebase Auth domain                                                  |
| `VITE_FIELDLINE_DATABASE_ID`   | Firestore database; default `(default)`                                         |
| `VITE_FIELDLINE_FLEET_ID`      | Namespace identifier; default `fleet1`                                          |
| `VITE_FIELDLINE_USE_EMULATORS` | `true` connects local Auth :9098 / Firestore :8088 **only in Vite development** |

Firebase web settings are public client configuration; never put service-account
keys or private credentials in `VITE_*` variables. This app does not inherit the
reference's `VITE_FIREBASE_*` configuration.

Entities live at `fieldline/{fleetId}/entities/{id}`; command receipts live at
`fieldline/{fleetId}/operations/{commandId}`. Each atomic transaction checks every
expected revision before writing. Real-time snapshots feed confirmed server state.
Offline commands save to IndexedDB **before** success appears, survive restart,
and drain after reconnection. Retries are idempotent. Conflicts retain the command,
keep newer state visible, and stop dependent commands. Export retained changes
from Settings before explicitly discarding them; re-enter the intended change
against current data. There is no automatic conflict overwrite/merge.

Local data is separated by demo/connected mode, project, database, and fleet.
Changing Firebase configuration opens a separate local queue; restore the previous
configuration to recover that project's pending work. Keep this origin's browser
data intact until all work is synced or exported. Browser data deletion/device loss
cannot be recovered from an unsynced local queue.

For network-restricted environments, Firebase needs `identitytoolkit.googleapis.com`,
`securetoken.googleapis.com`, `firestore.googleapis.com`, and the configured Auth
domain. Emulator downloads also need `storage.googleapis.com`.

## Build, installable/offline shell, deploy

```sh
npm run fieldline:typecheck
npm run fieldline:test
npm run fieldline:build
npm run fieldline:preview
```

The build generates `fieldline/dist` including manifest, icon, and a service worker.
Host this directory at a **dedicated origin root** over HTTPS; paths assume `/`.
After one successful online load, the built shell can reopen offline. Development
Vite does not install a service worker. New service-worker versions activate once
old app tabs close; they do not force reload unsaved forms. iOS install behavior
and physical glove/sunlight usability still need field testing.

A Firebase Hosting/rules configuration is included. From `fieldline/`, with a
Firebase CLI installed and authenticated to your **new test project**:

```sh
firebase deploy --only hosting,firestore:rules --project YOUR_NEW_PROJECT_ID
```

This task does not deploy anything. The reference's build remains `npm run build`
and outputs root `dist`; do not confuse that directory with `fieldline/dist`.

## Verification

Domain/queue tests cover boundaries, fleet hours from multiple operators, independent
meters, finalize races, multiple issues, spot lifecycle, separation of pump state,
swap versus service, guarded deletion, immutable handoffs, durable restart,
conflict retention, failed storage/transport, two-client subscriptions, and tab races.
The multi-client unit test uses a transactional in-memory backend, not Firebase.

A reproducible Playwright browser script is included. Install Playwright separately
or use an existing installation and Chromium:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
FIELDLINE_URL=http://localhost:3100 \
node fieldline/scripts/browser-test.mjs
```

Run `fieldline/scripts/stale-hours-test.mjs` with the same environment variables
to verify a meter being edited when another tab saves: the newer reading stays
visible and the stale draft remains a reviewable conflict.

For the offline shell check, run against `fieldline:preview` and add
`FIELDLINE_PRODUCTION=1`. The script uses isolated storage, emits screenshots and
an actual handoff PDF to `/tmp/fieldline-verification`, and checks the full hours,
issues, spot, swap/service, mechanics, handoff/report, cross-tab and conflict flows.

Local emulator setup (Java 21 and Firebase CLI):

```sh
firebase emulators:start --only auth,firestore --project demo-fieldline --config fieldline/firebase.json
```

Set a development `.env.local` with dummy client values, project `demo-fieldline`,
and `VITE_FIELDLINE_USE_EMULATORS=true`; emulated ports are defined in `firebase.json`.
The emulator download was blocked by this environment's egress policy. Firebase
SDK integration, deployed rules, two real devices and reconnection **have not been
validated**; complete those checks on a permitted emulator or new test project
before production use. The browser test proves local demo behavior only.

See [DESIGN.md](DESIGN.md) for flow choices, the schema, conflict protocol, and a
future read-only export/import plan for legacy Fleet 1 data. No importer is built
or run. Email opens a `mailto:` draft; it does not send mail or verify a mail client.
