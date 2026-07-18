import { useState } from "react";
import {
  ChevronDown,
  Copy,
  Check,
  Layers,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AccountListItem,
  AccountCapacity,
} from "@workspace/api-client-react";
import {
  useGetAccountCapacities,
  getGetAccountCapacitiesQueryKey,
} from "@workspace/api-client-react";
import type { Platform } from "@/domain/games/types";
import { platformLabel } from "@/domain/games/platform";
import { AccountStatusBadge } from "./AccountStatusBadge";
import { CapacityKindBadge } from "./CapacityKindBadge";
import { formatApiError } from "@/lib/apiErrors";
import { getCapacityFinishedLabel } from "@/domain/accounts/capacityKind";

interface Props {
  account: AccountListItem;
  gameTitle: string;
  platform: Platform;
  onViewDetails?: (accountId: string) => void;
}

export function AccountCardReadOnly({
  account,
  gameTitle,
  platform,
  onViewDetails,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const {
    data: capacitiesData,
    isLoading: capacitiesLoading,
    isError: capacitiesError,
    error: capacitiesErrorObj,
    refetch: refetchCapacities,
  } = useGetAccountCapacities(account.id, {
    query: {
      queryKey: getGetAccountCapacitiesQueryKey(account.id),
      enabled: open,
    },
  });

  const copyNumber = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(account.displayNumber).then(() => {
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 1500);
    });
  };

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(account.accountCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1500);
    });
  };

  const capacities = capacitiesData?.capacities ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      {/* Card row: avatar, account info, action buttons */}
      <div className="flex items-center gap-3 p-4 text-right">
        <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground font-bold text-sm shadow-glow">
          {account.displayNumber.slice(-3)}
        </div>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={copyNumber}
              title="کلیک برای کپی شماره اکانت"
              dir="ltr"
              className={cn(
                "font-mono text-sm font-semibold leading-none whitespace-nowrap transition-colors cursor-copy",
                copiedNumber ? "text-success" : "hover:text-primary",
              )}
            >
              {account.displayNumber}
            </button>
            {copiedNumber && (
              <Check className="h-3 w-3 shrink-0 text-success" />
            )}
            <AccountStatusBadge status={account.status} />
          </div>

          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={copyCode}
              title="کلیک برای کپی Account ID"
              dir="ltr"
              className={cn(
                "font-mono text-[10px] leading-none whitespace-nowrap transition-colors cursor-copy",
                copiedCode
                  ? "text-success"
                  : "text-muted-foreground/70 hover:text-primary",
              )}
            >
              {account.accountCode}
            </button>
            {copiedCode && (
              <Check className="h-3 w-3 shrink-0 text-success" />
            )}
            <span className="text-border text-xs">·</span>
            <span className="text-xs text-muted-foreground truncate">
              {gameTitle}
            </span>
            <span className="hidden sm:inline text-border text-xs">·</span>
            <span className="hidden sm:inline shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {platformLabel(platform)}
            </span>
            {account.onlineId && (
              <>
                <span className="text-border text-xs">·</span>
                <span
                  className="text-xs text-muted-foreground"
                  dir="ltr"
                >
                  {account.onlineId}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(account.id)}
              title="مشاهده جزئیات اکانت"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="مشاهده جزئیات اکانت"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "بستن ظرفیت‌ها" : "نمایش ظرفیت‌ها"}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-300 ease-in-out",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded capacities — read-only */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                ظرفیت‌ها
              </h4>
              <span className="text-[11px] text-muted-foreground">
                {capacities.length.toLocaleString("fa-IR")} ظرفیت
              </span>
            </div>

            {capacitiesLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">در حال دریافت ظرفیت‌ها…</span>
              </div>
            )}

            {capacitiesError && !capacitiesLoading && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center">
                <AlertCircle className="mx-auto h-4 w-4 text-destructive" />
                <p className="mt-1 text-xs text-destructive">
                  {formatApiError(capacitiesErrorObj, { resource: "capacity" })}
                </p>
                <button
                  onClick={() => refetchCapacities()}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-xs hover:bg-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  تلاش مجدد
                </button>
              </div>
            )}

            {!capacitiesLoading && !capacitiesError && capacities.length === 0 && (
              <div className="text-xs text-muted-foreground">
                ظرفیتی برای این اکانت ثبت نشده است.
              </div>
            )}

            {!capacitiesLoading && !capacitiesError && capacities.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {capacities.map((capacity) => (
                  <CapacityBlock key={capacity.id} capacity={capacity} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CapacityBlock({ capacity }: { capacity: AccountCapacity }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CapacityKindBadge kind={capacity.capacityKind} />
          <span className="text-[10px] text-muted-foreground">
            #{capacity.instanceNo}
          </span>
          <span className="truncate text-sm font-semibold">
            {capacity.displayLabel}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] font-medium",
            capacity.isFinished ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {getCapacityFinishedLabel(capacity.isFinished)}
        </span>
      </div>
      {capacity.finishedAt && (
        <div className="mt-1 text-[10px] text-muted-foreground" dir="ltr">
          {new Date(capacity.finishedAt).toLocaleString("fa-IR")}
        </div>
      )}
    </div>
  );
}
