export function apiHeaders(orgId?: string): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token ?? ""}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return val;
  }
}

export function fmtPct(n: number): string {
  return `${n}%`;
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]!);
  const header = keys.join(",");
  const body = rows.map(row =>
    keys.map(k => {
      const v = row[k];
      const s = v === null || v === undefined ? "" : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(",")
  );
  const csv = [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport(title: string) {
  const prev = document.title;
  document.title = title;
  window.print();
  document.title = prev;
}

export const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  implemented: "Implemented",
  needs_review: "Needs Review",
  assessor_ready: "Assessor Ready",
  not_applicable: "N/A",
  at_risk: "At Risk",
};

export const STATUS_COLOR: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  implemented: "bg-green-100 text-green-700",
  needs_review: "bg-yellow-100 text-yellow-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  not_applicable: "bg-slate-100 text-slate-500",
  at_risk: "bg-red-100 text-red-700",
};

export const RISK_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};

export const SEV_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-blue-100 text-blue-800",
};
