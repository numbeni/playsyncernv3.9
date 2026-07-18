import { AccountStatus } from "@workspace/api-zod";

export type StatusCapacity = {
  id: string;
  isFinished: boolean;
};

/**
 * Derive the canonical Account status from the persisted statusOverride and the
 * current state of the Account's Capacities and active Customer relations.
 *
 * Precedence (exact):
 *   1. statusOverride = INACTIVE -> INACTIVE
 *   2. statusOverride = SOLD    -> SOLD
 *   3. every Capacity is finished -> SOLD
 *   4. every Capacity is unfinished and has no active Customer relation -> AVAILABLE
 *   5. any other mixed state -> PARTIALLY_SOLD
 *
 * The derived status is never persisted. It is computed on demand for read-only
 * API responses.
 */
export function deriveAccountStatus(
  statusOverride: "INACTIVE" | "SOLD" | null,
  capacities: StatusCapacity[],
  activeCustomerCapacityIds: Set<string>,
): AccountStatus {
  if (statusOverride === "INACTIVE") return "INACTIVE";
  if (statusOverride === "SOLD") return "SOLD";

  // An Account with no Capacities is vacuously finished. In practice every
  // Account created by the Domain Service receives Capacities, but this branch
  // keeps the helper total and deterministic for direct-read fixtures.
  if (capacities.length === 0) return "SOLD";

  if (capacities.every((c) => c.isFinished)) return "SOLD";

  if (
    capacities.every(
      (c) => !c.isFinished && !activeCustomerCapacityIds.has(c.id),
    )
  ) {
    return "AVAILABLE";
  }

  return "PARTIALLY_SOLD";
}
