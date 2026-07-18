import type { Account, AccountCapacity } from "@workspace/db";
import type { AccountStatus, CapacityKind } from "@workspace/api-zod";

/**
 * Non-secret subset of an Account returned by generic API responses.
 *
 * Excludes all legacy credential columns, all encrypted/lookup-hash columns,
 * all email and family-management secrets, all password fields, all Backup
 * Codes, and the legacy active/disabled status columns.
 */
export interface SafeAccount {
  id: string;
  gameId: string;
  accountCode: string;
  accountNumberPrefix: string;
  accountNumberSeq: number;
  displayNumber: string;
  onlineId: string | null;
  birthDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Account list item returned by GET /games/{gameId}/accounts.
 *
 * Includes the derived canonical status and no secret fields.
 */
export interface SafeAccountListItem extends SafeAccount {
  status: AccountStatus;
}

/**
 * Non-secret Capacity row returned by read-only Account APIs.
 *
 * Excludes any Customer relation details and all encrypted/lookup data.
 */
export interface SafeAccountCapacity {
  id: string;
  accountId: string;
  capacityKind: CapacityKind;
  instanceNo: number;
  displayLabel: string;
  isFinished: boolean;
  finishedAt: Date | null;
}

/**
 * Full Account detail returned by GET /accounts/{accountId}.
 *
 * Includes the derived canonical status and the Account's Capacities.
 */
export interface SafeAccountDetail extends SafeAccountListItem {
  capacities: SafeAccountCapacity[];
}

/**
 * Authoritative storage-only Backup Code contract.
 *
 * PlaySyncer will not validate, consume, search, lifecycle-track, hash, or
 * reveal Backup Codes in this stage. The DB column is `code_ciphertext`
 * (renamed from `code_encrypted` by migration 0003).
 */
export interface BackupCodeStorage {
  id: string;
  accountId: string;
  codeCiphertext: string;
  createdAt: Date;
}

/**
 * Strip all secret and legacy fields before returning an Account to any caller.
 */
export function toSafeAccount(a: Account): SafeAccount {
  return {
    id: a.id,
    gameId: a.gameId,
    accountCode: a.accountCode,
    accountNumberPrefix: a.accountNumberPrefix,
    accountNumberSeq: a.accountNumberSeq,
    displayNumber: a.displayNumber,
    onlineId: a.onlineId ?? null,
    birthDate: a.birthDate ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/**
 * Map a storage Capacity row to the safe API Capacity DTO.
 *
 * The DB column `capacityKindV2` is renamed to the API field `capacityKind`.
 */
export function toSafeAccountCapacity(c: AccountCapacity): SafeAccountCapacity {
  return {
    id: c.id,
    accountId: c.accountId,
    capacityKind: c.capacityKindV2 as CapacityKind,
    instanceNo: c.instanceNo,
    displayLabel: c.displayLabel,
    isFinished: c.isFinished,
    finishedAt: c.finishedAt ?? null,
  };
}
