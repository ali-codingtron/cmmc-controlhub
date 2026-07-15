import { useState, useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, X, Star } from "lucide-react";

export interface ControlOption {
  id: string;
  controlId: string;
  title?: string | null;
  domainName?: string | null;
  level?: string | null;
}

interface ControlMultiSelectProps {
  controls: ControlOption[];
  selectedIds: string[];
  primaryId: string | null;
  onChange: (ids: string[]) => void;
  onPrimaryChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ControlMultiSelect({
  controls,
  selectedIds,
  primaryId,
  onChange,
  onPrimaryChange,
  placeholder = "Select controls…",
  disabled,
}: ControlMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id];
    onChange(next);
    // If we removed the primary, clear it
    if (!next.includes(primaryId ?? "")) {
      onPrimaryChange(next.length > 0 ? next[0] : null);
    }
    // If this is the first selection, auto-set as primary
    if (selectedIds.length === 0 && !selectedIds.includes(id)) {
      onPrimaryChange(id);
    }
  };

  const handleRemoveChip = (id: string) => {
    const next = selectedIds.filter((s) => s !== id);
    onChange(next);
    if (id === primaryId) {
      onPrimaryChange(next.length > 0 ? next[0] : null);
    }
  };

  const handleSetPrimary = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onPrimaryChange(id);
  };

  const selectedControls = useMemo(
    () => controls.filter((c) => selectedIds.includes(c.id)),
    [controls, selectedIds]
  );

  const triggerLabel = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const primary = controls.find((c) => c.id === primaryId);
    if (primary) {
      return selectedIds.length === 1
        ? primary.controlId
        : `${primary.controlId} +${selectedIds.length - 1}`;
    }
    return `${selectedIds.length} selected`;
  }, [selectedIds, primaryId, controls]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              selectedIds.length > 0 && "border-primary/60 bg-primary/5"
            )}
          >
            <span className="truncate text-left flex-1 text-sm">
              {triggerLabel ?? (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[28rem]" align="start">
          <Command>
            <CommandInput placeholder="Search controls by ID or name…" />
            <CommandList className="max-h-[280px]">
              <CommandEmpty>No controls found.</CommandEmpty>
              <CommandGroup>
                {controls.map((ctrl) => {
                  const isSelected = selectedIds.includes(ctrl.id);
                  return (
                    <CommandItem
                      key={ctrl.id}
                      value={`${ctrl.controlId} ${ctrl.title ?? ""} ${ctrl.domainName ?? ""}`}
                      onSelect={() => toggle(ctrl.id)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span className="font-mono text-xs font-semibold text-primary shrink-0">
                        {ctrl.controlId}
                      </span>
                      {ctrl.title && (
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {ctrl.title}
                        </span>
                      )}
                      {ctrl.level && (
                        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                          {ctrl.level}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected chips */}
      {selectedControls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedControls.map((ctrl) => {
            const isPrimary = ctrl.id === primaryId;
            return (
              <Badge
                key={ctrl.id}
                variant={isPrimary ? "default" : "secondary"}
                className={cn(
                  "flex items-center gap-1 pl-2 pr-1 text-xs font-mono",
                  isPrimary && "gap-1.5"
                )}
              >
                {isPrimary && <Star className="h-2.5 w-2.5 fill-current shrink-0" />}
                {ctrl.controlId}
                {!isPrimary && (
                  <button
                    type="button"
                    title="Set as primary"
                    onClick={(e) => handleSetPrimary(e, ctrl.id)}
                    className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                    tabIndex={-1}
                  >
                    <Star className="h-2.5 w-2.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveChip(ctrl.id)}
                  className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                  tabIndex={-1}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
      {selectedControls.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <Star className="h-2.5 w-2.5 inline mr-0.5 fill-current" />
          {primaryId
            ? `${controls.find((c) => c.id === primaryId)?.controlId ?? "—"} is the primary control. Click ★ on another chip to change it.`
            : "Click ★ on a chip to set the primary control."}
        </p>
      )}
    </div>
  );
}
