import { AccountStatus } from "@workspace/api-client-react";

/**
 * Persian display labels and visual variants for the canonical Account
 * statuses returned by the backend. The frontend must never derive or
 * recalculate status; these labels are pure presentation adapters.
 */

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  [AccountStatus.AVAILABLE]: "موجود",
  [AccountStatus.PARTIALLY_SOLD]: "بخشی فروخته‌شده",
  [AccountStatus.SOLD]: "فروخته‌شده",
  [AccountStatus.INACTIVE]: "غیرفعال",
};

export type AccountStatusVariant =
  | "success"
  | "warning"
  | "destructive"
  | "muted"
  | "neutral";

export interface AccountStatusConfig {
  label: string;
  variant: AccountStatusVariant;
}

export function getAccountStatusConfig(status: string): AccountStatusConfig {
  switch (status) {
    case AccountStatus.AVAILABLE:
      return { label: ACCOUNT_STATUS_LABELS[AccountStatus.AVAILABLE], variant: "success" };
    case AccountStatus.PARTIALLY_SOLD:
      return { label: ACCOUNT_STATUS_LABELS[AccountStatus.PARTIALLY_SOLD], variant: "warning" };
    case AccountStatus.SOLD:
      return { label: ACCOUNT_STATUS_LABELS[AccountStatus.SOLD], variant: "destructive" };
    case AccountStatus.INACTIVE:
      return { label: ACCOUNT_STATUS_LABELS[AccountStatus.INACTIVE], variant: "muted" };
    default:
      // Fail-safe for unknown or future status values; never crash the UI.
      return { label: "نامشخص", variant: "neutral" };
  }
}
