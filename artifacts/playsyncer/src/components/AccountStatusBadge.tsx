import { cn } from "@/lib/utils";
import { getAccountStatusConfig } from "@/domain/accounts/apiStatus";

interface Props {
  status: string;
}

export function AccountStatusBadge({ status }: Props) {
  const { label, variant } = getAccountStatusConfig(status);

  const containerClasses: Record<ReturnType<typeof getAccountStatusConfig>["variant"], string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
    muted: "bg-muted text-muted-foreground",
    neutral: "bg-border text-muted-foreground",
  };

  const dotClasses: Record<ReturnType<typeof getAccountStatusConfig>["variant"], string> = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground",
    neutral: "bg-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        containerClasses[variant],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[variant])} />
      {label}
    </span>
  );
}
