import test from "node:test";
import assert from "node:assert/strict";
import {
  plan,
  applyCommand,
  records,
  operational,
  previousMeters,
  readingId,
  readingWarning,
  stationFor,
  pumpCondition,
  pumpStatus,
  Conflict,
  type Model,
  type Action,
  type Snapshot,
  type Command,
} from "./model";
import { Engine, type Backend } from "../data/engine";
import type { Storage } from "../data/storage";
Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
const at = new Date(2026, 9, 10, 12).getTime();
const apply = (m: Model, a: Action, actor = "Maria", time = at) =>
  applyCommand(m, plan(m, a, actor, time), []);
function fleet() {
  let m: Model = {};
  m = apply(m, { type: "setupStations", count: 18 });
  for (const number of ["101", "102", "103"])
    m = apply(m, { type: "addPump", number });
  return apply(m, {
    type: "movement",
    pumpId: "pump:101",
    destination: 1,
    reason: "Start shift",
  });
}
const issue = (pumpId = "pump:101"): Action => ({
  type: "issue",
  pumpId,
  status: "Down",
  category: "FLUID END",
  component: "PACKING",
  holes: [3],
  notes: "Leak",
  limitation: "",
  watch: false,
});
const reading = (
  pumpId = "pump:101",
  pumpHours: number | null = 110,
  deckHours: number | null = 220,
): Action => ({
  type: "reading",
  date: "2026-10-10",
  shift: "day",
  station: pumpId === "pump:101" ? 1 : null,
  pumpId,
  pumpHours,
  deckHours,
  notes: "",
});
for (const [h, min, date, shift] of [
  [5, 29, "2026-10-09", "night"],
  [5, 30, "2026-10-10", "day"],
  [17, 29, "2026-10-10", "day"],
  [17, 30, "2026-10-10", "night"],
  [0, 0, "2026-10-09", "night"],
] as const)
  test(`clock boundary ${h}:${min}`, () =>
    assert.deepEqual(operational(new Date(2026, 9, 10, h, min)), {
      date,
      shift,
    }));
test("night crosses month and year correctly", () =>
  assert.deepEqual(operational(new Date(2027, 0, 1, 3)), {
    date: "2026-12-31",
    shift: "night",
  }));
