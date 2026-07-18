import { db } from "@workspace/db";
import {
  accountsTable,
  accountCapacitiesTable,
  accountBackupCodesTable,
  gameAccountSequencesTable,
  gamesTable,
  type Account,
  type Game,
} from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  buildCapacityDefinitions,
  normalizeAccountNumberPrefix,
  buildDisplayNumber,
  type GamePlatform,
} from "@workspace/db/helpers";
import crypto from "node:crypto";
import { encrypt, hashForLookup } from "../../lib/crypto.ts";
import { toSafeAccount, type SafeAccount } from "../../lib/dto.ts";

export class AccountDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDomainError";
  }
}

export class GameNotFoundError extends AccountDomainError {
  constructor() {
    super("Game not found");
  }
}

export class InactiveGameError extends AccountDomainError {
  constructor() {
    super("Cannot create an account for an inactive game");
  }
}

export class IdentifierConflictError extends AccountDomainError {
  constructor() {
    super("Account identifier conflict");
  }
}

export class EncryptionError extends AccountDomainError {
  constructor(message: string) {
    super(message);
  }
}

export type CreateAccountResult =
  | { kind: "created"; account: SafeAccount }
  | { kind: "duplicate-warning"; duplicateFields: string[] };

const emailSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().email("Email must be a valid email address"),
);

const onlineIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().min(1, "Online ID is required"),
);

const backupCodeSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string().min(1, "Backup code cannot be empty"),
);

function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

const birthDateSchema = z
  .string()
  .refine(
    isValidBirthDate,
    "birthDate must be a real calendar date in YYYY-MM-DD format",
  );

export const CreateAccountInput = z
  .object({
    gameId: z.string().uuid(),
    psnEmail: emailSchema,
    psnPassword: z.string().min(1, "PSN Password is required"),
    emailPassword: z.string().min(1, "Email Password is required"),
    onlineId: onlineIdSchema,
    birthDate: birthDateSchema,
    familyManagementEmail: emailSchema,
    backupCodes: z.array(backupCodeSchema).min(1, "At least one backup code is required"),
    confirmed: z.boolean().optional().default(false),
  })
  .strict();

export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export interface AccountKeys {
  encryptionKey: Buffer;
  lookupHashKey: Buffer;
}

type DbClient = typeof db;

const MASTER_KEY_LENGTH = 32;
const ENCRYPTION_KEY_INFO = "ps-account-enc";
const LOOKUP_HASH_KEY_INFO = "ps-account-lookup";

const ACCOUNT_IDENTIFIER_CONSTRAINTS = [
  "accounts_account_code_unique",
  "accounts_game_seq_unique",
  "accounts_game_display_unique",
];

export function loadAccountMasterKey(): AccountKeys {
  const encoded = process.env["PLAYSYNCER_ACCOUNT_MASTER_KEY"];
  if (!encoded) {
    throw new EncryptionError("PLAYSYNCER_ACCOUNT_MASTER_KEY is not set");
  }

  let raw: Buffer;
  try {
    raw = Buffer.from(encoded, "base64");
  } catch {
    throw new EncryptionError(
      "PLAYSYNCER_ACCOUNT_MASTER_KEY is not valid Base64",
    );
  }

  // Reject malformed or non-canonical Base64 by requiring round-trip equality.
  if (raw.toString("base64") !== encoded) {
    throw new EncryptionError(
      "PLAYSYNCER_ACCOUNT_MASTER_KEY is not canonical Base64",
    );
  }

  if (raw.length !== MASTER_KEY_LENGTH) {
    throw new EncryptionError(
      `PLAYSYNCER_ACCOUNT_MASTER_KEY must be ${MASTER_KEY_LENGTH} bytes after Base64 decoding, got ${raw.length}`,
    );
  }

  const encryptionKey = crypto.hkdfSync(
    "sha256",
    raw,
    "",
    ENCRYPTION_KEY_INFO,
    MASTER_KEY_LENGTH,
  );
  const lookupHashKey = crypto.hkdfSync(
    "sha256",
    raw,
    "",
    LOOKUP_HASH_KEY_INFO,
    MASTER_KEY_LENGTH,
  );

  return {
    encryptionKey: Buffer.from(encryptionKey),
    lookupHashKey: Buffer.from(lookupHashKey),
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeOnlineId(value: string): string {
  return value.trim();
}

function deriveAdvisoryLockId(hashHex: string): bigint {
  const unsigned = BigInt("0x" + hashHex.slice(0, 16));
  return BigInt.asIntN(64, unsigned);
}

async function requireGame(client: DbClient, gameId: string): Promise<Game> {
  const [game] = await client
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId))
    .limit(1)
    .for("update");

  if (!game || game.deletedAt) {
    throw new GameNotFoundError();
  }

  if (game.status === "INACTIVE") {
    throw new InactiveGameError();
  }

  return game;
}

