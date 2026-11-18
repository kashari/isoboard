import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { validate } from "@/lib/logic";
export function ValidationPanel() {
  const diagram = useDiagram((s) => s.diagram);
  const select = useDiagram((s) => s.select);
  const [open, setOpen] = useState(true);
  const issues = useMemo(() => validate(diagram), [diagram]);
  return (
    <section
      className={`validation-panel panel ${issues.length ? "" : "validation-ok"}`}
      aria-label="Validation"
    >
      <Button variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          {issues.length ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{" "}
          {issues.length
            ? `${issues.length} warning${issues.length > 1 ? "s" : ""}`
            : "All checks pass"}
        </span>
        <ChevronDown size={13} className={open ? "" : "rotate-180"} />
      </Button>
      {open && issues.length > 0 && (
        <div className="validation-list">
          {issues.map((issue) => (
            <Button
              key={issue.id}
              variant="ghost"
              onClick={() =>
                issue.nodeId
                  ? select([issue.nodeId])
                  : issue.edgeId
                    ? select([], issue.edgeId)
                    : select([])
              }
            >
              <AlertTriangle size={13} />
              {issue.message}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
