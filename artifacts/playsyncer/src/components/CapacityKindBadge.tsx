import { cn } from "@/lib/utils";
import { getCapacityKindLabel } from "@/domain/accounts/capacityKind";

interface Props {
  kind: string;
}

export function CapacityKindBadge({ kind }: Props) {
  const isShared = kind === "Z3_SHARED_PS5_PS4";
  const isPs5 = kind === "Z2_PS5";

  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
        isShared
          ? "bg-warning/15 text-warning"
          : isPs5
            ? "bg-primary/15 text-primary"
            : "bg-accent text-accent-foreground",
      )}
    >
      {getCapacityKindLabel(kind)}
    </span>
  );
}
