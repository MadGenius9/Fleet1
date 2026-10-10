import { useState } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import {
  records,
  stationFor,
  pumpCondition,
  pumpStatus,
  activeIssues,
  issueStatus,
  issueLabel,
  elapsed,
  type Status,
  type Pump,
} from "../domain/model";
import {
  StatusLabel,
  ViewButton,
  Empty,
  Field,
  Modal,
  type ViewProps,
} from "./shared";
export function Spread({
  model,
  engine,
  openPump,
  run,
  goHours,
  now,
}: ViewProps & { goHours: () => void }) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const pumps = records(model, "pump");
  const stations = records(model, "assignment").sort(
    (a, b) => a.station - b.station,
  );
  const standby = pumps.filter(
    (p) => p.location === "on" && stationFor(model, p.id) === null,
  );
  const statuses = [
    "Running",
    "Down",
    "Repairing",
    "Spot check",
    "Derated",
    "Watch",
  ] as Status[];
  const roster = stations.filter(
    (s) =>
      !search ||
      String(s.station) === search ||
      (s.pumpId &&
        model[s.pumpId]?.kind === "pump" &&
        (model[s.pumpId] as Pump).number.includes(search)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>The spread</h1>
          <p>
            {stations.length} stations · {standby.length} standby
          </p>
        </div>
        <button className="primary" onClick={goHours}>
          Enter hours
          <ArrowUpRight size={18} />
        </button>
      </div>
      <div className="stats">
        {statuses.map((status) => (
          <div key={status}>
            <strong>
              {
                pumps.filter(
                  (p) =>
                    p.location === "on" &&
                    stationFor(model, p.id) !== null &&
                    pumpStatus(model, p.id) === status,
                ).length
              }
            </strong>
            <StatusLabel status={status} />
          </div>
        ))}
      </div>
      <div className="spread-layout">
        <section className="surface">
          <div className="section-heading">
            <h2>Station lineup</h2>
            <input
              aria-label="Find station or pump"
              placeholder="Find station or pump"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="roster">
            <div className="roster-head">
              <span>Station</span>
              <span>Pump</span>
              <span>Status</span>
              <span>Current issue</span>
              <span>Action</span>
            </div>
            {roster.map((station) => {
              const pump = station.pumpId ? model[station.pumpId] : null;
              const issue = station.pumpId
                ? activeIssues(model, station.pumpId)[0]
                : null;
              return (
                <div className="roster-row" key={station.id}>
                  <strong className="station-name">
                    Station {String(station.station).padStart(2, "0")}
                  </strong>
                  <span className="pump-cell">
                    {pump?.kind === "pump" ? pump.number : "Unassigned"}
                  </span>
                  <StatusLabel
                    status={
                      station.pumpId
                        ? pumpStatus(model, station.pumpId)
                        : "Unassigned"
                    }
                  />
                  <span className="issue-cell">
                    {issue
                      ? `${issueLabel(issue)} · ${elapsed(issue, now)}`
                      : "No issues"}
                  </span>
                  {station.pumpId ? (
                    <ViewButton onClick={() => openPump(station.pumpId!)} />
                  ) : (
                    <span className="muted">Assign from standby</span>
                  )}
                </div>
              );
            })}
          </div>
          {!stations.length && (
            <Empty>
              <p>No station lineup yet.</p>
              <button
                onClick={() =>
                  run(() => engine.submit({ type: "setupStations", count: 18 }))
                }
              >
                Create 18 empty stations
              </button>
            </Empty>
          )}
        </section>
        <aside className="work-rail">
          <section className="surface">
            <h2 className="section-title">
              Needs attention ({activeIssues(model).length})
            </h2>
            {activeIssues(model)
              .slice(0, 6)
              .map((issue) => (
                <button
                  className="attention-row"
                  key={issue.id}
                  onClick={() => openPump(issue.pumpId)}
                >
                  <div>
                    <strong>
                      Pump {pumps.find((p) => p.id === issue.pumpId)?.number}
                    </strong>
                    <span>
                      {issueLabel(issue)} · {elapsed(issue, now)}
                    </span>
                  </div>
                  <StatusLabel
                    status={
                      issue.type === "spot" && !issue.findings.length
                        ? "Results pending"
                        : issueStatus(issue)
                    }
                  />
                </button>
              ))}
            {!activeIssues(model).length && (
              <Empty>All clear. No active issues.</Empty>
            )}
          </section>
          <section className="surface">
            <h2 className="section-title">
              Standby on location ({standby.length})
            </h2>
            {standby.map((p) => (
              <button
                className="attention-row"
                key={p.id}
                onClick={() => openPump(p.id)}
              >
                <strong>Pump {p.number}</strong>
                <StatusLabel status={pumpCondition(model, p)} />
              </button>
            ))}
          </section>
        </aside>
      </div>
      <section className="surface fleet-directory">
        <div className="section-heading">
          <h2>Pump directory</h2>
          <button onClick={() => setAdding(true)}>
            <Plus size={18} />
            Add pump
          </button>
        </div>
        <p className="muted padded">
          Leaving location preserves identity and all history.
        </p>
        <div className="directory">
          {pumps
            .filter((p) => !search || p.number.includes(search))
            .map((p) => (
              <button key={p.id} onClick={() => openPump(p.id)}>
                <strong>{p.number}</strong>
                <span>
                  {p.location === "left"
                    ? "Left location"
                    : stationFor(model, p.id) === null
                      ? "Standby"
                      : `Station ${stationFor(model, p.id)}`}
                </span>
                <StatusLabel status={pumpCondition(model, p)} />
              </button>
            ))}
        </div>
      </section>
      {adding && (
        <Modal title="Add pump identity" onClose={() => setAdding(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => engine.submit({ type: "addPump", number })))
                setAdding(false);
            }}
          >
            <Field label="Pump number">
              <input
                autoFocus
                required
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </Field>
            <button className="primary">Add to location</button>
          </form>
        </Modal>
      )}
    </>
  );
}
