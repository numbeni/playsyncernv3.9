import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { eq, sql } from "drizzle-orm";
import { startTestPg } from "../../lib/test-pg.ts";
import { decrypt, encrypt } from "../../lib/crypto.ts";

let databaseUrl: string;
let stopPg: () => Promise<void>;
let db: typeof import("@workspace/db");
let accountService: typeof import("./index.ts");

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

before(async () => {
  const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
  databaseUrl = dbUrl;
  stopPg = stopPgFn;

  process.env.DATABASE_URL = databaseUrl;
  process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = TEST_MASTER_KEY;

  db = await import("@workspace/db");
  accountService = await import("./index.ts");
});

after(async () => {
  if (db) {
    await db.pool.end();
  }
  await stopPg();
});

let gameCounter = 0;

function uniqueTitle(prefix: string): string {
  gameCounter += 1;
  return `${prefix} ${Date.now()} ${gameCounter}`;
}

async function createGame(
  prefix: string,
  platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
) {
  const title = uniqueTitle(prefix);
  const [game] = await db.db
    .insert(db.gamesTable)
    .values({
      title,
      titleNormalized: title.toLowerCase().replace(/\s+/g, " ").trim(),
      platform,
      status,
    })
    .returning();
  return game;
}

let inputCounter = 0;

function validInput(
  gameId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  inputCounter += 1;
  return {
    gameId,
    psnEmail: `test-${inputCounter}@example.com`,
    psnPassword: "psn-secret",
    emailPassword: "email-secret",
    onlineId: `TestOnlineId${inputCounter}`,
    birthDate: "1990-01-01",
    familyManagementEmail: `family-${inputCounter}@example.com`,
    backupCodes: ["code1", "code2"],
    ...overrides,
  };
}

async function countRows(table: unknown): Promise<number> {
  const [row] = (await db.db
    .select({ count: sql`count(*)::int` })
    .from(table as never)) as { count: number }[];
  return row.count;
}

async function getRowCounts() {
  return {
    accounts: await countRows(db.accountsTable),
    capacities: await countRows(db.accountCapacitiesTable),
    backupCodes: await countRows(db.accountBackupCodesTable),
  };
}

async function assertNoNewRows(
  before: Awaited<ReturnType<typeof getRowCounts>>,
) {
  const after = await getRowCounts();
  assert.strictEqual(after.accounts, before.accounts, "no new accounts");
  assert.strictEqual(after.capacities, before.capacities, "no new capacities");
  assert.strictEqual(
    after.backupCodes,
    before.backupCodes,
    "no new backup codes",
  );
}

async function getAccountByGameId(gameId: string) {
  const [account] = await db.db
    .select()
    .from(db.accountsTable)
    .where(eq(db.accountsTable.gameId, gameId))
    .limit(1);
  return account;
}

async function getCapacities(accountId: string) {
  return db.db
    .select()
    .from(db.accountCapacitiesTable)
    .where(eq(db.accountCapacitiesTable.accountId, accountId));
}

async function getBackupCodes(accountId: string) {
  return db.db
    .select()
    .from(db.accountBackupCodesTable)
    .where(eq(db.accountBackupCodesTable.accountId, accountId));
}

async function getAccountCodeSeqValue(): Promise<number> {
  const result = (await db.db.execute(
    sql`SELECT last_value FROM account_code_seq`,
  )) as { rows: { last_value: number }[] };
  return Number(result.rows[0].last_value);
}

async function createBackupCodeRejectTrigger() {
  await db.db.execute(sql`
    CREATE OR REPLACE FUNCTION reject_account_backup_code_insert()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'account backup code insert rejected by test trigger';
    END;
    $$ LANGUAGE plpgsql;
  `);
  await db.db.execute(sql`
    CREATE TRIGGER reject_account_backup_code_insert_trg
    BEFORE INSERT ON account_backup_codes
    FOR EACH STATEMENT
    EXECUTE FUNCTION reject_account_backup_code_insert();
  `);
}

