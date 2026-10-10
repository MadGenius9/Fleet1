export type Shift = "day" | "night";
export const CATEGORIES = [
  "FLUID END",
  "POWER END",
  "ENGINE",
  "TRANSMISSION / DRIVE",
  "FUEL",
  "ELECTRICAL / CONTROLS",
] as const;
export const FLUID_COMPONENTS = [
  "PACKING",
  "D-RINGS",
  "VALVE / SEAT",
  "PLUNGER",
  "SWINGING FLUID END",
  "LEAK",
  "OTHER",
] as const;
export const COMPONENTS: Record<string, readonly string[]> = {
  "FLUID END": FLUID_COMPONENTS,
  "POWER END": ["CROSSHEAD", "BEARING", "LUBE SYSTEM", "OTHER"],
  ENGINE: ["COOLING", "OIL", "TURBO", "OTHER"],
  "TRANSMISSION / DRIVE": ["TRANSMISSION", "HYDRAULIC MOTOR", "OTHER"],
  FUEL: ["FILTER", "LEAK", "OTHER"],
  "ELECTRICAL / CONTROLS": ["SENSOR", "HARNESS", "CONTROL SYSTEM", "OTHER"],
};
export const SOFTWARE = ["", "ERAD", "IDMS", "MDT"] as const;
export const BRANDS = [
  "",
  "Gardner Denver",
  "SPM",
  "OMT",
  "Vulcan",
  "Kerr",
  "Endurofrac",
  "Alpha",
  "Best",
] as const;
export type Condition = "Ready" | "Needs Repair" | "Out of Service";
export type Status =
  | "Running"
  | "Down"
  | "Repairing"
  | "Derated"
  | "Watch"
  | "Spot check";
export interface Base {
  id: string;
  kind: string;
  rev: number;
}
export interface Pump extends Base {
  kind: "pump";
  number: string;
  location: "on" | "left";
  condition: Condition;
  software: string;
  brand: string;
  hasHistory: boolean;
}
export interface Assignment extends Base {
  kind: "assignment";
  station: number;
  pumpId: string | null;
}
export interface Finding {
  hole: number;
  condition: "GOOD" | "WATCH" | "BAD";
  part: "VALVE" | "SEAT" | "BOTH";
}
export interface Issue extends Base {
  kind: "issue";
  pumpId: string;
  station: number | null;
  type: "problem" | "spot";
  status: Exclude<Status, "Spot check">;
  category: string;
  component: string;
  holes: number[];
  notes: string;
  limitation: string;
  watch: boolean;
  openedAt: number;
  downAt: number | null;
  resolvedAt: number | null;
  createdBy: string;
  findings: Finding[];
  date: string;
  shift: Shift;
}
export interface Reading extends Base {
  kind: "reading";
  pumpId: string;
  station: number | null;
  date: string;
  shift: Shift;
  pumpHours: number | null;
  deckHours: number | null;
  notes: string;
  actor: string;
  at: number;
}
export interface Sheet extends Base {
  kind: "sheet";
  date: string;
  shift: Shift;
  finalized: boolean;
  actor: string;
  at: number;
  notes: string;
}
export interface Movement extends Base {
  kind: "movement";
  pumpId: string;
  action: "assign" | "swap" | "standby" | "left" | "return";
  from: number | null;
  to: number | null;
  replacement: string | null;
  reason: string;
  actor: string;
  at: number;
  date: string;
  shift: Shift;
}
export interface Service extends Base {
  kind: "service";
  pumpId: string;
  type: "Valves & Seats" | "Full Rebuild" | "Other";
  holes: number[];
  notes: string;
  actor: string;
  at: number;
}
export interface Handoff extends Base {
  kind: "handoff";
  date: string;
  shift: Shift;
  actor: string;
  at: number;
  notes: string;
  lineup: Assignment[];
  issues: Issue[];
  repairs: Issue[];
  swaps: Movement[];
}
export interface Audit extends Base {
  kind: "audit";
  actor: string;
  at: number;
  action: string;
  recordIds: string[];
  pumpIds: string[];
}
export interface Deleted extends Base {
  kind: "deleted";
}
export type Entity =
  | Pump
  | Assignment
  | Issue
  | Reading
  | Sheet
  | Movement
  | Service
  | Handoff
  | Audit
  | Deleted;