test("fleet hours combine operators with stable actor-independent keys and include standby", () => {
  let m = fleet();
  m = apply(m, reading(), "Maria");
  m = apply(m, reading("pump:102"), "Chuck");
  assert.equal(records(m, "reading").length, 2);
  assert.deepEqual(
    records(m, "reading").map((e) => e.actor),
    ["Maria", "Chuck"],
  );
  m = apply(m, reading("pump:101", 112, 222), "Chuck");
  assert.equal(records(m, "reading").length, 2);
  assert.equal(m[readingId("2026-10-10", "day", 1, "pump:101")].rev, 2);
});
test("previous pump and deck meters are independent, including zero", () => {
  let m = fleet();
  m = apply(m, { ...reading("pump:101", 0, 50), date: "2026-10-08" } as Action);
  m = apply(m, {
    ...reading("pump:101", null, 55),
    date: "2026-10-09",
  } as Action);
  assert.deepEqual(previousMeters(m, "pump:101", "2026-10-10", "day"), {
    pumpHours: 0,
    deckHours: 55,
  });
  assert.match(readingWarning(54, 55), /Below/);
  assert.match(readingWarning(100, 55), /24/);
});
test("invalid readings rejected and finalized sheet locks edits until reopened", () => {
  let m = fleet();
  assert.throws(() => plan(m, reading("pump:101", -1), "M"), /non-negative/);
  assert.throws(() => plan(m, reading("pump:101", NaN), "M"), /finite/);
  m = apply(m, {
    type: "sheet",
    date: "2026-10-10",
    shift: "day",
    finalized: true,
  });
  assert.throws(() => plan(m, reading(), "M"), /Reopen/);
  m = apply(m, {
    type: "sheet",
    date: "2026-10-10",
    shift: "day",
    finalized: false,
  });
  assert.doesNotThrow(() => apply(m, reading()));
});
test("concurrent new reading prevents a stale finalize", () => {
  const m = fleet();
  const finalize = plan(
    m,
    { type: "sheet", date: "2026-10-10", shift: "day", finalized: true },
    "Lead",
  );
  assert.throws(
    () => applyCommand(apply(m, reading()), finalize, []),
    Conflict,
  );
});
test("multiple independent issues keep IDs through repair and resolution", () => {
  let m = apply(apply(fleet(), issue()), {
    ...issue(),
    component: "D-RINGS",
  } as Action);
  const [a, b] = records(m, "issue");
  m = apply(
    m,
    { type: "editIssue", issueId: a.id, status: "Repairing" },
    "Mechanic",
    at + 60000,
  );
  assert.equal((m[a.id] as any).openedAt, a.openedAt);
  m = apply(
    m,
    { type: "editIssue", issueId: a.id, status: "Running" },
    "Mechanic",
    at + 120000,
  );
  assert.equal((m[a.id] as any).resolvedAt, at + 120000);
  assert.equal((m[b.id] as any).resolvedAt, null);
  assert.equal(pumpStatus(m, "pump:101"), "Down");
  assert.equal(records(m, "issue").length, 2);
});
test("spot check is unavailable immediately, accepts results on same event and converts without resetting downtime", () => {
  let m = apply(fleet(), { type: "spot", pumpId: "pump:101" });
  const spot = records(m, "issue")[0];
  assert.equal(spot.downAt, at);
  assert.equal(spot.findings.length, 0);
  assert.equal(pumpStatus(m, "pump:101"), "Spot check");
  assert.equal(pumpCondition(m, m["pump:101"] as any), "Out of Service");
  assert.throws(
    () => plan(m, { type: "spot", pumpId: "pump:101" }, "M"),
    /already/,
  );
  m = apply(
    m,
    {
      type: "editIssue",
      issueId: spot.id,
      findings: [{ hole: 3, condition: "BAD", part: "BOTH" }],
    },
    "Mechanic",
    at + 30000,
  );
  m = apply(
    m,
    { type: "editIssue", issueId: spot.id, convert: true },
    "Mechanic",
    at + 60000,
  );
  assert.equal(records(m, "issue").length, 1);
  assert.equal((m[spot.id] as any).downAt, at);
  assert.equal((m[spot.id] as any).findings[0].condition, "BAD");
  m = apply(m, { type: "editIssue", issueId: spot.id, status: "Running" });
  assert.equal(pumpStatus(m, "pump:101"), "Running");
});
test("watch clearing resolves only that issue; derate needs limitation", () => {
  let m = apply(fleet(), {
    ...issue(),
    status: "Watch",
    watch: true,
  } as Action);
  const watch = records(m, "issue")[0];
  m = apply(m, { type: "editIssue", issueId: watch.id, watch: false });
  assert.equal(pumpStatus(m, "pump:101"), "Running");
  assert.ok((m[watch.id] as any).resolvedAt);
  assert.throws(
    () => plan(m, { ...issue(), status: "Derated" } as Action, "M"),
    /limitation/,
  );
});
test("location, assignment and service condition stay separate across standby/left/return", () => {
  let m = apply(fleet(), {
    type: "identity",
    pumpId: "pump:101",
    software: "MDT",
    brand: "SPM",
    condition: "Needs Repair",
  });
  m = apply(m, {
    type: "movement",
    pumpId: "pump:101",
    destination: "standby",
    reason: "Needs repair",
  });
  assert.equal(stationFor(m, "pump:101"), null);
  assert.equal((m["pump:101"] as any).location, "on");
  assert.equal((m["pump:101"] as any).condition, "Needs Repair");
  m = apply(m, {
    type: "movement",
    pumpId: "pump:101",
    destination: "left",
    reason: "Shop",
  });
  m = apply(m, {
    type: "movement",
    pumpId: "pump:101",
    destination: "return",
    reason: "Back at site",
  });
  assert.equal((m["pump:101"] as any).condition, "Needs Repair");
  assert.equal(stationFor(m, "pump:101"), null);
  assert.equal(records(m, "movement").length, 4);
  assert.throws(
    () =>
      plan(
        m,
        {
          type: "movement",
          pumpId: "pump:101",
          destination: 2,
          reason: "Assign",
        },
        "M",
      ),
    /Ready/,
  );
});
test("swap reasons and completed service are distinct immutable records", () => {
  let m = apply(fleet(), {
    type: "movement",
    pumpId: "pump:101",
    destination: "standby",
    replacement: "pump:102",
    reason: "Pulled for leaking packing",
  });
  assert.equal(stationFor(m, "pump:102"), 1);
  assert.equal(stationFor(m, "pump:101"), null);
  const swap = records(m, "movement").find((e) => e.action === "swap")!;
  assert.equal(records(m, "service").length, 0);
  m = apply(m, {
    type: "service",
    pumpId: "pump:101",
    serviceType: "Valves & Seats",
    holes: [2],
    notes: "Replaced valve and seat",
    condition: "Ready",
  });
  assert.equal(records(m, "service")[0].notes, "Replaced valve and seat");
  assert.equal((m[swap.id] as any).reason, "Pulled for leaking packing");
});
test("active failures stop assignment even with stored Ready condition", () => {
  let m = apply(fleet(), issue("pump:102"));
  assert.throws(
    () =>
      plan(
        m,
        {
          type: "movement",
          pumpId: "pump:101",
          destination: "standby",
          replacement: "pump:102",
          reason: "Swap",
        },
        "M",
      ),
    /Ready/,
  );
});
test("mistaken identity deletion requires confirmation and is forbidden after any operational history", () => {
  let m = fleet();
  assert.throws(
    () =>
      plan(
        m,
        { type: "deleteMistake", pumpId: "pump:102", confirmation: "wrong" },
        "M",
      ),
    /confirm/,
  );
  assert.ok(
    !apply(m, {
      type: "deleteMistake",
      pumpId: "pump:102",
      confirmation: "102",
    })["pump:102"],
  );
  m = apply(m, reading("pump:102"));
  assert.throws(
    () =>
      plan(
        m,
        { type: "deleteMistake", pumpId: "pump:102", confirmation: "102" },
        "M",
      ),
    /history/,
  );
  assert.throws(
    () =>
      plan(
        m,
        { type: "deleteMistake", pumpId: "pump:101", confirmation: "101" },
        "M",
      ),
    /history/,
  );
});
test("handoff derives live date and copies issues, lineup and notes immutably", () => {
  let m = apply(fleet(), issue());
  m = apply(
    m,
    { type: "handoff", notes: "Watch packing" },
    "Lead",
    new Date(2026, 9, 11, 2).getTime(),
  );
  const snapshot = records(m, "handoff")[0];
  assert.equal(snapshot.date, "2026-10-10");
  assert.equal(snapshot.shift, "night");
  const original = JSON.stringify(snapshot);
  m = apply(m, {
    type: "editIssue",
    issueId: records(m, "issue")[0].id,
    status: "Running",
  });
  assert.equal(JSON.stringify(m[snapshot.id]), original);
  assert.equal(snapshot.issues.length, 1);
});
test("commands are atomic on revision conflict, receipts prevent duplicate retry", () => {
  const m = fleet();
  const a = plan(m, reading(), "Maria"),
    b = plan(m, reading("pump:101", 999, 999), "Chuck");
  const next = applyCommand(m, a, []);
  assert.throws(() => applyCommand(next, b, []), Conflict);
  assert.equal(
    (next[a.writes.find((e) => e.kind === "reading")!.id] as any).pumpHours,
    110,
  );
  assert.equal(applyCommand(next, a, [a.id]), next);
});
class Memory implements Storage {
  value: Snapshot | null = null;
  chain = Promise.resolve();
  async read() {
    return structuredClone(this.value);
  }
  change(fn: (s: Snapshot | null) => Snapshot): Promise<Snapshot> {
    let result!: Snapshot;
    const work = this.chain.then(() => {
      result = structuredClone(fn(structuredClone(this.value)));
      this.value = result;
    });
    this.chain = work.catch(() => {});
    return work.then(() => structuredClone(result));
  }
}
async function idle(e: Engine) {
  for (let i = 0; i < 100 && e.syncing; i++)
    await new Promise((r) => setTimeout(r, 1));
}
test("durable queue survives engine restart and syncs hours, issue, movement in order", async () => {
  const store = new Memory();
  const first = new Engine(store, "demo");
  first.paused = true;
  await first.load(fleet());
  await first.submit(reading());
  await first.submit(issue());
  await first.submit({
    type: "movement",
    pumpId: "pump:101",
    destination: "standby",
    reason: "Repair",
  });
  assert.equal((await store.read())!.commands.length, 3);
  const restarted = new Engine(store, "demo");
  restarted.paused = true;
  await restarted.load({});
  assert.equal(records(restarted.model, "issue").length, 1);
  assert.equal(stationFor(restarted.model, "pump:101"), null);
  restarted.paused = false;
  await restarted.flush();
  await idle(restarted);
  assert.equal((await store.read())!.commands.length, 0);
  assert.equal(records(restarted.snapshot.confirmed, "reading").length, 1);
  assert.equal(records(restarted.snapshot.confirmed, "issue").length, 1);
});
test("conflicting offline work is retained, newer server kept, dependent work blocked", async () => {
  const store = new Memory();
  const e = new Engine(store, "demo");
  e.paused = true;
  await e.load(fleet());
  await e.submit({
    type: "identity",
    pumpId: "pump:101",
    software: "ERAD",
    brand: "SPM",
    condition: "Ready",
  });
  await e.submit(issue());
  await store.change((s) => ({
    ...s!,
    demoServer: apply(
      s!.demoServer,
      {
        type: "identity",
        pumpId: "pump:101",
        software: "MDT",
        brand: "OMT",
        condition: "Ready",
      },
      "Other",
    ),
  }));
  e.paused = false;
  await e.flush();
  assert.equal(e.snapshot.commands.length, 2);
  assert.equal(e.snapshot.commands[0].status, "conflict");
  assert.equal((e.model["pump:101"] as any).software, "MDT");
  assert.equal((e.snapshot.confirmed["pump:101"] as any).software, "MDT");
  assert.equal(records(e.snapshot.demoServer, "issue").length, 0);
});
test("storage failure never signals success or changes saved state", async () => {
  const store = new Memory();
  const e = new Engine(store, "demo");
  e.paused = true;
  await e.load(fleet());
  store.change = async () => {
    throw new Error("Quota exceeded");
  };
  await assert.rejects(() => e.submit(reading()), /Quota/);
  assert.equal(e.snapshot.commands.length, 0);
});
test("backend failure retains change for retry and acknowledgement removes it", async () => {
  const store = new Memory();
  let fail = true;
  const backend: Backend = {
    subscribe: () => () => {},
    commit: async () => {
      if (fail) throw new Error("Connection lost");
    },
  };
  const e = new Engine(store, "firebase", backend);
  e.paused = true;
  await e.load(fleet());
  await e.actor("Maria");
  await e.submit(reading());
  e.paused = false;
  await e.flush();
  assert.equal(e.snapshot.commands[0].status, "failed");
  fail = false;
  await e.flush();
  assert.equal(e.snapshot.commands.length, 0);
  assert.equal(records(e.snapshot.confirmed, "reading").length, 1);
});

