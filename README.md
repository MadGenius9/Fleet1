# Fleet 1 Pump Hours

The existing React / TypeScript / Vite application for pump hours, inventory,
lineup, Pump Ops, read-only Mechanics, shift handoff, and separate printable reports.
Firebase Auth and Firestore remain the backend.

## Development

Verified with Node.js 24 and Bun 1.4.2. The supplied `bun.lock` requires a current
Bun version; Bun 1.3.14 cannot read its version-2 format.

1. Run `bun install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local` and configure your existing Firebase project.
   In the prepared cloud environment the supplied settings are already retained locally.
   These are browser client settings; never supply service-account keys or private tokens.
3. Run `npm run dev` (port 3000).
4. Run `npm run typecheck`, `npm test`, and `npm run build` before committing.

The database ID defaults to `(default)` only when not configured. Preserve your
existing named Firestore database by setting `VITE_FIREBASE_DATABASE_ID`.
Missing core Firebase settings produce an explicit setup screen.

Keep `.env.local`, local Firebase configuration, dependencies, and build output
out of Git. No Gemini key is required by this app's current workflows.

## Validation and backend access

`npm test` runs the imported scenario suite and the added Node test suite against
production business helpers and the queue runner. It does not validate a deployed
Firebase backend. See [BASELINE_AUDIT.md](BASELINE_AUDIT.md) for first-pass findings.

Live operation needs Firebase Anonymous Auth (or the existing Google sign-in),
the selected Firestore database, deployed compatible rules, and access to
`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`,
`firestore.googleapis.com`, and your Firebase Auth domain. Do not deploy rules or
write smoke-test records into the production fleet merely to test setup.

The cloud install and start instructions are saved in the environment draft.
Each cloud task is isolated; use its existing checkout rather than creating a
Git worktree unless explicitly requested.