async function acquireDuplicateLocks(
  client: DbClient,
  input: {
    psnEmail: string;
    familyManagementEmail: string;
    onlineId: string;
  },
  keys: AccountKeys,
): Promise<void> {
  const tokens = [
    deriveAdvisoryLockId(
      hashForLookup(normalizeEmail(input.psnEmail), keys.lookupHashKey),
    ),
    deriveAdvisoryLockId(
      hashForLookup(
        normalizeEmail(input.familyManagementEmail),
        keys.lookupHashKey,
      ),
    ),
    deriveAdvisoryLockId(
      hashForLookup(
        normalizeEmail(input.onlineId),
        keys.lookupHashKey,
      ),
    ),
  ];

  const uniqueLockIds = [...new Set(tokens)].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );

  for (const lockId of uniqueLockIds) {
    await client.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);
  }
}

async function findDuplicateFields(
  client: DbClient,
  input: {
    psnEmail: string;
    familyManagementEmail: string;
    onlineId: string;
  },
  keys: AccountKeys,
): Promise<string[]> {
  const duplicates: string[] = [];

  const psnEmailHash = hashForLookup(
    normalizeEmail(input.psnEmail),
    keys.lookupHashKey,
  );
  const [psnEmailMatch] = await client
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.psnEmailLookupHash, psnEmailHash),
        isNull(accountsTable.deletedAt),
      ),
    )
    .limit(1);
  if (psnEmailMatch) {
    duplicates.push("psnEmail");
  }

  const familyEmailHash = hashForLookup(
    normalizeEmail(input.familyManagementEmail),
    keys.lookupHashKey,
  );
  const [familyEmailMatch] = await client
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.familyManagementEmailLookupHash, familyEmailHash),
        isNull(accountsTable.deletedAt),
      ),
    )
    .limit(1);
  if (familyEmailMatch) {
    duplicates.push("familyManagementEmail");
  }

  const onlineId = normalizeOnlineId(input.onlineId);
  const [onlineIdMatch] = await client
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        sql`LOWER(${accountsTable.onlineId}) = LOWER(${onlineId})`,
        isNull(accountsTable.deletedAt),
      ),
    )
    .limit(1);
  if (onlineIdMatch) {
    duplicates.push("onlineId");
  }

  return duplicates;
}

async function allocateGlobalCode(client: DbClient): Promise<number> {
  const result = await client.execute<{ next_code: number }>(
    sql`SELECT nextval('account_code_seq') AS next_code`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new IdentifierConflictError();
  }
  return Number(row.next_code);
}

async function allocatePerGameNumber(
  client: DbClient,
  gameId: string,
): Promise<number> {
  await client
    .insert(gameAccountSequencesTable)
    .values({ gameId, lastValue: 0 })
    .onConflictDoNothing({ target: gameAccountSequencesTable.gameId });

  const [row] = await client
    .update(gameAccountSequencesTable)
    .set({ lastValue: sql`${gameAccountSequencesTable.lastValue} + 1` })
    .where(eq(gameAccountSequencesTable.gameId, gameId))
    .returning({ lastValue: gameAccountSequencesTable.lastValue });

  if (!row) {
    throw new IdentifierConflictError();
  }

  return row.lastValue;
}

