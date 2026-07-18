/**
 * Persian labels and display helpers for the canonical Capacity kinds returned
 * by the backend. The frontend must use explicit equality mapping; it must
 * never infer the meaning from substrings such as kind.includes("PS5").
 */

export const CAPACITY_KIND_LABELS: Record<string, string> = {
  Z2_PS5: "PS5",
  Z2_PS4: "PS4",
  Z3_SHARED_PS5_PS4: "مشترک PS5/PS4",
};

export function getCapacityKindLabel(kind: string): string {
  return CAPACITY_KIND_LABELS[kind] ?? "نامشخص";
}

export function getCapacityFinishedLabel(isFinished: boolean): string {
  return isFinished ? "تمام‌شده" : "تکمیل‌نشده";
}