test("two clients receive live state; stale offline edit cannot replace another operator reading", async () => {
  let server = fleet();
  const receipts: string[] = [];
  const listeners = new Set<(model: Model) => void>();
  const backend: Backend = {
    subscribe(next) {
      listeners.add(next);
      queueMicrotask(() => next(structuredClone(server)));
      return () => {
        listeners.delete(next);
      };
    },
    async commit(command) {
      server = applyCommand(server, command, receipts);
      receipts.push(command.id);
      for (const next of listeners) next(structuredClone(server));
    },
  };
  const a = new Engine(new Memory(), "firebase", backend),
    b = new Engine(new Memory(), "firebase", backend);
  a.paused = true;
  b.paused = true;
  await a.load(server);
  await b.load(server);
  await a.actor("Maria");
  await b.actor("Chuck");
  await new Promise((r) => setTimeout(r, 5));
  await b.submit(reading("pump:101", 111, 222));
  await a.submit(reading("pump:101", 115, 230));
  a.paused = false;
  await a.flush();
  await idle(a);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(records(b.snapshot.confirmed, "reading")[0].pumpHours, 115);
  b.paused = false;
  await b.flush();
  assert.equal(b.snapshot.commands[0].status, "conflict");
  assert.equal(records(b.model, "reading")[0].actor, "Maria");
  assert.equal(records(server, "reading")[0].pumpHours, 115);
  a.unsubscribe();
  b.unsubscribe();
});

test("two tabs plan against the latest durable state rather than a stale render", async () => {
  const store = new Memory();
  const a = new Engine(store, "demo"),
    b = new Engine(store, "demo");
  a.paused = b.paused = true;
  await a.load(fleet());
  await b.load({});
  await Promise.all([
    a.submit(issue()),
    b.submit({ ...issue(), component: "PLUNGER" } as Action),
  ]);
  assert.equal((await store.read())!.commands.length, 2);
  a.paused = false;
  await a.flush();
  assert.equal(records(a.snapshot.confirmed, "issue").length, 2);
  assert.equal(a.snapshot.commands.length, 0);
});
