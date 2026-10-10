import {
  operational,
  readingId,
  type Model,
  type Issue,
  type Pump,
} from "../domain/model";
export function seed(now = Date.now()): Model {
  const model: Model = {};
  const live = operational(new Date(now));
  const numbers = [
    "184",
    "95",
    "201",
    "155",
    "196",
    "112",
    "173",
    "190",
    "142",
    "118",
    "207",
    "129",
    "166",
    "101",
    "145",
    "198",
    "120",
    "177",
    "209",
    "213",
    "216",
    "222",
    "88",
  ];
  numbers.forEach((number, i) => {
    const pump: Pump = {
      id: `pump:${number}`,
      kind: "pump",
      rev: 1,
      number,
      location: i === 22 ? "left" : "on",
      condition: number === "216" ? "Needs Repair" : "Ready",
      software: ["ERAD", "IDMS", "MDT"][i % 3],
      hasHistory: true,
      brand: ["Gardner Denver", "SPM", "OMT", "Vulcan"][i % 4],
    };
    model[pump.id] = pump;
    if (i < 18)
      model[`station:${i + 1}`] = {
        id: `station:${i + 1}`,
        kind: "assignment",
        rev: 1,
        station: i + 1,
        pumpId: pump.id,
      };
  });
  function issue(
    number: string,
    status: Issue["status"],
    component: string,
    minutes: number,
    spot = false,
    resolved = false,
  ) {
    const id = `issue:seed-${number}-${status}`;
    model[id] = {
      id,
      kind: "issue",
      rev: 1,
      pumpId: `pump:${number}`,
      station: numbers.indexOf(number) + 1,
      type: spot ? "spot" : "problem",
      status,
      category: "FLUID END",
      component,
      holes: spot ? [] : [3],
      notes:
        number === "95" ? "Packing leak on H3. Isolate before inspection." : "",
      limitation: status === "Derated" ? "Pressure limited to 8,500 psi" : "",
      watch: status === "Watch",
      openedAt: now - minutes * 60000,
      downAt: ["Down", "Repairing"].includes(status)
        ? now - minutes * 60000
        : null,
      resolvedAt: resolved ? now - 20 * 60000 : null,
      createdBy: "Chuck",
      findings: [],
      ...live,
    };
  }
  issue("95", "Down", "PACKING", 42);
  issue("201", "Down", "VALVE / SEAT", 18, true);
  issue("155", "Derated", "OTHER", 61);
  issue("112", "Repairing", "VALVE / SEAT", 77);
  issue("101", "Down", "SWINGING FLUID END", 72);
  issue("213", "Watch", "D-RINGS", 90);
  issue("184", "Down", "VALVE / SEAT", 180, false, true);
  const prev = new Date(now);
  prev.setDate(prev.getDate() - 1);
  const previous = operational(prev);
  numbers.slice(0, 22).forEach((number, i) => {
    const rid = readingId(
      previous.date,
      previous.shift,
      i < 18 ? i + 1 : null,
      `pump:${number}`,
    );
    model[rid] = {
      id: rid,
      kind: "reading",
      rev: 1,
      pumpId: `pump:${number}`,
      station: i < 18 ? i + 1 : null,
      ...previous,
      pumpHours: 5800 + i * 183,
      deckHours: 7100 + i * 119,
      notes: "",
      actor: i % 2 ? "Maria" : "Chuck",
      at: now - 86400000,
    };
    if (i < 12) {
      const current = readingId(live.date, live.shift, i + 1, `pump:${number}`);
      model[current] = {
        ...(model[rid] as any),
        id: current,
        ...live,
        pumpHours: 5811 + i * 183,
        deckHours: 7110 + i * 119,
        at: now - 600000,
      };
    }
  });
  model["service:seed"] = {
    id: "service:seed",
    kind: "service",
    rev: 1,
    pumpId: "pump:184",
    type: "Valves & Seats",
    holes: [2, 3],
    notes: "Replaced valves and seats on H2 and H3; pressure tested.",
    actor: "Maria",
    at: now - 25 * 60000,
  };
  model["move:seed"] = {
    id: "move:seed",
    kind: "movement",
    rev: 1,
    pumpId: "pump:88",
    action: "left",
    from: 12,
    to: null,
    replacement: "pump:129",
    reason: "Power end bearing failure; sent to shop.",
    actor: "Chuck",
    at: now - 86400000,
    ...previous,
  };
  return model;
}
