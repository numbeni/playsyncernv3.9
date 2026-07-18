import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Hash,
  UserCircle2,
  Calendar,
  Loader2,
  AlertCircle,
  RefreshCw,
  Layers,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Platform } from "@/domain/games/types";
import { platformLabel } from "@/domain/games/platform";
import {
  useGetAccount,
  useGetAccountCapacities,
  getGetAccountQueryKey,
  getGetAccountCapacitiesQueryKey,
} from "@workspace/api-client-react";
import { AccountStatusBadge } from "./AccountStatusBadge";
import { CapacityKindBadge } from "./CapacityKindBadge";
import { formatApiError } from "@/lib/apiErrors";
import { getCapacityFinishedLabel } from "@/domain/accounts/capacityKind";

interface Props {
  open: boolean;
  accountId: string | null;
  gamePlatform: Platform;
  onClose: () => void;
}

export function AccountDetailsReadOnly({
  open,
  accountId,
  gamePlatform,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const {
    data: accountData,
    isLoading: accountLoading,
    isError: accountError,
    error: accountErrorObj,
    refetch: refetchAccount,
  } = useGetAccount(accountId ?? "", {
    query: {
      queryKey: getGetAccountQueryKey(accountId ?? ""),
      enabled: !!accountId && open,
    },
  });

  const {
    data: capacitiesData,
    isLoading: capacitiesLoading,
    isError: capacitiesError,
    error: capacitiesErrorObj,
    refetch: refetchCapacities,
  } = useGetAccountCapacities(accountId ?? "", {
    query: {
      queryKey: getGetAccountCapacitiesQueryKey(accountId ?? ""),
      enabled: !!accountId && open,
    },
  });

  const account = accountData?.account;

  if (!open || typeof document === "undefined") return null;

  const modal = (
    <div
      className="fixed inset-0 z-[300] overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-details-title"
    >
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="flex min-h-full justify-center p-4 sm:p-6">
        <div className="relative z-10 my-auto w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-elevated animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-glow font-bold text-sm">
                {account?.displayNumber.slice(-3) ?? "—"}
              </div>
              <div className="min-w-0">
                <h2
                  id="account-details-title"
                  className="truncate text-sm font-semibold sm:text-base"
                >
                  {account?.displayNumber ?? "جزئیات اکانت"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {platformLabel(gamePlatform)} ·{" "}
                  {account ? (
                    <AccountStatusBadge status={account.status} />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent transition-colors"
              aria-label="بستن"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-2 p-4 sm:p-5 overflow-y-auto max-h-[calc(100dvh-10rem)]">
            {accountLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">در حال دریافت اطلاعات اکانت…</span>
              </div>
            )}

            {!accountLoading && accountError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                <p className="mt-3 text-sm font-medium text-destructive">
                  {formatApiError(accountErrorObj, { resource: "account" })}
                </p>
                <button
                  onClick={() => refetchAccount()}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  تلاش مجدد
                </button>
              </div>
            )}

            {!accountLoading && !accountError && account && (
              <>
                <DetailRow
                  icon={Hash}
                  label="Account ID"
                  value={account.accountCode}
                  copy
                  dir="ltr"
                />
                <DetailRow
                  icon={UserCircle2}
                  label="Online ID"
                  value={account.onlineId || "—"}
                  copy={!!account.onlineId}
                  dir="ltr"
                />
                <DetailRow
                  icon={Calendar}
                  label="Birth Date"
                  value={account.birthDate || "—"}
                  dir="ltr"
                />
                <div className="grid grid-cols-2 gap-2">
                  <DetailRow
                    icon={Calendar}
                    label="Created At"
                    value={new Date(account.createdAt).toLocaleString("fa-IR")}
                    dir="ltr"
                  />
                  <DetailRow
                    icon={Calendar}
                    label="Updated At"
                    value={new Date(account.updatedAt).toLocaleString("fa-IR")}
                    dir="ltr"
                  />
                </div>

                {/* Capacities — read-only, independent state */}
                <div className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Layers className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] text-muted-foreground">
                        ظرفیت‌ها
                      </span>

                      {capacitiesLoading && (
                        <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs">در حال دریافت ظرفیت‌ها…</span>
                        </div>
                      )}

                      {!capacitiesLoading && capacitiesError && (
                        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center">
                          <AlertCircle className="mx-auto h-4 w-4 text-destructive" />
                          <p className="mt-1 text-xs text-destructive">
                            {formatApiError(capacitiesErrorObj, {
                              resource: "capacity",
                            })}
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

                      {!capacitiesLoading && !capacitiesError && capacitiesData?.capacities.length === 0 && (
                        <span className="block text-xs text-muted-foreground">
                          —
                        </span>
                      )}

                      {!capacitiesLoading && !capacitiesError && (capacitiesData?.capacities.length ?? 0) > 0 && (
                        <ul className="mt-1 space-y-1">
                          {capacitiesData?.capacities.map((c) => (
                            <li
                              key={c.id}
                              className="space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <CapacityKindBadge kind={c.capacityKind} />
                                  <span className="text-[10px] text-muted-foreground">
                                    #{c.instanceNo}
                                  </span>
                                  <span className="truncate">{c.displayLabel}</span>
                                </span>
                                <span
                                  className={cn(
                                    "text-[10px] font-medium",
                                    c.isFinished
                                      ? "text-destructive"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {getCapacityFinishedLabel(c.isFinished)}
                                </span>
                              </div>
                              {c.finishedAt && (
                                <div className="text-[10px] text-muted-foreground" dir="ltr">
                                  {new Date(c.finishedAt).toLocaleString("fa-IR")}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3 sm:px-5 sm:py-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              بستن
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
      aria-label="کپی"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  copyValue,
  copy,
  dir: textDir = "rtl",
  trailing,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  copyValue?: string;
  copy?: boolean;
  dir?: "ltr" | "rtl";
  trailing?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] text-muted-foreground">{label}</span>
        <span
          className={cn("block truncate font-mono text-xs")}
          dir={textDir}
        >
          {value}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {copy && <CopyButton value={copyValue ?? value} />}
        {trailing}
      </span>
    </div>
  );
}