async function dropBackupCodeRejectTrigger() {
  await db.db.execute(sql`
    DROP TRIGGER IF EXISTS reject_account_backup_code_insert_trg ON account_backup_codes;
  `);
  await db.db.execute(sql`
    DROP FUNCTION IF EXISTS reject_account_backup_code_insert();
  `);
}

function zodError(err: unknown): boolean {
  return err instanceof Error && (err as Error).name === "ZodError";
}

describe("Account Domain Service", () => {
  it("creates a valid account", async () => {
    const game = await createGame("Valid", "PS5_ONLY");
    const result = await accountService.createAccount(validInput(game.id));

    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    assert.match(result.account.accountCode, /^ACC-\d{6}$/);
    assert.match(result.account.displayNumber, /^[A-Z][A-Z0-9\-]*-\d{3}$/);
    assert.ok(!result.account.displayNumber.startsWith("#"));
    assert.strictEqual(result.account.accountNumberSeq, 1);
    assert.strictEqual(result.account.onlineId, "TestOnlineId1");
    assert.strictEqual(result.account.birthDate, "1990-01-01");
  });

  it("trims and lowercases emails for storage", async () => {
    const game = await createGame("Email Normalize", "PS5_ONLY");
    const input = validInput(game.id, {
      psnEmail: "  Upper@Example.com  ",
      familyManagementEmail: "  Family@Example.com  ",
    });
    const result = await accountService.createAccount(input);
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    const account = await getAccountByGameId(game.id);
    assert.ok(account);
    const keys = accountService.loadAccountMasterKey();
    assert.strictEqual(
      decrypt(account!.psnEmailEncrypted as string, keys.encryptionKey),
      "upper@example.com",
    );
    assert.strictEqual(
      decrypt(
        account!.familyManagementEmailEncryptedV2 as string,
        keys.encryptionKey,
      ),
      "family@example.com",
    );
  });

  it("trims Online ID but preserves its entered case", async () => {
    const game = await createGame("Online ID Case", "PS5_ONLY");
    const result = await accountService.createAccount(
      validInput(game.id, { onlineId: "  MixedCaseOnline  " }),
    );
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    assert.strictEqual(result.account.onlineId, "MixedCaseOnline");
    const account = await getAccountByGameId(game.id);
    assert.strictEqual(account!.onlineId, "MixedCaseOnline");
  });

  it("rejects invalid birth date formats and impossible dates", async () => {
    const game = await createGame("Birth Date", "PS5_ONLY");

    await assert.rejects(
      accountService.createAccount(
        validInput(game.id, { birthDate: "1990/01/01" }),
      ),
      zodError,
    );
    await assert.rejects(
      accountService.createAccount(
        validInput(game.id, { birthDate: "2026-02-31" }),
      ),
      zodError,
    );
    await assert.rejects(
      accountService.createAccount(
        validInput(game.id, { birthDate: "2021-02-29" }),
      ),
      zodError,
    );

    const valid = await accountService.createAccount(
      validInput(game.id, { birthDate: "2020-02-29" }),
    );
    assert.strictEqual(valid.kind, "created");
    if (valid.kind !== "created") return;
    assert.strictEqual(valid.account.birthDate, "2020-02-29");
  });

  it("rejects empty or whitespace-only backup codes", async () => {
    const game = await createGame("No Backup", "PS5_ONLY");
    const before = await getRowCounts();

    await assert.rejects(
      accountService.createAccount(validInput(game.id, { backupCodes: [] })),
      zodError,
    );

    await assert.rejects(
      accountService.createAccount(
        validInput(game.id, { backupCodes: ["   "] }),
      ),
      zodError,
    );

    await assertNoNewRows(before);
  });

  it("rejects account creation for an inactive game", async () => {
    const game = await createGame("Inactive", "PS5_ONLY", "INACTIVE");
    await assert.rejects(
      accountService.createAccount(validInput(game.id)),
      accountService.InactiveGameError,
    );
  });

  it("rejects statusOverride through strict input contract", async () => {
    const game = await createGame("Status Override", "PS5_ONLY");
    await assert.rejects(
      accountService.createAccount({
        ...validInput(game.id),
        statusOverride: "SOLD",
      }),
      zodError,
    );
  });

  it("fails closed when PLAYSYNCER_ACCOUNT_MASTER_KEY is missing or invalid", async () => {
    const original = process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    const game = await createGame("Missing Key", "PS5_ONLY");

    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = "";
    await assert.rejects(
      accountService.createAccount(validInput(game.id)),
      accountService.EncryptionError,
    );

    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = "not-base64!!!";
    await assert.rejects(
      accountService.createAccount(validInput(game.id)),
      accountService.EncryptionError,
    );

    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = "abcd";
    await assert.rejects(
      accountService.createAccount(validInput(game.id)),
      accountService.EncryptionError,
    );

    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = original;
  });

  it("encrypts credentials and decrypts them back to the original values", async () => {
    const game = await createGame("Encrypted", "PS5_ONLY");
    const input = validInput(game.id, {
      psnEmail: "enc@example.com",
      familyManagementEmail: "enc-fam@example.com",
    });
    const result = await accountService.createAccount(input);
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    const account = await getAccountByGameId(game.id);
    assert.ok(account);
    const keys = accountService.loadAccountMasterKey();

    assert.strictEqual(
      decrypt(account!.psnEmailEncrypted as string, keys.encryptionKey),
      input.psnEmail,
    );
    assert.strictEqual(
      decrypt(account!.psnPasswordEncrypted as string, keys.encryptionKey),
      input.psnPassword,
    );
    assert.strictEqual(
      decrypt(account!.emailPasswordEncryptedV2 as string, keys.encryptionKey),
      input.emailPassword,
    );
    assert.strictEqual(
      decrypt(
        account!.familyManagementEmailEncryptedV2 as string,
        keys.encryptionKey,
      ),
      input.familyManagementEmail,
    );

    const backupCodes = await getBackupCodes(account!.id);
    assert.strictEqual(backupCodes.length, 2);
    const decryptedCodes = backupCodes
      .map((c) => decrypt(c.codeCiphertext, keys.encryptionKey))
      .sort();
    assert.deepStrictEqual(decryptedCodes, ["code1", "code2"]);
  });

  it("two encryptions of the same value produce different ciphertext", async () => {
    const keys = accountService.loadAccountMasterKey();
    const a = encrypt("same-secret", keys.encryptionKey);
    const b = encrypt("same-secret", keys.encryptionKey);
    assert.notStrictEqual(a, b);
    assert.strictEqual(decrypt(a, keys.encryptionKey), "same-secret");
    assert.strictEqual(decrypt(b, keys.encryptionKey), "same-secret");
  });

  it("returns a duplicate warning and writes nothing when duplicates exist", async () => {
    const game = await createGame("Duplicate", "PS5_ONLY");
    const firstInput = validInput(game.id);
    const first = await accountService.createAccount(firstInput);
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const before = await getRowCounts();

    const second = await accountService.createAccount({
      ...firstInput,
      backupCodes: ["another-code"],
    });
    assert.strictEqual(second.kind, "duplicate-warning");
    if (second.kind !== "duplicate-warning") return;

    assert.ok(second.duplicateFields.includes("psnEmail"));
    assert.ok(second.duplicateFields.includes("onlineId"));
    assert.ok(second.duplicateFields.includes("familyManagementEmail"));

    await assertNoNewRows(before);
  });

  it("detects duplicates case-insensitively for emails and Online ID", async () => {
    const game = await createGame("Case Dup", "PS5_ONLY");
    const firstInput = validInput(game.id, {
      psnEmail: "Case@Example.com",
      onlineId: "MixedCaseId",
    });
    const first = await accountService.createAccount(firstInput);
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const second = await accountService.createAccount({
      ...firstInput,
      psnEmail: (firstInput.psnEmail as string).toUpperCase(),
      onlineId: "MIXEDCASEID",
      familyManagementEmail: (
        firstInput.familyManagementEmail as string
      ).toUpperCase(),
      backupCodes: ["case-code"],
    });
    assert.strictEqual(second.kind, "duplicate-warning");
    if (second.kind !== "duplicate-warning") return;

    assert.ok(second.duplicateFields.includes("psnEmail"));
    assert.ok(second.duplicateFields.includes("onlineId"));
    assert.ok(second.duplicateFields.includes("familyManagementEmail"));
  });

  it("creates an account when confirmed despite duplicates", async () => {
    const game = await createGame("Confirmed", "PS5_ONLY");
    const firstInput = validInput(game.id);
    const first = await accountService.createAccount(firstInput);
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const second = await accountService.createAccount({
      ...firstInput,
      backupCodes: ["confirmed-code"],
      confirmed: true,
    });
    assert.strictEqual(second.kind, "created");
    if (second.kind !== "created") return;

    assert.strictEqual(second.account.accountNumberSeq, 2);
  });

  it("returns only safe, non-secret fields in the result", async () => {
    const game = await createGame("Safe", "PS5_ONLY");
    const result = await accountService.createAccount(validInput(game.id));
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    const allowedKeys = [
      "id",
      "gameId",
      "accountCode",
      "accountNumberPrefix",
      "accountNumberSeq",
      "displayNumber",
      "onlineId",
      "birthDate",
      "createdAt",
      "updatedAt",
    ];
    assert.deepStrictEqual(
      Object.keys(result.account).sort(),
      allowedKeys.sort(),
    );

    const serialized = JSON.stringify(result.account).toLowerCase();
    assert.ok(!serialized.includes("password"));
    assert.ok(!serialized.includes("email"));
    assert.ok(!serialized.includes("hash"));
    assert.ok(!serialized.includes("backup"));
    assert.ok(!serialized.includes("ciphertext"));
  });

  it("rolls back all writes when Account creation fails", async () => {
    const before = await getRowCounts();
    await assert.rejects(
      accountService.createAccount(
        validInput("00000000-0000-0000-0000-000000000000"),
      ),
      accountService.GameNotFoundError,
    );
    await assertNoNewRows(before);
  });

  it("rolls back all writes when Backup Code insert fails due to database trigger", async () => {
    const game = await createGame("Trigger Rollback", "PS5_ONLY");
    const before = await getRowCounts();
    const seqBefore = await getAccountCodeSeqValue();

    await createBackupCodeRejectTrigger();
    try {
      await assert.rejects(
        accountService.createAccount(validInput(game.id)),
        (err: unknown) => {
          const cause = (err as { cause?: { message?: string } }).cause;
          const message = (err as Error).message;
          return (
            message.includes("rejected by test trigger") ||
            !!cause?.message?.includes("rejected by test trigger")
          );
        },
      );
    } finally {
      await dropBackupCodeRejectTrigger();
    }

    await assertNoNewRows(before);

    const sequenceRow = await db.db
      .select()
      .from(db.gameAccountSequencesTable)
      .where(eq(db.gameAccountSequencesTable.gameId, game.id));
    assert.strictEqual(
      sequenceRow.length,
      0,
      "per-game sequence row must not remain after rollback",
    );

    const seqAfterFailure = await getAccountCodeSeqValue();
    assert.strictEqual(
      seqAfterFailure,
      seqBefore + 1,
      "global sequence consumed a value before the rollback",
    );

    const success = await accountService.createAccount(
      validInput(game.id, {
        psnEmail: "rollback-success@example.com",
        onlineId: "RollbackSuccess",
        familyManagementEmail: "rollback-success-fam@example.com",
      }),
    );
    assert.strictEqual(success.kind, "created");
    if (success.kind !== "created") return;
    assert.strictEqual(
      success.account.accountNumberSeq,
      1,
      "rolled-back per-game number is reused",
    );
    const successNumber = Number(success.account.accountCode.replace("ACC-", ""));
    assert.ok(successNumber > seqAfterFailure, "global sequence has a gap");
  });

  it("creates correct capacity rows with exact kind and instanceNo tuples for all platforms", async () => {
    const ps5Game = await createGame("PS5", "PS5_ONLY");
    const ps5Result = await accountService.createAccount(
      validInput(ps5Game.id),
    );
    assert.strictEqual(ps5Result.kind, "created");
    if (ps5Result.kind !== "created") return;
    const ps5Capacities = (await getCapacities(ps5Result.account.id))
      .map((c) => [c.capacityKindV2, c.instanceNo])
      .sort() as [string, number][];
    assert.deepStrictEqual(ps5Capacities, [
      ["Z2_PS5", 1],
      ["Z2_PS5", 2],
      ["Z3_SHARED_PS5_PS4", 0],
    ]);

    const bothGame = await createGame("Both", "PS4_AND_PS5");
    const bothResult = await accountService.createAccount(
      validInput(bothGame.id),
    );
    assert.strictEqual(bothResult.kind, "created");
    if (bothResult.kind !== "created") return;
    const bothCapacities = (await getCapacities(bothResult.account.id))
      .map((c) => [c.capacityKindV2, c.instanceNo])
      .sort() as [string, number][];
    assert.deepStrictEqual(bothCapacities, [
      ["Z2_PS4", 1],
      ["Z2_PS5", 1],
      ["Z2_PS5", 2],
      ["Z3_SHARED_PS5_PS4", 0],
    ]);

    const ps4Game = await createGame("PS4", "PS4_ONLY");
    const ps4Result = await accountService.createAccount(
      validInput(ps4Game.id),
    );
    assert.strictEqual(ps4Result.kind, "created");
    if (ps4Result.kind !== "created") return;
    const ps4Capacities = (await getCapacities(ps4Result.account.id))
      .map((c) => [c.capacityKindV2, c.instanceNo])
      .sort() as [string, number][];
    assert.deepStrictEqual(ps4Capacities, [
      ["Z2_PS4", 1],
      ["Z3_SHARED_PS5_PS4", 0],
    ]);
  });

  it("allocates distinct identifiers for two concurrent creations", async () => {
    const game = await createGame("Concurrent", "PS5_ONLY");

    const [first, second] = await Promise.all([
      accountService.createAccount(
        validInput(game.id, {
          psnEmail: "concurrent-first@example.com",
          onlineId: "ConcurrentFirst",
          familyManagementEmail: "concurrent-family-first@example.com",
        }),
      ),
      accountService.createAccount(
        validInput(game.id, {
          psnEmail: "concurrent-second@example.com",
          onlineId: "ConcurrentSecond",
          familyManagementEmail: "concurrent-family-second@example.com",
        }),
      ),
    ]);

    assert.strictEqual(first.kind, "created");
    assert.strictEqual(second.kind, "created");
    if (first.kind !== "created" || second.kind !== "created") return;

    assert.notStrictEqual(first.account.id, second.account.id);
    assert.notStrictEqual(
      first.account.accountNumberSeq,
      second.account.accountNumberSeq,
    );
    assert.notStrictEqual(
      first.account.displayNumber,
      second.account.displayNumber,
    );
    assert.notStrictEqual(first.account.accountCode, second.account.accountCode);
  });

  it("concurrent identical unconfirmed requests produce one creation and one warning", async () => {
    const game = await createGame("Concurrent Identical", "PS5_ONLY");
    const input = validInput(game.id);
    const before = await getRowCounts();

    const [first, second] = await Promise.all([
      accountService.createAccount(input),
      accountService.createAccount({
        ...input,
        backupCodes: ["another-code"],
      }),
    ]);
    const after = await getRowCounts();

    assert.strictEqual(after.accounts, before.accounts + 1);
    assert.ok(
      (first.kind === "created" && second.kind === "duplicate-warning") ||
        (first.kind === "duplicate-warning" && second.kind === "created"),
    );

    if (first.kind === "created") {
      assert.strictEqual(second.kind, "duplicate-warning");
      assert.ok((second as { duplicateFields: string[] }).duplicateFields.includes("psnEmail"));
    } else {
      assert.strictEqual(first.kind, "duplicate-warning");
      assert.ok((first as { duplicateFields: string[] }).duplicateFields.includes("psnEmail"));
    }
  });

  it("identifiers from a created and deleted account are not reused", async () => {
    const game = await createGame("Deleted Reuse", "PS5_ONLY");
    const first = await accountService.createAccount(validInput(game.id));
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    await db.db
      .update(db.accountsTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.accountsTable.id, first.account.id));

    const second = await accountService.createAccount(
      validInput(game.id, {
        psnEmail: "reuse-second@example.com",
        onlineId: "ReuseSecond",
        familyManagementEmail: "reuse-second-fam@example.com",
      }),
    );
    assert.strictEqual(second.kind, "created");
    if (second.kind !== "created") return;

    const firstCode = Number(first.account.accountCode.replace("ACC-", ""));
    const secondCode = Number(second.account.accountCode.replace("ACC-", ""));
    assert.ok(
      secondCode > firstCode,
      "global account code is not reused after deletion",
    );
    assert.strictEqual(
      second.account.accountNumberSeq,
      2,
      "per-game sequence is not reused after deletion",
    );
  });

  it("invalid birth dates do not throw RangeError", async () => {
    const game = await createGame("Birth Date RangeError", "PS5_ONLY");
    const badDates = [
      "2026-02-31",
      "2026-99-99",
      "0000-00-00",
      "2021-02-29",
    ];

    for (const birthDate of badDates) {
      let thrown: unknown;
      try {
        await accountService.createAccount(validInput(game.id, { birthDate }));
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown instanceof Error, `expected error for ${birthDate}`);
      assert.ok(
        !(thrown instanceof RangeError),
        `RangeError thrown for ${birthDate}`,
      );
      assert.ok(zodError(thrown), `expected ZodError for ${birthDate}`);
    }
  });

  it("returns IdentifierConflictError when forced per-game sequence collision occurs", async () => {
    const game = await createGame("Identifier Conflict", "PS5_ONLY");
    const first = await accountService.createAccount(validInput(game.id));
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const before = await getRowCounts();

    // Force the per-game counter back so the next account collides with the existing one.
    await db.db
      .update(db.gameAccountSequencesTable)
      .set({ lastValue: 0 })
      .where(eq(db.gameAccountSequencesTable.gameId, game.id));

    try {
      await assert.rejects(
        accountService.createAccount(
          validInput(game.id, {
            psnEmail: "conflict-second@example.com",
            onlineId: "ConflictSecond",
            familyManagementEmail: "conflict-second-fam@example.com",
          }),
        ),
        accountService.IdentifierConflictError,
      );
    } finally {
      // Restore the counter so this isolated game does not surprise later tests.
      await db.db
        .update(db.gameAccountSequencesTable)
        .set({ lastValue: 1 })
        .where(eq(db.gameAccountSequencesTable.gameId, game.id));
    }

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts, "no partial account");
    assert.strictEqual(
      after.capacities,
      before.capacities,
      "no partial capacities",
    );
    assert.strictEqual(
      after.backupCodes,
      before.backupCodes,
      "no partial backup codes",
    );
  });

  it("duplicate advisory lock tokens do not cause incorrect behavior", async () => {
    const game = await createGame("Duplicate Lock Tokens", "PS5_ONLY");
    const sharedEmail = "shared@example.com";
    const result = await accountService.createAccount({
      ...validInput(game.id),
      psnEmail: sharedEmail,
      familyManagementEmail: sharedEmail,
    });
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;
    assert.strictEqual(result.account.birthDate, "1990-01-01");
  });
});
