import { useState, useRef } from "react";
import { Check, LockKeyhole } from "lucide-react";
import {
  records,
  readingId,
  sheetId,
  previousMeters,
  readingWarning,
  operational,
  optimistic,
  type Model,
  type Reading,
  type Shift,
} from "../domain/model";
import { Field, StatusLabel, pumpNumber, type ViewProps } from "./shared";
export function Hours(props: ViewProps) {
  const { model, engine, run } = props;
  const live = operational(new Date(props.now));
  const [date, setDate] = useState(live.date);
  const [shift, setShift] = useState<Shift>(live.shift);
  const sheet = model[sheetId(date, shift)];
  const finalized = sheet?.kind === "sheet" && sheet.finalized;
  const readings = records(model, "reading").filter(
    (r) => r.date === date && r.shift === shift,
  );
  const stations = records(model, "assignment").filter((s) => s.pumpId);
  const rows = new Map<string, { pumpId: string; station: number | null }>();
  if (date === live.date && shift === live.shift) {
    for (const s of stations)
      rows.set(readingId(date, shift, s.station, s.pumpId!), {
        pumpId: s.pumpId!,
        station: s.station,
      });
    for (const p of records(model, "pump").filter(
      (p) => p.location === "on" && !stations.some((s) => s.pumpId === p.id),
    ))
      rows.set(readingId(date, shift, null, p.id), {
        pumpId: p.id,
        station: null,
      });
  }
  for (const r of readings)
    rows.set(r.id, { pumpId: r.pumpId, station: r.station });
  const complete = readings.filter(
    (r) => r.pumpHours !== null && r.deckHours !== null,
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Shift hours</h1>
          <p>One fleet sheet. Everyone’s readings together.</p>
        </div>
        <StatusLabel
          status={
            finalized ? "Finalized" : `${complete} / ${rows.size} complete`
          }
        />
      </div>
      <div className="toolbar">
        <Field label="Viewed operational date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Viewed shift">
          <select
            value={shift}
            onChange={(e) => setShift(e.target.value as Shift)}
          >
            <option value="day">Day · 05:30–17:30</option>
            <option value="night">Night · 17:30–05:30</option>
          </select>
        </Field>
        <button
          onClick={() => {
            setDate(live.date);
            setShift(live.shift);
          }}
        >
          Back to live shift
        </button>
        <button
          className="outline"
          onClick={() =>
            run(() =>
              engine.submit({
                type: "sheet",
                date,
                shift,
                finalized: !finalized,
              }),
            )
          }
        >
          <LockKeyhole size={17} />
          {finalized ? "Reopen sheet" : "Finalize sheet"}
        </button>
      </div>
      {!rows.size && (
        <p className="empty">
          No readings for this historical shift. Select the live shift to enter
          hours.
        </p>
      )}
      <div className="hours-list">
        {[...rows.entries()]
          .sort((a, b) => (a[1].station ?? 99) - (b[1].station ?? 99))
          .map(([id, row]) => (
            <HoursRow
              key={id}
              {...props}
              date={date}
              shift={shift}
              pumpId={row.pumpId}
              station={row.station}
              reading={
                model[id]?.kind === "reading"
                  ? (model[id] as Reading)
                  : undefined
              }
              finalized={finalized}
            />
          ))}
      </div>
    </>
  );
}
function HoursRow({
  model,
  engine,
  run,
  date,
  shift,
  pumpId,
  station,
  reading,
  finalized,
}: ViewProps & {
  date: string;
  shift: Shift;
  pumpId: string;
  station: number | null;
  reading?: Reading;
  finalized: boolean;
}) {
  const [draft, setDraft] = useState({
    pumpHours: reading?.pumpHours?.toString() ?? "",
    deckHours: reading?.deckHours?.toString() ?? "",
    notes: reading?.notes ?? "",
  });
  const version = useRef(0);
  const baseline = useRef<Model | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState("");
  const previous = previousMeters(model, pumpId, date, shift);
  const submit = async () => {
    if (!dirty) return;
    const saveVersion = version.current;
    const current = {
      pumpHours: draft.pumpHours === "" ? null : Number(draft.pumpHours),
      deckHours: draft.deckHours === "" ? null : Number(draft.deckHours),
      notes: draft.notes,
    };
    const success = await run(async () => {
      const command = await engine.submit(
        { type: "reading", date, shift, pumpId, station, ...current },
        baseline.current || model,
      );
      baseline.current = optimistic(baseline.current || model, [command]);
    });
    if (success && saveVersion === version.current) {
      baseline.current = null;
      setDirty(false);
      setSaved("Saved on this device");
    }
  };
  const values = dirty
    ? draft
    : {
        pumpHours: reading?.pumpHours?.toString() ?? "",
        deckHours: reading?.deckHours?.toString() ?? "",
        notes: reading?.notes ?? "",
      };
  return (
    <article className="hours-row">
      <div className="hours-identity">
        <strong>
          {station === null
            ? "Standby"
            : `Station ${String(station).padStart(2, "0")}`}
        </strong>
        <span>Pump {pumpNumber(model, pumpId)}</span>
        <small>{reading?.actor ? `Entered by ${reading.actor}` : ""}</small>
      </div>
      <div className="meters">
        {(["pumpHours", "deckHours"] as const).map((field) => (
          <Field
            key={field}
            label={
              field === "pumpHours" ? "Pump engine hours" : "Deck engine hours"
            }
          >
            <input
              aria-label={`${field === "pumpHours" ? "Pump" : "Deck"} hours for ${pumpNumber(model, pumpId)} ${station ?? "standby"}`}
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              disabled={finalized}
              value={values[field]}
              placeholder="Hours"
              onChange={(e) => {
                if (!baseline.current) baseline.current = { ...engine.model };
                version.current++;
                setDraft({ ...values, [field]: e.target.value });
                setDirty(true);
                setSaved("Unsaved");
              }}
              onBlur={submit}
            />
            <small>Previous: {previous[field] ?? "not recorded"}</small>
            <small className="warning">
              {readingWarning(
                values[field] === "" ? null : Number(values[field]),
                previous[field],
              )}
            </small>
          </Field>
        ))}
      </div>
      <Field label="Notes">
        <input
          disabled={finalized}
          value={values.notes}
          onChange={(e) => {
            if (!baseline.current) baseline.current = { ...engine.model };
            version.current++;
            setDraft({ ...values, notes: e.target.value });
            setDirty(true);
            setSaved("Unsaved");
          }}
          onBlur={submit}
        />
      </Field>
      <small className="save-state">
        {saved || (reading ? "Recorded" : "Awaiting readings")}
        {saved.startsWith("Saved") && <Check size={14} />}
      </small>
    </article>
  );
}
