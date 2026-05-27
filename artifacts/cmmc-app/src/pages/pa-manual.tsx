import { ClipboardList, Info } from "lucide-react";

export default function PaManual() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manual Pre-Assessment</h1>
          <p className="text-sm text-gray-500">Questionnaire-based pre-assessment without a Microsoft tenant connection</p>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Coming Soon</p>
          <p>
            The Manual Pre-Assessment module will provide a structured questionnaire covering all 110 CMMC Level 2 controls,
            allowing assessors to document current-state findings without a live tenant connection.
            Use the <strong>Tenant-Connected Assessment</strong> for automated data-driven pre-assessments today.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">What the Manual Pre-Assessment Will Cover</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { domain: "AC — Access Control", controls: "22 controls" },
            { domain: "AT — Awareness & Training", controls: "3 controls" },
            { domain: "AU — Audit & Accountability", controls: "9 controls" },
            { domain: "CA — Security Assessment", controls: "4 controls" },
            { domain: "CM — Configuration Management", controls: "9 controls" },
            { domain: "IA — Identification & Authentication", controls: "11 controls" },
            { domain: "IR — Incident Response", controls: "3 controls" },
            { domain: "MA — Maintenance", controls: "6 controls" },
            { domain: "MP — Media Protection", controls: "9 controls" },
            { domain: "PE — Physical Protection", controls: "6 controls" },
            { domain: "PS — Personnel Security", controls: "2 controls" },
            { domain: "RA — Risk Assessment", controls: "3 controls" },
            { domain: "CA/SA — System & Services", controls: "7 controls" },
            { domain: "SC — System & Comm. Protection", controls: "16 controls" },
          ].map((d) => (
            <div key={d.domain} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs font-medium text-gray-700">{d.domain}</p>
              <span className="text-xs text-gray-400">{d.controls}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