async function insertAccount(
  client: DbClient,
  game: Game,
  input: CreateAccountInput,
  keys: AccountKeys,
  globalSeq: number,
  perGameSeq: number,
): Promise<Account> {
  const prefix = normalizeAccountNumberPrefix(game.title, "ACC");
  const displayNumber = buildDisplayNumber(prefix, perGameSeq);
  const accountCode = formatAccountCode(globalSeq);

  const psnEmailNormalized = normalizeEmail(input.psnEmail);
  const familyEmailNormalized = normalizeEmail(input.familyManagementEmail);
  const onlineId = normalizeOnlineId(input.onlineId);

  const [account] = await client
    .insert(accountsTable)
    .values({
      gameId: game.id,
      accountCode,
      accountNumberPrefix: prefix,
      accountNumberSeq: perGameSeq,
      displayNumber,
      psnEmailEncrypted: encrypt(psnEmailNormalized, keys.encryptionKey),
      psnEmailLookupHash: hashForLookup(
        psnEmailNormalized,
        keys.lookupHashKey,
      ),
      psnPasswordEncrypted: encrypt(input.psnPassword, keys.encryptionKey),
      psnPasswordLookupHash: hashForLookup(
        input.psnPassword,
        keys.lookupHashKey,
      ),
      emailPasswordEncryptedV2: encrypt(
        input.emailPassword,
        keys.encryptionKey,
      ),
      emailPasswordLookupHash: hashForLookup(
        input.emailPassword,
        keys.lookupHashKey,
      ),
      familyManagementEmailEncryptedV2: encrypt(
        familyEmailNormalized,
        keys.encryptionKey,
      ),
      familyManagementEmailLookupHash: hashForLookup(
        familyEmailNormalized,
        keys.lookupHashKey,
      ),
      onlineId,
      birthDate: input.birthDate,
      statusOverride: null,
    })
    .returning();

  return account;
}

async function insertCapacities(
  client: DbClient,
  accountId: string,
  platform: GamePlatform,
): Promise<void> {
  const definitions = buildCapacityDefinitions(platform);
  const values = definitions.map((def) => ({
    accountId,
    capacityKindV2: def.capacityKind,
    instanceNo: def.instanceNo,
    displayLabel: def.displayLabel,
    isFinished: false,
    finishedAt: null,
  }));

  if (values.length > 0) {
    await client.insert(accountCapacitiesTable).values(values);
  }
}

async function insertBackupCodes(
  client: DbClient,
  accountId: string,
  backupCodes: string[],
  keys: AccountKeys,
): Promise<void> {
  const values = backupCodes.map((code) => ({
    accountId,
    codeCiphertext: encrypt(code, keys.encryptionKey),
  }));

  if (values.length > 0) {
    await client.insert(accountBackupCodesTable).values(values);
  }
}

export function formatAccountCode(seq: number): string {
  return `ACC-${String(seq).padStart(6, "0")}`;
}

function hasIdentifierUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: string; constraint?: string };
    if (
      candidate.code === "23505" &&
      candidate.constraint &&
      ACCOUNT_IDENTIFIER_CONSTRAINTS.includes(candidate.constraint)
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function createAccount(
  input: unknown,
): Promise<CreateAccountResult> {
  const parsed = CreateAccountInput.parse(input);
  const keys = loadAccountMasterKey();

  return db.transaction(async (tx) => {
    const client = tx as unknown as DbClient;
    const game = await requireGame(client, parsed.gameId);

    if (!parsed.confirmed) {
      await acquireDuplicateLocks(client, {
        psnEmail: parsed.psnEmail,
        familyManagementEmail: parsed.familyManagementEmail,
        onlineId: parsed.onlineId,
      }, keys);

      const duplicates = await findDuplicateFields(client, {
        psnEmail: parsed.psnEmail,
        familyManagementEmail: parsed.familyManagementEmail,
        onlineId: parsed.onlineId,
      }, keys);

      if (duplicates.length > 0) {
        return { kind: "duplicate-warning", duplicateFields: duplicates };
      }
    }

    const globalSeq = await allocateGlobalCode(client);
    const perGameSeq = await allocatePerGameNumber(client, game.id);

    try {
      const account = await insertAccount(
        client,
        game,
        parsed,
        keys,
        globalSeq,
        perGameSeq,
      );
      await insertCapacities(client, account.id, game.platform as GamePlatform);
      await insertBackupCodes(client, account.id, parsed.backupCodes, keys);
      return { kind: "created", account: toSafeAccount(account) };
    } catch (err) {
      if (hasIdentifierUniqueViolation(err)) {
        throw new IdentifierConflictError();
      }
      throw err;
    }
  });
}
