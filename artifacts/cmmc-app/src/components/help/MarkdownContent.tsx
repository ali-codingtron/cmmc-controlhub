import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

function parseInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code class=\"bg-muted px-1 py-0.5 rounded text-sm font-mono\">$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, "<a href=\"$2\" class=\"text-primary underline hover:no-underline\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>");
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-xl font-semibold mt-6 mb-3 text-foreground first:mt-0"
          dangerouslySetInnerHTML={{ __html: parseInline(line.slice(3)) }} />
      );
      i++;
    } else if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-base font-semibold mt-5 mb-2 text-foreground"
          dangerouslySetInnerHTML={{ __html: parseInline(line.slice(4)) }} />
      );
      i++;
    } else if (line.startsWith("#### ")) {
      elements.push(
        <h4 key={key++} className="text-sm font-semibold mt-4 mb-1.5 text-foreground"
          dangerouslySetInnerHTML={{ __html: parseInline(line.slice(5)) }} />
      );
      i++;
    } else if (line.trim() === "---") {
      elements.push(<hr key={key++} className="my-4 border-border" />);
      i++;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-3 text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
          ))}
        </ul>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-1 my-3 text-muted-foreground">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
          ))}
        </ol>
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      elements.push(
        <p key={key++} className="text-sm leading-relaxed text-muted-foreground my-2"
          dangerouslySetInnerHTML={{ __html: parseInline(line) }} />
      );
      i++;
    }
  }

  return (
    <div className={cn("prose-like", className)}>
      {elements}
    </div>
  );
}
