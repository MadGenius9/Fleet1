import { useState } from "react";
import { activeIssues, issueStatus } from "../domain/model";
import { IssueSummary, Empty, pumpNumber, type ViewProps } from "./shared";
export function Work({ model, openPump, now }: ViewProps) {
  const [mechanics, setMechanics] = useState(false);
  const [filter, setFilter] = useState("All");
  const issues = activeIssues(model).sort(
    (a, b) => (a.downAt ?? a.openedAt) - (b.downAt ?? b.openedAt),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{mechanics ? "Mechanics" : "Work queue"}</h1>
          <p>
            {mechanics
              ? "Read-only. Unresolved equipment, automatically updated."
              : "Independent issues. Nothing hidden at a shift change."}
          </p>
        </div>
        <button
          className={mechanics ? "primary" : ""}
          onClick={() => setMechanics(!mechanics)}
        >
          {mechanics ? "Leave read-only view" : "Mechanics · read-only"}
        </button>
      </div>
      <div className="filter-bar">
        {["All", "Down", "Repairing", "Derated", "Spot check", "Watch"].map(
          (status) => (
            <button
              key={status}
              className={filter === status ? "selected" : ""}
              onClick={() => setFilter(status)}
            >
              {status}
            </button>
          ),
        )}
      </div>
      <section className="surface issue-list">
        {issues
          .filter(
            (e) =>
              filter === "All" ||
              issueStatus(e) === filter ||
              (filter === "Watch" && e.watch),
          )
          .map((issue) => (
            <article className="work-item" key={issue.id}>
              <div className="work-pump">
                <strong>Pump {pumpNumber(model, issue.pumpId)}</strong>
                <span>
                  {issue.station === null
                    ? "Standby"
                    : `Original station ${issue.station}`}
                </span>
              </div>
              <div className="work-description">
                <IssueSummary issue={issue} now={now} />
                {issue.watch && (
                  <span className="watch-tag">Watch next shift</span>
                )}
              </div>
              {!mechanics && (
                <button
                  className="outline"
                  onClick={() => openPump(issue.pumpId)}
                >
                  Manage issue
                </button>
              )}
            </article>
          ))}
        {!issues.length && (
          <Empty>No unresolved issues. The spread is clear.</Empty>
        )}
      </section>
    </>
  );
}
