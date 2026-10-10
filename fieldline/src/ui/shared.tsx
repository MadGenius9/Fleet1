import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { X, ChevronRight } from "lucide-react";
import {
  issueLabel,
  issueStatus,
  elapsed,
  type Issue,
  type Status,
  type Model,
} from "../domain/model";
import type { Engine } from "../data/engine";
export interface ViewProps {
  model: Model;
  engine: Engine;
  openPump: (id: string) => void;
  now: number;
  run: (task: () => Promise<unknown>) => Promise<boolean>;
}
export function StatusLabel({ status }: { status: Status | string }) {
  return (
    <span className={`status s-${status.toLowerCase().replaceAll(" ", "-")}`}>
      <i />
      {status}
    </span>
  );
}
export function IssueSummary({ issue, now }: { issue: Issue; now: number }) {
  return (
    <>
      <StatusLabel status={issueStatus(issue)} />
      <strong>{issueLabel(issue)}</strong>
      <span className="muted">
        {elapsed(issue, now)} · {issue.createdBy}
      </span>
      {issue.notes && <p>{issue.notes}</p>}
    </>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const selector =
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]';
    (
      (panel.querySelector("[autofocus]") as HTMLElement) ||
      panel.querySelector<HTMLElement>(selector)
    )?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const targets = [
          ...panel.querySelectorAll<HTMLElement>(selector),
        ].filter((el) => el.getClientRects().length);
        const first = targets[0],
          last = targets.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="scrim" onClick={onClose}>
      <section
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Close dialog" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  let control = false;
  const content = Children.map(children, (child) => {
    if (
      isValidElement(child) &&
      typeof child.type === "string" &&
      ["input", "select", "textarea"].includes(child.type)
    ) {
      control = true;
      return cloneElement(child as ReactElement<{ id: string }>, { id });
    }
    return child;
  });
  return (
    <div className="field">
      {control ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {content}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function ViewButton({
  onClick,
  label = "View",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button className="outline small" onClick={onClick}>
      {label}
      <ChevronRight size={16} />
    </button>
  );
}
export function download(
  name: string,
  contents: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pumpNumber(model: Model, id: string) {
  const p = model[id];
  return p?.kind === "pump" ? p.number : id.replace("pump:", "");
}
