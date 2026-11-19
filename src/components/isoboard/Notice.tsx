import { useEffect } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { useDiagram } from "@/store/diagram";

/** Toast for file and export results; fades away on its own. */
export function Notice() {
  const notice = useDiagram((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(
      () => useDiagram.setState((s) => (s.notice?.id === notice.id ? { notice: null } : {})),
      notice.error ? 5000 : 2600,
    );
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      key={notice.id}
      className={`notice panel ${notice.error ? "notice-error" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      {notice.error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
      {notice.text}
    </div>
  );
}
