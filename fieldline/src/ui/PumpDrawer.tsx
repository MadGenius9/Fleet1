import { useState } from "react";
import {
  ClipboardCheck,
  ArrowLeftRight,
  Wrench,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import {
  records,
  activeIssues,
  stationFor,
  pumpCondition,
  pumpStatus,
  COMPONENTS,
  CATEGORIES,
  SOFTWARE,
  BRANDS,
  type Pump,
  type Service,
  type Issue,
  type Condition,
  type Finding,
  type Action,
  type Model,
  elapsed,
  pumpHistory,
} from "../domain/model";
import {
  Modal,
  Field,
  StatusLabel,
  IssueSummary,
  pumpNumber,
  type ViewProps,
} from "./shared";
type Form = {
  kind:
    | "issue"
    | "edit"
    | "results"
    | "movement"
    | "service"
    | "identity"
    | "delete";
  issue?: Issue;
  baseline: Model;
};
export function PumpDrawer(
  props: ViewProps & { pumpId: string; onClose: () => void },
) {
  const { model, engine, run, pumpId, onClose, now } = props;
  const [form, setForm] = useState<Form | null>(null);
  const [history, setHistory] = useState(false);
  const p = model[pumpId];
  if (p?.kind !== "pump") return null;
  const open = (kind: Form["kind"], issue?: Issue) =>
    setForm({ kind, issue, baseline: { ...model } });
  const submit = async (action: Action) => {
    if (await run(() => engine.submit(action, form?.baseline))) {
      setForm(null);
      if (action.type === "deleteMistake") onClose();
    }
  };
  const issues = activeIssues(model, pumpId);
  const timeline = pumpHistory(model, pumpId);
  return (
    <Modal title={`Pump ${p.number}`} onClose={onClose}>
      <div className="pump-summary">
        <StatusLabel status={pumpStatus(model, pumpId)} />
        <dl>
          <div>
            <dt>Location</dt>
            <dd>{p.location === "on" ? "On location" : "Left location"}</dd>
          </div>
          <div>
            <dt>Assignment</dt>
            <dd>
              {stationFor(model, pumpId) === null
                ? "Standby"
                : `Station ${stationFor(model, pumpId)}`}
            </dd>
          </div>
          <div>
            <dt>Service condition</dt>
            <dd>{pumpCondition(model, p)}</dd>
          </div>
          <div>
            <dt>Control software</dt>
            <dd>{p.software || "Not set"}</dd>
          </div>
          <div>
            <dt>Fluid end</dt>
            <dd>{p.brand || "Not set"}</dd>
          </div>
        </dl>
      </div>
      {form ? (
        <>
          <button className="back-link" onClick={() => setForm(null)}>
            ← Back to pump
          </button>
          {form.kind === "issue" || form.kind === "edit" ? (
            <IssueForm pump={p} issue={form.issue} submit={submit} />
          ) : form.kind === "results" ? (
            <ResultsForm issue={form.issue!} submit={submit} />
          ) : form.kind === "movement" ? (
            <MovementForm pump={p} model={model} submit={submit} />
          ) : form.kind === "service" ? (
            <ServiceForm pump={p} submit={submit} />
          ) : form.kind === "identity" ? (
            <IdentityForm pump={p} submit={submit} />
          ) : (
            <DeleteForm pump={p} submit={submit} />
          )}
        </>
      ) : (
        <>
          <div className="pump-actions">
            {p.location === "on" && (
              <>
                <button className="primary" onClick={() => open("issue")}>
                  <AlertTriangle size={18} />
                  Report issue
                </button>
                <button
                  onClick={() =>
                    run(() => engine.submit({ type: "spot", pumpId }))
                  }
                >
                  <ClipboardCheck size={18} />
                  Start spot check
                </button>
              </>
            )}
            <button onClick={() => open("movement")}>
              <ArrowLeftRight size={18} />
              Move / swap
            </button>
            <button onClick={() => open("service")}>
              <Wrench size={18} />
              Record completed service
            </button>
            <button onClick={() => open("identity")}>
              <Pencil size={17} />
              Edit pump attributes
            </button>
          </div>
          <h3>Active issues ({issues.length})</h3>
          {issues.map((issue) => (
            <article className="detail-issue" key={issue.id}>
              <IssueSummary issue={issue} now={now} />
              {issue.watch && (
                <span className="watch-tag">Watch next shift</span>
              )}
              <div className="button-row">
                {issue.type === "spot" && (
                  <button onClick={() => open("results", issue)}>
                    {issue.findings.length ? "Edit results" : "Enter results"}
                  </button>
                )}
                <button onClick={() => open("edit", issue)}>Edit issue</button>
                {issue.status !== "Repairing" && (
                  <button
                    onClick={() =>
                      run(() =>
                        engine.submit({
                          type: "editIssue",
                          issueId: issue.id,
                          status: "Repairing",
                        }),
                      )
                    }
                  >
                    Start repair
                  </button>
                )}
                <button
                  onClick={() =>
                    run(() =>
                      engine.submit({
                        type: "editIssue",
                        issueId: issue.id,
                        status: "Running",
                      }),
                    )
                  }
                >
                  {issue.status === "Watch"
                    ? "Resolve watch item"
                    : "Back running"}
                </button>
                {issue.type === "spot" &&
                  issue.findings.some((f) => f.condition === "BAD") && (
                    <button
                      onClick={() =>
                        run(() =>
                          engine.submit({
                            type: "editIssue",
                            issueId: issue.id,
                            convert: true,
                          }),
                        )
                      }
                    >
                      Convert to failure
                    </button>
                  )}
              </div>
            </article>
          ))}
          {!issues.length && <p className="muted">No active issues.</p>}
          <button
            className="history-toggle"
            onClick={() => setHistory(!history)}
          >
            {history ? "Hide" : "Show"} permanent history ({timeline.length})
          </button>
          {history && (
            <ol className="timeline">
              {timeline.map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.kind === "issue"
                      ? `${e.component} · ${e.resolvedAt ? "Resolved" : "Active"} · ${elapsed(e, now)}`
                      : e.kind === "service"
                        ? `Completed service · ${e.type}${e.holes.length ? ` · H${e.holes.join(", H")}` : ""}`
                        : e.kind === "movement"
                          ? `Movement · ${e.action} · ${e.from === null ? "Standby" : `Station ${e.from}`} → ${e.action === "left" ? "Left location" : e.to === null ? "Standby" : `Station ${e.to}`}${e.replacement ? ` · Replacement ${pumpNumber(model, e.replacement)}` : ""}`
                          : e.kind === "reading"
                            ? `Hours · ${e.date} ${e.shift} · Pump ${e.pumpHours ?? "—"} / Deck ${e.deckHours ?? "—"}`
                            : e.kind === "audit"
                              ? `Action · ${e.action}`
                              : e.kind}
                  </strong>
                  <p>
                    {"notes" in e ? e.notes : "reason" in e ? e.reason : ""}
                  </p>
                  <small>
                    {new Date(
                      "at" in e ? e.at : "openedAt" in e ? e.openedAt : 0,
                    ).toLocaleString()}{" "}
                    ·{" "}
                    {"actor" in e
                      ? e.actor
                      : "createdBy" in e
                        ? e.createdBy
                        : ""}
                  </small>
                </li>
              ))}
            </ol>
          )}
          <button className="danger-link" onClick={() => open("delete")}>
            Delete mistaken / test identity
          </button>
        </>
      )}
    </Modal>
  );
}
function Holes({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  return (
    <div className="hole-buttons" role="group" aria-label="Affected holes">
      {[1, 2, 3, 4, 5].map((h) => (
        <button
          type="button"
          aria-pressed={value.includes(h)}
          className={value.includes(h) ? "selected" : ""}
          key={h}
          onClick={() =>
            onChange(
              value.includes(h)
                ? value.filter((n) => n !== h)
                : [...value, h].sort(),
            )
          }
        >
          H{h}
        </button>
      ))}
    </div>
  );
}
function IssueForm({
  pump,
  issue,
  submit,
}: {
  pump: Pump;
  issue?: Issue;
  submit: (a: Action) => Promise<void>;
}) {
  const [status, setStatus] = useState(
    issue?.status === "Running" ? "Watch" : issue?.status || "Down",
  );
  const [category, setCategory] = useState(issue?.category || "FLUID END");
  const [component, setComponent] = useState(issue?.component || "PACKING");
  const [holes, setHoles] = useState(issue?.holes || []);
  const [notes, setNotes] = useState(issue?.notes || "");
  const [limitation, setLimitation] = useState(issue?.limitation || "");
  const [watch, setWatch] = useState(issue?.watch || false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(
          issue
            ? {
                type: "editIssue",
                issueId: issue.id,
                status: status as "Down" | "Repairing" | "Derated" | "Watch",
                category,
                component,
                holes,
                notes,
                limitation,
                watch,
              }
            : {
                type: "issue",
                pumpId: pump.id,
                status: status as "Down" | "Derated" | "Watch",
                category,
                component,
                holes,
                notes,
                limitation,
                watch,
              },
        );
      }}
    >
      <h3>{issue ? "Edit active issue" : "Report a problem"}</h3>
      <div className="form-grid">
        <Field label="Operational status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              if (e.target.value === "Watch") setWatch(true);
            }}
          >
            {(issue
              ? ["Down", "Repairing", "Derated", "Watch"]
              : ["Down", "Derated", "Watch"]
            ).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setComponent(COMPONENTS[e.target.value][0]);
              setHoles([]);
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Component">
        <select
          value={component}
          onChange={(e) => setComponent(e.target.value)}
        >
          {COMPONENTS[category].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {category === "FLUID END" && (
        <Field label="Affected holes">
          <Holes value={holes} onChange={setHoles} />
        </Field>
      )}
      {status === "Derated" && (
        <Field label="Derate limitation">
          <input
            required
            value={limitation}
            onChange={(e) => setLimitation(e.target.value)}
            placeholder="e.g. Pressure limited to 8,500 psi"
          />
        </Field>
      )}
      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </Field>
      <label className="check-field">
        <input
          type="checkbox"
          checked={watch}
          onChange={(e) => setWatch(e.target.checked)}
        />
        Watch next shift
      </label>
      <button className="primary">
        {issue ? "Save issue changes" : "Report issue"}
      </button>
    </form>
  );
}
function ResultsForm({
  issue,
  submit,
}: {
  issue: Issue;
  submit: (a: Action) => Promise<void>;
}) {
  const [findings, setFindings] = useState<Finding[]>(issue.findings);
  const [notes, setNotes] = useState(issue.notes);
  const update = (hole: number, condition: string, part: Finding["part"]) =>
    setFindings((current) =>
      [
        ...current.filter((f) => f.hole !== hole),
        ...(condition
          ? [{ hole, condition: condition as Finding["condition"], part }]
          : []),
      ].sort((a, b) => a.hole - b.hole),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!findings.length) return;
        void submit({ type: "editIssue", issueId: issue.id, findings, notes });
      }}
    >
      <h3>Valves & seats results</h3>
      <p>Updates this spot check. Downtime continues until Back running.</p>
      <button
        type="button"
        onClick={() =>
          setFindings(
            [1, 2, 3, 4, 5].map((hole) => ({
              hole,
              condition: "GOOD",
              part: "BOTH",
            })),
          )
        }
      >
        Mark all five good
      </button>
      {[1, 2, 3, 4, 5].map((h) => {
        const f = findings.find((f) => f.hole === h);
        return (
          <div className="finding-row" key={h}>
            <strong>Hole {h}</strong>
            <select
              aria-label={`Hole ${h} condition`}
              value={f?.condition || ""}
              onChange={(e) => update(h, e.target.value, f?.part || "BOTH")}
            >
              <option value="">Not checked</option>
              {["GOOD", "WATCH", "BAD"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label={`Hole ${h} part`}
              value={f?.part || "BOTH"}
              onChange={(e) =>
                update(h, f?.condition || "", e.target.value as Finding["part"])
              }
            >
              {["VALVE", "SEAT", "BOTH"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        );
      })}
      <Field label="Inspection notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <button className="primary" disabled={!findings.length}>
        Save results
      </button>
    </form>
  );
}
function MovementForm({
  pump,
  model,
  submit,
}: {
  pump: Pump;
  model: Model;
  submit: (a: Action) => Promise<void>;
}) {
  const [destination, setDestination] = useState(
    pump.location === "left" ? "return" : "standby",
  );
  const [replacement, setReplacement] = useState("");
  const [reason, setReason] = useState("");
  const assigned = stationFor(model, pump.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          type: "movement",
          pumpId: pump.id,
          destination: /^\d+$/.test(destination)
            ? Number(destination)
            : (destination as "standby" | "left" | "return"),
          replacement: replacement || undefined,
          reason,
        });
      }}
    >
      <h3>
        {pump.location === "left" ? "Return to location" : "Move or swap pump"}
      </h3>
      <Field label="Destination">
        <select
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setReplacement("");
          }}
        >
          {pump.location === "left" ? (
            <option value="return">Return to location · standby</option>
          ) : (
            <>
              <option value="standby">Standby on location</option>
              <option value="left">Leave location</option>
              {records(model, "assignment")
                .filter((s) => !s.pumpId || s.pumpId === pump.id)
                .map((s) => (
                  <option key={s.id} value={s.station}>
                    Station {s.station}
                  </option>
                ))}
            </>
          )}
        </select>
      </Field>
      {assigned !== null &&
        pump.location === "on" &&
        destination === "standby" && (
          <Field label="Replacement pump (optional swap)">
            <select
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            >
              <option value="">
                No replacement — leave station unassigned
              </option>
              {records(model, "pump")
                .filter(
                  (p) =>
                    p.id !== pump.id &&
                    p.location === "on" &&
                    pumpCondition(model, p) === "Ready",
                )
                .sort(
                  (a, b) =>
                    (stationFor(model, a.id) === null ? -1 : 1) -
                    (stationFor(model, b.id) === null ? -1 : 1),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} ·{" "}
                    {stationFor(model, p.id) === null
                      ? "Standby"
                      : `Station ${stationFor(model, p.id)}`}
                  </option>
                ))}
            </select>
          </Field>
        )}
      <Field
        label={replacement ? "Why was this pump pulled?" : "Movement reason"}
      >
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <p className="muted">
        This records movement and pull reason. Completed service is recorded
        separately.
      </p>
      <button className="primary">Confirm movement</button>
    </form>
  );
}
function ServiceForm({
  pump,
  submit,
}: {
  pump: Pump;
  submit: (a: Action) => Promise<void>;
}) {
  const [type, setType] = useState("Valves & Seats");
  const [holes, setHoles] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState<Condition>("Ready");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          type: "service",
          pumpId: pump.id,
          serviceType: type as Service["type"],
          holes,
          notes,
          condition,
        });
      }}
    >
      <h3>Record completed service</h3>
      <Field label="Work actually completed">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {["Valves & Seats", "Full Rebuild", "Other"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Serviced holes">
        <Holes value={holes} onChange={setHoles} />
      </Field>
      <Field label="Completed work notes">
        <textarea
          required
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Field label="Service condition after work">
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as Condition)}
        >
          {["Ready", "Needs Repair", "Out of Service"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <p className="muted">
        Active issues still affect readiness. Resolve only the issues actually
        fixed.
      </p>
      <button className="primary">Save completed service</button>
    </form>
  );
}
function IdentityForm({
  pump,
  submit,
}: {
  pump: Pump;
  submit: (a: Action) => Promise<void>;
}) {
  const [software, setSoftware] = useState(pump.software);
  const [brand, setBrand] = useState(pump.brand);
  const [condition, setCondition] = useState(pump.condition);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit({
          type: "identity",
          pumpId: pump.id,
          software,
          brand,
          condition,
        });
      }}
    >
      <h3>Pump attributes</h3>
      <Field label="Control software">
        <select value={software} onChange={(e) => setSoftware(e.target.value)}>
          {SOFTWARE.map((s) => (
            <option key={s} value={s}>
              {s || "Not set"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fluid end brand">
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          {BRANDS.map((s) => (
            <option key={s} value={s}>
              {s || "Not set"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Base service condition">
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as Condition)}
        >
          {["Ready", "Needs Repair", "Out of Service"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <button className="primary">Save attributes</button>
    </form>
  );
}
function DeleteForm({
  pump,
  submit,
}: {
  pump: Pump;
  submit: (a: Action) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ type: "deleteMistake", pumpId: pump.id, confirmation });
      }}
    >
      <h3>Delete mistaken identity</h3>
      <p>
        Only unassigned records without operational history can be deleted. For
        real pumps, use Leave location.
      </p>
      <Field label={`Type ${pump.number} to confirm`}>
        <input
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </Field>
      <button className="primary">Permanently delete mistaken record</button>
    </form>
  );
}