export type Model = Record<string, Entity>;
export type CommandStatus = "pending" | "conflict" | "failed";
export interface Command {
  id: string;
  actor: string;
  at: number;
  action: string;
  writes: Entity[];
  expected: Record<string, number | null>;
  status: CommandStatus;
  error?: string;
}
export interface Snapshot {
  confirmed: Model;
  commands: Command[];
  demoServer: Model;
  receipts: string[];
  actor: string;
}
export const uid = () => crypto.randomUUID();
export function records<K extends Entity["kind"]>(
  model: Model,
  kind: K,
): Extract<Entity, { kind: K }>[] {
  return Object.values(model).filter((e) => e.kind === kind) as Extract<
    Entity,
    { kind: K }
  >[];
}
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function operational(now = new Date()): { date: string; shift: Shift } {
  const mins = now.getHours() * 60 + now.getMinutes();
  const date = new Date(now);
  if (mins < 330) date.setDate(date.getDate() - 1);
  return {
    date: localDate(date),
    shift: mins >= 330 && mins < 1050 ? "day" : "night",
  };
}
export const sheetId = (date: string, shift: Shift) => `sheet:${date}:${shift}`;
export const readingId = (
  date: string,
  shift: Shift,
  station: number | null,
  pumpId: string,
) => `hours:${date}:${shift}:${station ?? "standby"}:${pumpId}`;
export function activeIssues(model: Model, pumpId?: string): Issue[] {
  return records(model, "issue").filter(
    (e) => !e.resolvedAt && (!pumpId || e.pumpId === pumpId),
  );
}
export function issueStatus(issue: Issue): Status {
  return issue.resolvedAt
    ? "Running"
    : issue.type === "spot"
      ? "Spot check"
      : issue.status;
}
export function pumpStatus(model: Model, pumpId: string): Status {
  const issues = activeIssues(model, pumpId);
  for (const status of [
    "Down",
    "Spot check",
    "Repairing",
    "Derated",
  ] as Status[])
    if (issues.some((e) => issueStatus(e) === status)) return status;
  return issues.some((e) => e.watch || e.status === "Watch")
    ? "Watch"
    : "Running";
}
export function pumpCondition(model: Model, pump: Pump): Condition {
  const status = pumpStatus(model, pump.id);
  return ["Down", "Spot check", "Repairing"].includes(status)
    ? "Out of Service"
    : status === "Derated" && pump.condition === "Ready"
      ? "Needs Repair"
      : pump.condition;
}
export function stationFor(model: Model, pumpId: string): number | null {
  return (
    records(model, "assignment").find((e) => e.pumpId === pumpId)?.station ??
    null
  );
}
export function issueLabel(issue: Issue): string {
  if (issue.type === "spot")
    return issue.findings.length
      ? issue.findings
          .filter((f) => f.condition !== "GOOD")
          .map(
            (f) =>
              `H${f.hole} ${f.condition.toLowerCase()} · ${f.part.toLowerCase()}`,
          )
          .join(", ") || "All checked holes good"
      : "Valves & seats · Results pending";
  return `${issue.component}${issue.holes.length ? ` · H${issue.holes.join(", H")}` : ""}${issue.limitation ? ` · ${issue.limitation}` : ""}`;
}
export function elapsed(issue: Issue, now: number): string {
  const minutes = Math.max(
    0,
    Math.floor(
      ((issue.resolvedAt ?? now) - (issue.downAt ?? issue.openedAt)) / 60000,
    ),
  );
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function previousMeters(
  model: Model,
  pumpId: string,
  date: string,
  shift: Shift,
) {
  const key = `${date}:${shift === "day" ? 1 : 2}`;
  const logs = records(model, "reading")
    .filter(
      (e) =>
        e.pumpId === pumpId && `${e.date}:${e.shift === "day" ? 1 : 2}` < key,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.shift === "night" ? 1 : 0) - (a.shift === "night" ? 1 : 0) ||
        b.at - a.at,
    );
  return {
    pumpHours: logs.find((e) => e.pumpHours !== null)?.pumpHours ?? null,
    deckHours: logs.find((e) => e.deckHours !== null)?.deckHours ?? null,
  };
}
export function readingWarning(
  value: number | null,
  previous: number | null,
): string {
  if (value === null || previous === null) return "";
  if (value < previous)
    return "Below previous reading — check meter or replacement.";
  if (value - previous > 24)
    return "Increase exceeds 24 hours — verify this reading.";
  return "";
}
export function handoffData(model: Model, now: number) {
  const live = operational(new Date(now));
  const issues = records(model, "issue");
  return {
    ...live,
    lineup: records(model, "assignment"),
    issues: issues.filter((e) => !e.resolvedAt),
    repairs: issues.filter(
      (e) =>
        e.resolvedAt &&
        operational(new Date(e.resolvedAt)).date === live.date &&
        operational(new Date(e.resolvedAt)).shift === live.shift,
    ),
    swaps: records(model, "movement").filter(
      (e) =>
        e.action === "swap" && e.date === live.date && e.shift === live.shift,
    ),
  };
}
export function eventTime(e: Entity): number {
  return "at" in e ? e.at : "openedAt" in e ? e.openedAt : 0;
}
export function pumpHistory(model: Model, pumpId: string): Entity[] {
  return Object.values(model)
    .filter(
      (e) =>
        ("pumpId" in e && e.kind !== "assignment" && e.pumpId === pumpId) ||
        (e.kind === "audit" && e.pumpIds.includes(pumpId)),
    )
    .sort((a, b) => eventTime(b) - eventTime(a));
}
export function shiftHistory(
  model: Model,
  date: string,
  shift: Shift,
): Entity[] {
  return Object.values(model)
    .filter(
      (e) =>
        ("date" in e && "shift" in e && e.date === date && e.shift === shift) ||
        (eventTime(e) > 0 &&
          operational(new Date(eventTime(e))).date === date &&
          operational(new Date(eventTime(e))).shift === shift),
    )
    .sort((a, b) => eventTime(b) - eventTime(a));
}
export function optimistic(confirmed: Model, commands: Command[]): Model {
  const model = { ...confirmed };
  const blocked = new Set<string>();
  for (const cmd of commands) {
    if (
      cmd.status === "conflict" ||
      Object.keys(cmd.expected).some((id) => blocked.has(id))
    ) {
      Object.keys(cmd.expected).forEach((id) => blocked.add(id));
      continue;
    }
    for (const entity of cmd.writes) {
      if (entity.kind === "deleted") delete model[entity.id];
      else model[entity.id] = entity;
    }
  }
  return model;
}
export class Conflict extends Error {
  constructor(id: string) {
    super(`Newer data exists for ${id}. Your change is retained for review.`);
  }
}
export function applyCommand(
  server: Model,
  command: Command,
  receipts: string[],
): Model {
  if (receipts.includes(command.id)) return server;
  for (const [id, revision] of Object.entries(command.expected))
    if ((server[id]?.rev ?? null) !== revision) throw new Conflict(id);
  const next = { ...server };
  for (const entity of command.writes) {
    if (entity.kind === "deleted") delete next[entity.id];
    else next[entity.id] = entity;
  }
  return next;
}
export type Action =
  | { type: "setupStations"; count: number }
  | { type: "addPump"; number: string }
  | {
      type: "identity";
      pumpId: string;
      software: string;
      brand: string;
      condition: Condition;
    }
  | {
      type: "movement";
      pumpId: string;
      destination: number | "standby" | "left" | "return";
      replacement?: string;
      reason: string;
    }
  | { type: "deleteMistake"; pumpId: string; confirmation: string }
  | {
      type: "issue";
      pumpId: string;
      status: "Down" | "Derated" | "Watch";
      category: string;
      component: string;
      holes: number[];
      notes: string;
      limitation: string;
      watch: boolean;
    }
  | { type: "spot"; pumpId: string }
  | {
      type: "editIssue";
      issueId: string;
      status?: "Down" | "Repairing" | "Derated" | "Watch" | "Running";
      watch?: boolean;
      notes?: string;
      category?: string;
      component?: string;
      holes?: number[];
      limitation?: string;
      findings?: Finding[];
      convert?: boolean;
    }
  | {
      type: "reading";
      date: string;
      shift: Shift;
      station: number | null;
      pumpId: string;
      pumpHours: number | null;
      deckHours: number | null;
      notes: string;
    }
  | {
      type: "sheet";
      date: string;
      shift: Shift;
      finalized: boolean;
      notes?: string;
    }
  | {
      type: "service";
      pumpId: string;
      serviceType: Service["type"];
      holes: number[];
      notes: string;
      condition: Condition;
    }
  | { type: "handoff"; notes: string };
