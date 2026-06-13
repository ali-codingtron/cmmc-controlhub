import { HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpButtonProps {
  module: string;
  label?: string;
  className?: string;
  variant?: "icon" | "text";
}

export function HelpButton({ module, label, className, variant = "icon" }: HelpButtonProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    setLocation(`/help?module=${encodeURIComponent(module)}`);
  };

  if (variant === "text") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        className={className}
      >
        <HelpCircle className="h-4 w-4 mr-1.5" />
        {label ?? "Help"}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={`inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${className ?? ""}`}
          aria-label="Open help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{label ?? "View help guide"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
