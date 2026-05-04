import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { printReport, downloadCsv } from "@/lib/report-utils";

interface ReportShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  csvRows?: Record<string, unknown>[];
  csvFilename?: string;
  reportDate?: string;
  orgName?: string;
}

export function ReportShell({ title, subtitle, children, csvRows, csvFilename, reportDate, orgName }: ReportShellProps) {
  return (
    <div className="space-y-6">
      {/* Toolbar — hidden on print */}
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/reports/executive">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Reports
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          {csvRows && csvFilename && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => downloadCsv(csvRows, csvFilename)}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          <Button size="sm" className="gap-2" onClick={() => printReport(title)}>
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* Print header — only shows on print */}
      <div className="hidden print:block mb-6">
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
            {orgName && <p className="text-sm font-medium mt-1">{orgName}</p>}
          </div>
          <div className="text-right text-sm text-gray-500">
            <p className="font-semibold">Control HUB</p>
            <p>CMMC Compliance Platform</p>
            {reportDate && <p>{new Date(reportDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>}
          </div>
        </div>
      </div>

      {/* Report content */}
      <div className="print-area">
        {children}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  bg?: string;
}

export function ReportStatCard({ label, value, sub, color = "text-foreground", bg = "bg-muted/30" }: StatCardProps) {
  return (
    <div className={`rounded-lg p-4 ${bg} border`}>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

interface ProgressBarProps {
  pct: number;
  label?: string;
  color?: string;
}

export function ProgressBar({ pct, label, color = "bg-primary" }: ProgressBarProps) {
  return (
    <div className="w-full">
      {label && <div className="text-xs text-muted-foreground mb-1">{label}</div>}
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
