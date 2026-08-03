import React from "react";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Parse inline markdown to React nodes (no dangerouslySetInnerHTML)
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Pattern: **bold**, *italic*, `code`, [text](url)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const full = match[0];
    if (full.startsWith("**")) {
      nodes.push(<strong key={`${keyPrefix}-b${idx}`}>{match[2]}</strong>);
    } else if (full.startsWith("*")) {
      nodes.push(<em key={`${keyPrefix}-i${idx}`}>{match[3]}</em>);
    } else if (full.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-c${idx}`} className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
          {match[4]}
        </code>
      );
    } else if (full.startsWith("[")) {
      nodes.push(
        <a
          key={`${keyPrefix}-a${idx}`}
          href={match[6]}
          className="text-primary underline hover:no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = match.index + full.length;
    idx++;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function calloutStyle(type: string): { bg: string; border: string; label: string; labelColor: string } {
  switch (type) {
    case "NOTE":
      return { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-300 dark:border-blue-700", label: "NOTE", labelColor: "text-blue-700 dark:text-blue-400" };
    case "IMPORTANT":
      return { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", label: "IMPORTANT", labelColor: "text-amber-700 dark:text-amber-400" };
    case "WARNING":
      return { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-300 dark:border-red-700", label: "WARNING", labelColor: "text-red-700 dark:text-red-400" };
    case "PERMISSION":
      return { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-300 dark:border-purple-700", label: "PERMISSION", labelColor: "text-purple-700 dark:text-purple-400" };
    default:
      return { bg: "bg-muted/40", border: "border-border", label: type, labelColor: "text-muted-foreground" };
  }
}

// Parse a table block: array of lines starting with |
function parseTable(lines: string[], keyPrefix: string): React.ReactNode {
  const rows = lines.map((l) =>
    l.split("|").filter((_, i, arr) => i !== 0 && i !== arr.length - 1).map((c) => c.trim())
  );
  if (rows.length < 2) return null;
  const headers = rows[0];
  const body = rows.slice(2); // skip separator row
  return (
    <div key={keyPrefix} className="overflow-x-auto my-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground">
                {parseInline(h, `${keyPrefix}-th${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-b last:border-0 hover:bg-muted/20">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-muted-foreground">
                  {parseInline(cell, `${keyPrefix}-td${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // H2
    if (line.startsWith("## ")) {
      const text = line.slice(3);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      elements.push(
        <h2 key={key++} id={id} className="text-xl font-semibold mt-6 mb-3 text-foreground first:mt-0">
          {parseInline(text, `h2-${key}`)}
        </h2>
      );
      i++;
    }
    // H3
    else if (line.startsWith("### ")) {
      const text = line.slice(4);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      elements.push(
        <h3 key={key++} id={id} className="text-base font-semibold mt-5 mb-2 text-foreground">
          {parseInline(text, `h3-${key}`)}
        </h3>
      );
      i++;
    }
    // H4
    else if (line.startsWith("#### ")) {
      const text = line.slice(5);
      elements.push(
        <h4 key={key++} className="text-sm font-semibold mt-4 mb-1.5 text-foreground">
          {parseInline(text, `h4-${key}`)}
        </h4>
      );
      i++;
    }
    // HR
    else if (line.trim() === "---") {
      elements.push(<hr key={key++} className="my-4 border-border" />);
      i++;
    }
    // Table
    else if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableEl = parseTable(tableLines, `table-${key}`);
      if (tableEl) elements.push(tableEl);
      key++;
    }
    // Callout blocks: > NOTE: / > IMPORTANT: / > WARNING: / > PERMISSION:
    else if (line.startsWith("> ")) {
      const calloutLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        calloutLines.push(lines[i].slice(2));
        i++;
      }
      const firstLine = calloutLines[0] ?? "";
      const typeMatch = /^(NOTE|IMPORTANT|WARNING|PERMISSION):\s*(.*)/.exec(firstLine);
      const type = typeMatch ? typeMatch[1] : "NOTE";
      const rest = typeMatch
        ? [typeMatch[2], ...calloutLines.slice(1)].filter((l) => l.trim() !== "")
        : calloutLines;
      const style = calloutStyle(type);
      elements.push(
        <div key={key++} className={cn("my-4 rounded-md border-l-4 px-4 py-3", style.bg, style.border)}>
          <p className={cn("text-xs font-semibold uppercase tracking-wide mb-1", style.labelColor)}>
            {style.label}
          </p>
          {rest.map((l, li) => (
            <p key={li} className="text-sm text-foreground leading-relaxed">
              {parseInline(l, `callout-${key}-${li}`)}
            </p>
          ))}
        </div>
      );
    }
    // Bullet list
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-3 text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">
              {parseInline(item, `ul-${key}-${idx}`)}
            </li>
          ))}
        </ul>
      );
    }
    // Numbered list — styled with circle badges
    else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="space-y-2 my-3">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-semibold mt-0.5">
                {idx + 1}
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {parseInline(item, `ol-${key}-${idx}`)}
              </span>
            </li>
          ))}
        </ol>
      );
    }
    // Empty line
    else if (line.trim() === "") {
      i++;
    }
    // Paragraph
    else {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed text-muted-foreground my-2">
          {parseInline(line, `p-${key}`)}
        </p>
      );
      i++;
    }
  }

  return <div className={cn("space-y-1", className)}>{elements}</div>;
}

// Named export for backward compatibility
export { MarkdownContent };