export function plan(
  model: Model,
  action: Action,
  actor: string,
  now = Date.now(),
): Command {
  if (!actor.trim()) throw new Error("Set your operator name first.");
  const live = operational(new Date(now));
  const id = uid();
  const writes: Entity[] = [];
  const expected: Command["expected"] = {};
  const guard = (recordId: string) => {
    expected[recordId] = model[recordId]?.rev ?? null;
  };
  const put = (entity: Entity) => {
    guard(entity.id);
    writes.push({ ...entity, rev: (model[entity.id]?.rev ?? 0) + 1 } as Entity);
  };
  const pump = (pumpId: string): Pump => {
    const p = model[pumpId];
    if (p?.kind !== "pump") throw new Error("Pump not found.");
    return p;
  };
  const movement = (
    p: Pump,
    movementAction: Movement["action"],
    to: number | null,
    reason: string,
    replacement: string | null = null,
  ) =>
    put({
      id: `move:${uid()}`,
      kind: "movement",
      rev: 0,
      pumpId: p.id,
      action: movementAction,
      from: stationFor(model, p.id),
      to,
      replacement,
      reason,
      actor,
      at: now,
      ...live,
    });
  switch (action.type) {
    case "setupStations": {
      if (records(model, "assignment").length)
        throw new Error("Stations already exist.");
      if (
        !Number.isInteger(action.count) ||
        action.count < 1 ||
        action.count > 30
      )
        throw new Error("Choose 1–30 stations.");
      for (let station = 1; station <= action.count; station++)
        put({
          id: `station:${station}`,
          kind: "assignment",
          rev: 0,
          station,
          pumpId: null,
        });
      break;
    }
    case "addPump": {
      const number = action.number.trim();
      if (!/^[A-Za-z0-9-]{1,20}$/.test(number))
        throw new Error("Use a pump number of 1–20 letters or numbers.");
      const pumpId = `pump:${number.toUpperCase()}`;
      if (model[pumpId]) throw new Error("That pump identity already exists.");
      put({
        id: pumpId,
        kind: "pump",
        rev: 0,
        number,
        location: "on",
        condition: "Ready",
        software: "",
        brand: "",
        hasHistory: false,
      });
      break;
    }
    case "identity": {
      const p = pump(action.pumpId);
      if (
        !SOFTWARE.includes(action.software as (typeof SOFTWARE)[number]) ||
        !BRANDS.includes(action.brand as (typeof BRANDS)[number])
      )
        throw new Error("Unknown equipment attribute.");
      put({
        ...p,
        software: action.software,
        brand: action.brand,
        condition: action.condition,
      });
      break;
    }
    case "movement": {
      const p = pump(action.pumpId);
      guard(p.id);
      put({ ...p, hasHistory: true });
      if (!action.reason.trim())
        throw new Error("Record why the pump is being moved or pulled.");
      const from = records(model, "assignment").find((e) => e.pumpId === p.id);
      if (action.destination === "left") {
        if (from) put({ ...from, pumpId: null });
        put({ ...p, location: "left", hasHistory: true });
        movement(p, "left", null, action.reason);
      } else if (action.destination === "return") {
        if (p.location !== "left")
          throw new Error("Pump is already on location.");
        put({ ...p, location: "on", hasHistory: true });
        movement(p, "return", null, action.reason);
      } else {
        if (p.location !== "on")
          throw new Error("Return the pump to location first.");
        if (action.replacement) {
          if (!from) throw new Error("Only an assigned pump can be swapped.");
          const replacement = pump(action.replacement);
          guard(replacement.id);
          put({ ...replacement, hasHistory: true });
          if (
            replacement.id === p.id ||
            replacement.location !== "on" ||
            pumpCondition(model, replacement) !== "Ready"
          )
            throw new Error("Select a different Ready pump on location.");
          const previous = records(model, "assignment").find(
            (e) => e.pumpId === replacement.id,
          );
          if (previous) put({ ...previous, pumpId: null });
          put({ ...from, pumpId: replacement.id });
          movement(p, "swap", null, action.reason, replacement.id);
          movement(
            replacement,
            "assign",
            from.station,
            "Replacement assignment",
          );
        } else if (action.destination === "standby") {
          if (from) put({ ...from, pumpId: null });
          movement(p, "standby", null, action.reason);
        } else {
          const target = model[`station:${action.destination}`];
          if (target?.kind !== "assignment")
            throw new Error("Station not found.");
          if (target.pumpId && target.pumpId !== p.id)
            throw new Error(
              "Station is occupied. Swap its current pump instead.",
            );
          if (pumpCondition(model, p) !== "Ready")
            throw new Error("Pump must be Ready before assignment.");
          if (from && from.id !== target.id) put({ ...from, pumpId: null });
          put({ ...target, pumpId: p.id });
          movement(p, "assign", target.station, action.reason);
        }
      }
      break;
    }
    case "deleteMistake": {
      const p = pump(action.pumpId);
      if (action.confirmation !== p.number)
        throw new Error("Type the pump number to confirm deletion.");
      if (
        p.hasHistory ||
        stationFor(model, p.id) !== null ||
        Object.values(model).some(
          (e) => "pumpId" in e && e.kind !== "assignment" && e.pumpId === p.id,
        )
      )
        throw new Error(
          "A pump with operational history cannot be permanently deleted. Mark it left location.",
        );
      put({ id: p.id, kind: "deleted", rev: 0 });
      break;
    }
    case "issue":
    case "spot": {
      const p = pump(action.pumpId);
      guard(p.id);
      if (p.location !== "on") throw new Error("Pump is not on location.");
      put({ ...p, hasHistory: true });
      if (
        action.type === "spot" &&
        activeIssues(model, p.id).some((e) => e.type === "spot")
      )
        throw new Error("A spot check is already active.");
      const spot = action.type === "spot";
      if (!spot && action.status === "Derated" && !action.limitation.trim())
        throw new Error("Describe the derate limitation.");
      if (
        !spot &&
        !(COMPONENTS[action.category] || []).includes(action.component)
      )
        throw new Error("Choose a valid component.");
      put({
        id: `issue:${uid()}`,
        kind: "issue",
        rev: 0,
        pumpId: p.id,
        station: stationFor(model, p.id),
        type: spot ? "spot" : "problem",
        status: spot ? "Down" : action.status,
        category: spot ? "FLUID END" : action.category,
        component: spot ? "VALVE / SEAT" : action.component,
        holes: spot ? [] : action.holes,
        notes: spot ? "" : action.notes,
        limitation: spot ? "" : action.limitation,
        watch: spot ? false : action.watch || action.status === "Watch",
        openedAt: now,
        downAt: spot || action.status === "Down" ? now : null,
        resolvedAt: null,
        createdBy: actor,
        findings: [],
        ...live,
      });
      break;
    }
    case "editIssue": {
      const issue = model[action.issueId];
      if (issue?.kind !== "issue" || issue.resolvedAt)
        throw new Error("Issue is no longer active.");
      const next = { ...issue };
      for (const field of [
        "notes",
        "category",
        "component",
        "holes",
        "limitation",
        "watch",
        "findings",
      ] as const)
        if (action[field] !== undefined)
          Object.assign(next, { [field]: action[field] });
      if (action.status) {
        next.status = action.status;
        if (["Down", "Repairing"].includes(action.status) && !issue.downAt)
          next.downAt = now;
        if (action.status === "Running") {
          next.resolvedAt = now;
          next.watch = false;
        }
      }
      if (next.status === "Watch" && !next.watch) {
        next.resolvedAt = now;
        next.status = "Running";
      }
      if (action.convert) {
        next.type = "problem";
        next.status = "Down";
      }
      if (next.status === "Derated" && !next.limitation.trim())
        throw new Error("Describe the derate limitation.");
      if (!COMPONENTS[next.category]?.includes(next.component))
        throw new Error("Choose a valid component.");
      if (
        next.findings.some((f) => ![1, 2, 3, 4, 5].includes(f.hole)) ||
        new Set(next.findings.map((f) => f.hole)).size !== next.findings.length
      )
        throw new Error("Invalid hole results.");
      put(next);
      put({ ...pump(issue.pumpId), hasHistory: true });
      break;
    }
    case "reading": {
      const p = pump(action.pumpId);
      guard(p.id);
      if (!p.hasHistory) put({ ...p, hasHistory: true });
      const sid = sheetId(action.date, action.shift);
      guard(sid);
      if (model[sid]?.kind === "sheet" && (model[sid] as Sheet).finalized)
        throw new Error("Reopen the sheet before editing.");
      for (const value of [action.pumpHours, action.deckHours])
        if (value !== null && (!Number.isFinite(value) || value < 0))
          throw new Error("Hours must be a finite non-negative meter reading.");
      put({
        id: readingId(action.date, action.shift, action.station, p.id),
        kind: "reading",
        rev: 0,
        pumpId: p.id,
        station: action.station,
        date: action.date,
        shift: action.shift,
        pumpHours: action.pumpHours,
        deckHours: action.deckHours,
        notes: action.notes,
        actor,
        at: now,
      });
      break;
    }
    case "sheet": {
      const sid = sheetId(action.date, action.shift);
      const previous = model[sid];
      for (const p of records(model, "pump")) {
        const station = stationFor(model, p.id);
        guard(readingId(action.date, action.shift, station, p.id));
      }
      for (const reading of records(model, "reading").filter(
        (e) => e.date === action.date && e.shift === action.shift,
      ))
        guard(reading.id);
      put({
        id: sid,
        kind: "sheet",
        rev: 0,
        date: action.date,
        shift: action.shift,
        finalized: action.finalized,
        actor,
        at: now,
        notes:
          action.notes ?? (previous?.kind === "sheet" ? previous.notes : ""),
      });
      break;
    }
    case "service": {
      const p = pump(action.pumpId);
      if (!action.notes.trim())
        throw new Error("Describe the work that was completed.");
      put({
        id: `service:${uid()}`,
        kind: "service",
        rev: 0,
        pumpId: p.id,
        type: action.serviceType,
        holes: action.holes,
        notes: action.notes,
        actor,
        at: now,
      });
      put({ ...p, condition: action.condition, hasHistory: true });
      break;
    }
    case "handoff": {
      for (const e of Object.values(model))
        if (["pump", "assignment", "issue", "movement"].includes(e.kind))
          guard(e.id);
      put({
        id: `handoff:${uid()}`,
        kind: "handoff",
        rev: 0,
        ...handoffData(model, now),
        actor,
        at: now,
        notes: action.notes,
      });
      break;
    }
  }
  const pumpIds = [
    ...new Set(
      writes.flatMap((e) =>
        "pumpId" in e && e.pumpId
          ? [e.pumpId]
          : e.kind === "pump"
            ? [e.id]
            : [],
      ),
    ),
  ];
  put({
    id: `audit:${id}`,
    kind: "audit",
    rev: 0,
    actor,
    at: now,
    action: action.type,
    recordIds: writes.map((e) => e.id),
    pumpIds,
  });
  return {
    id,
    actor,
    at: now,
    action: action.type,
    writes: [...new Map(writes.map((e) => [e.id, e])).values()],
    expected,
    status: "pending",
  };
}
