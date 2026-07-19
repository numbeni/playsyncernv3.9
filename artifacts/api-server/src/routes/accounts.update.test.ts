import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express, { type Express } from "express";
import net from "node:net";
import { eq, sql } from "drizzle-orm";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { errorHandler } from "../middlewares/error-handler.ts";
import { p } from "../lib/req-param.ts";
import { decrypt } from "../lib/crypto.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

let createAccountHandler: typeof import("./accounts.ts")["createAccountHandler"];
let updateAccountHandler: typeof import("./accounts.ts")["updateAccountHandler"];
let loadAccountMasterKey: typeof import("../services/account/index.ts")["loadAccountMasterKey"];
let createAccountService: typeof import("../services/account/index.ts")["createAccount"];
let updateAccountService: typeof import("../services/account/index.ts")["updateAccount"];

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function createRequest(overrides: Record<string, unknown> = {}) {
  return {
    psnEmail: `test-${nextId()}@example.com`,
    psnPassword: "psn-secret",
    emailPassword: "email-secret",
    onlineId: `TestOnlineId${nextId()}`,
    birthDate: "1990-01-01",
    familyManagementEmail: `family-${nextId()}@example.com`,
    backupCodes: ["code1", "code2"],
    ...overrides,
  };
}

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.post("/games/:gameId/accounts", (req, res, next) => {
    const gameId = p(req.params["gameId"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
      res.status(400).json({ error: "gameId must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    createAccountHandler(req, res, next);
  });
  app.patch("/accounts/:id", (req, res, next) => {
    const id = p(req.params["id"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    updateAccountHandler(req, res, next);
  });
  app.use(errorHandler);
  return app;
}

describe("Update Account handler", { concurrency: 1 }, () => {
  let databaseUrl: string;
  let stopPg: () => Promise<void>;
  let db: typeof import("@workspace/db");

  let publicBaseUrl: string;
  let stopPublicServer: () => Promise<void>;
  let testApp: Express;
  let testServer: ReturnType<typeof express.application.listen>;
  let testPort: number;

  before(async () => {
    const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
    databaseUrl = dbUrl;
    stopPg = stopPgFn;

    process.env.DATABASE_URL = databaseUrl;
    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = TEST_MASTER_KEY;

    // Load modules that depend on @workspace/db only after the disposable test
    // database URL is set, so the production DB connection architecture is not
    // modified to accommodate tests.
    const accountsModule = await import("./accounts.ts");
    createAccountHandler = accountsModule.createAccountHandler;
    updateAccountHandler = accountsModule.updateAccountHandler;
    const serviceModule = await import("../services/account/index.ts");
    loadAccountMasterKey = serviceModule.loadAccountMasterKey;
    createAccountService = serviceModule.createAccount;
    updateAccountService = serviceModule.updateAccount;

    execSync("pnpm run build", {
      cwd: path.resolve(__dirname, "..", ".."),
      env: {
        ...process.env,
        PORT: "8080",
        BASE_PATH: "/api-server",
      },
      stdio: "ignore",
    });

    const { baseUrl: serverUrl, stop: stopServerFn } = await startApiServer(
      databaseUrl,
      DIST_DIR,
    );
    publicBaseUrl = serverUrl;
    stopPublicServer = stopServerFn;

    db = await import("@workspace/db");

    testApp = buildTestApp();
    testPort = await getFreePort();
    testServer = testApp.listen(testPort);
  });

  after(async () => {
    if (testServer) {
      testServer.close();
    }
    await stopPublicServer();
    if (db) {
      await db.pool.end();
    }
    await stopPg();
  });

  function createUrl(gameId: string): string {
    return `http://localhost:${testPort}/games/${gameId}/accounts`;
  }

  function updateUrl(accountId: string): string {
    return `http://localhost:${testPort}/accounts/${accountId}`;
  }

  async function createGame(
    title: string,
    platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY" = "PS5_ONLY",
  ) {
    const uniqueTitle = `${title} ${nextId()}`;
    const [game] = await db.db
      .insert(db.gamesTable)
      .values({
        title: uniqueTitle,
        titleNormalized: uniqueTitle.toLowerCase().trim(),
        platform,
        status: "ACTIVE",
      })
      .returning();
    return game;
  }

  async function createAccount(gameId: string) {
    const res = await fetch(createUrl(gameId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createRequest()),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: { id: string } };
    return data.account.id;
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

  async function getAccountCapacities(accountId: string) {
    return db.db
      .select()
      .from(db.accountCapacitiesTable)
      .where(eq(db.accountCapacitiesTable.accountId, accountId))
      .orderBy(
        db.accountCapacitiesTable.capacityKindV2,
        db.accountCapacitiesTable.instanceNo,
      );
  }

  async function getBackupCodes(accountId: string) {
    return db.db
      .select()
      .from(db.accountBackupCodesTable)
      .where(eq(db.accountBackupCodesTable.accountId, accountId));
  }

  async function loadAccountRow(accountId: string) {
    const [row] = await db.db
      .select()
      .from(db.accountsTable)
      .where(eq(db.accountsTable.id, accountId))
      .limit(1);
    return row;
  }

  async function installUpdateFailureTrigger() {
    await db.db.execute(sql`
      CREATE OR REPLACE FUNCTION force_update_failure()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced update failure';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await db.db.execute(sql`
      CREATE TRIGGER force_update_failure_trigger
      BEFORE UPDATE ON accounts
      FOR EACH ROW
      EXECUTE FUNCTION force_update_failure();
    `);
  }

  async function removeUpdateFailureTrigger() {
    await db.db.execute(sql`
      DROP TRIGGER IF EXISTS force_update_failure_trigger ON accounts;
    `);
    await db.db.execute(sql`
      DROP FUNCTION IF EXISTS force_update_failure();
    `);
  }

  it("public PATCH /accounts/:id returns 403 and writes nothing", async () => {
    const game = await createGame("Disabled Public Update Game");
    const accountId = await createAccount(game.id);
    const before = await getRowCounts();

    const res = await fetch(`${publicBaseUrl}/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "NewOnlineId" }),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);
  });

  it("updates non-sensitive fields and returns safe AccountDetailResponse", async () => {
    const game = await createGame("Update Non-Sensitive Game");
    const accountId = await createAccount(game.id);

    const uniqueOnlineId = `UpdatedOnlineId${nextId()}`;
    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: uniqueOnlineId, birthDate: "1995-05-05" }),
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { account: Record<string, unknown> };
    assert.strictEqual(data.account.onlineId, uniqueOnlineId);
    assert.strictEqual(data.account.birthDate, "1995-05-05");
    assert.strictEqual(data.account.status, "AVAILABLE");
    assert.ok(Array.isArray(data.account.capacities));
    assertNoSecrets(JSON.stringify(data));
  });

  it("updates sensitive fields and re-encrypts them", async () => {
    const game = await createGame("Update Sensitive Game");
    const accountId = await createAccount(game.id);
    const keys = loadAccountMasterKey();

    const uniquePsnEmail = `updated-psn-${nextId()}@example.com`;
    const uniqueFamilyEmail = `updated-family-${nextId()}@example.com`;
    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: uniquePsnEmail,
        familyManagementEmail: uniqueFamilyEmail,
        psnPassword: "updated-psn-password",
        emailPassword: "updated-email-password",
      }),
    });
    assert.strictEqual(res.status, 200);

    const row = await loadAccountRow(accountId);
    assert.strictEqual(
      decrypt(row.psnEmailEncrypted as string, keys.encryptionKey),
      uniquePsnEmail,
    );
    assert.strictEqual(
      decrypt(row.familyManagementEmailEncryptedV2 as string, keys.encryptionKey),
      uniqueFamilyEmail,
    );
    assert.strictEqual(
      decrypt(row.psnPasswordEncrypted as string, keys.encryptionKey),
      "updated-psn-password",
    );
    assert.strictEqual(
      decrypt(row.emailPasswordEncryptedV2 as string, keys.encryptionKey),
      "updated-email-password",
    );
  });

  it("omitted fields remain unchanged", async () => {
    const game = await createGame("Update Omitted Game");
    const accountId = await createAccount(game.id);
    const before = await loadAccountRow(accountId);

    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: "2000-01-01" }),
    });
    assert.strictEqual(res.status, 200);

    const after = await loadAccountRow(accountId);
    assert.strictEqual(after.psnEmailEncrypted, before.psnEmailEncrypted);
    assert.strictEqual(
      after.familyManagementEmailEncryptedV2,
      before.familyManagementEmailEncryptedV2,
    );
    assert.strictEqual(after.psnPasswordEncrypted, before.psnPasswordEncrypted);
    assert.strictEqual(
      after.emailPasswordEncryptedV2,
      before.emailPasswordEncryptedV2,
    );
    assert.strictEqual(after.onlineId, before.onlineId);
    assert.strictEqual(after.birthDate, "2000-01-01");
  });

  it("rejects immutable and unknown fields", async () => {
    const game = await createGame("Update Immutable Game");
    const accountId = await createAccount(game.id);

    for (const body of [
      { id: "550e8400-e29b-41d4-a716-446655440000" },
      { gameId: game.id },
      { accountCode: "ACC-999999" },
      { displayNumber: "X-999" },
      { accountNumberPrefix: "X" },
      { accountNumberSeq: 99 },
      { status: "INACTIVE" },
      { statusOverride: "SOLD" },
      { backupCodes: ["new"] },
      { createdAt: "2020-01-01T00:00:00Z" },
      { updatedAt: "2020-01-01T00:00:00Z" },
      { unknownField: "value" },
    ]) {
      const res = await fetch(updateUrl(accountId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.strictEqual(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    }
  });

  it("rejects empty and confirmed-only bodies", async () => {
    const game = await createGame("Update Empty Body Game");
    const accountId = await createAccount(game.id);

    const emptyRes = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.strictEqual(emptyRes.status, 400);

    const confirmedRes = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    });
    assert.strictEqual(confirmedRes.status, 400);
  });

  it("rejects invalid UUID, email, and birthDate", async () => {
    const res = await fetch(`http://localhost:${testPort}/accounts/not-a-uuid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "Updated" }),
    });
    assert.strictEqual(res.status, 400);

    const game = await createGame("Update Invalid Fields Game");
    const accountId = await createAccount(game.id);

    const emailRes = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ psnEmail: "not-an-email" }),
    });
    assert.strictEqual(emailRes.status, 400);

    const birthRes = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate: "1990-99-99" }),
    });
    assert.strictEqual(birthRes.status, 400);
  });

  it("returns 404 for missing or deleted Account", async () => {
    const res = await fetch(
      `http://localhost:${testPort}/accounts/550e8400-e29b-41d4-a716-446655440000`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineId: "Updated" }),
      },
    );
    assert.strictEqual(res.status, 404);

    const game = await createGame("Update Deleted Account Game");
    const accountId = await createAccount(game.id);
    await db.db
      .update(db.accountsTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.accountsTable.id, accountId));

    const deletedRes = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: "Updated" }),
    });
    assert.strictEqual(deletedRes.status, 404);
  });

  it("returns duplicate warning against another Account with zero writes", async () => {
    const game = await createGame("Update Duplicate Game");
    const firstRequest = createRequest();
    const first = await createAccountService({
      ...firstRequest,
      gameId: game.id,
    });
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const secondRequest = createRequest({
      psnEmail: `different-psn-${nextId()}@example.com`,
      onlineId: `DifferentOnlineId${nextId()}`,
      familyManagementEmail: `different-family-${nextId()}@example.com`,
    });
    const second = await createAccountService({
      ...secondRequest,
      gameId: game.id,
    });
    assert.strictEqual(second.kind, "created");
    if (second.kind !== "created") return;

    const before = await getRowCounts();
    const res = await fetch(updateUrl(second.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: firstRequest.psnEmail,
        onlineId: firstRequest.onlineId,
      }),
    });
    assert.strictEqual(res.status, 409);
    const data = (await res.json()) as {
      code: string;
      detail: { duplicateFields: string[] };
    };
    assert.strictEqual(data.code, "DUPLICATE_WARNING");
    assert.ok(data.detail.duplicateFields.includes("psnEmail"));
    assert.ok(data.detail.duplicateFields.includes("onlineId"));

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);
  });

  it("does not warn when updating to the same Account's own values", async () => {
    const game = await createGame("Update Self Match Game");
    const request = createRequest();
    const result = await createAccountService({ ...request, gameId: game.id });
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") return;

    const res = await fetch(updateUrl(result.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: (request.psnEmail as string).toUpperCase(),
        onlineId: (request.onlineId as string).toUpperCase(),
        familyManagementEmail: (request.familyManagementEmail as string).toUpperCase(),
      }),
    });
    assert.strictEqual(res.status, 200);
  });

  it("confirmed duplicate succeeds and allows the update", async () => {
    const game = await createGame("Update Confirmed Duplicate Game");
    const firstRequest = createRequest();
    const first = await createAccountService({
      ...firstRequest,
      gameId: game.id,
    });
    assert.strictEqual(first.kind, "created");
    if (first.kind !== "created") return;

    const secondRequest = createRequest({
      psnEmail: `confirmed-dup-psn-${nextId()}@example.com`,
      onlineId: `ConfirmedDupOnlineId${nextId()}`,
      familyManagementEmail: `confirmed-dup-family-${nextId()}@example.com`,
    });
    const second = await createAccountService({
      ...secondRequest,
      gameId: game.id,
    });
    assert.strictEqual(second.kind, "created");
    if (second.kind !== "created") return;

    const res = await fetch(updateUrl(second.account.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: firstRequest.psnEmail,
        confirmed: true,
      }),
    });
    assert.strictEqual(res.status, 200);

    const row = await loadAccountRow(second.account.id);
    const keys = loadAccountMasterKey();
    assert.strictEqual(
      decrypt(row.psnEmailEncrypted as string, keys.encryptionKey),
      firstRequest.psnEmail,
    );
  });

  it("fails closed and rolls back when encryption key is missing", async () => {
    const game = await createGame("Update Missing Key Game");
    const accountId = await createAccount(game.id);
    const before = await getRowCounts();

    const original = process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    delete process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    try {
      const res = await fetch(updateUrl(accountId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psnEmail: "new@example.com" }),
      });
      assert.strictEqual(res.status, 500);
      const after = await getRowCounts();
      assert.strictEqual(after.accounts, before.accounts);
      assert.strictEqual(after.capacities, before.capacities);
      assert.strictEqual(after.backupCodes, before.backupCodes);
    } finally {
      process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = original;
    }
  });

  it("fails closed and rolls back when encryption key is invalid", async () => {
    const game = await createGame("Update Invalid Key Game");
    const accountId = await createAccount(game.id);
    const before = await getRowCounts();
    const beforeRow = await loadAccountRow(accountId);
    const beforeCapacities = await getAccountCapacities(accountId);
    const beforeBackupCodes = await getBackupCodes(accountId);

    const original = process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    // "aGVsbG8=" is the Base64 encoding of "hello" (5 bytes) — wrong length.
    process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = "aGVsbG8=";
    try {
      const res = await fetch(updateUrl(accountId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          psnEmail: "invalid-key-psn@example.com",
          onlineId: `InvalidKeyOnlineId${nextId()}`,
          birthDate: "1992-02-02",
        }),
      });
      assert.strictEqual(res.status, 500);
      const data = (await res.json()) as { error: string; code: string };
      // The handler maps EncryptionError to the canonical Persian INTERNAL_ERROR
      // message while keeping the code machine-readable.
      assert.strictEqual(data.error, "خطای داخلی رخ داد");
      assert.strictEqual(data.code, "INTERNAL_ERROR");
      assertNoSecrets(JSON.stringify(data));
    } finally {
      process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY = original;
    }

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);

    const afterRow = await loadAccountRow(accountId);
    assert.strictEqual(afterRow.psnEmailEncrypted, beforeRow.psnEmailEncrypted);
    assert.strictEqual(afterRow.onlineId, beforeRow.onlineId);
    assert.strictEqual(afterRow.birthDate, beforeRow.birthDate);
    assert.strictEqual(afterRow.accountCode, beforeRow.accountCode);
    assert.strictEqual(afterRow.displayNumber, beforeRow.displayNumber);
    assert.strictEqual(afterRow.accountNumberPrefix, beforeRow.accountNumberPrefix);
    assert.strictEqual(afterRow.accountNumberSeq, beforeRow.accountNumberSeq);
    assert.strictEqual(afterRow.gameId, beforeRow.gameId);

    const afterCapacities = await getAccountCapacities(accountId);
    const afterBackupCodes = await getBackupCodes(accountId);
    assert.deepStrictEqual(
      afterCapacities.map((c) => c.id),
      beforeCapacities.map((c) => c.id),
    );
    assert.deepStrictEqual(
      afterBackupCodes.map((c) => c.id),
      beforeBackupCodes.map((c) => c.id),
    );
  });

  it("fails closed and rolls back all writes when the database update fails", async () => {
    const game = await createGame("Update DB Failure Game");
    const accountId = await createAccount(game.id);
    const before = await getRowCounts();
    const beforeRow = await loadAccountRow(accountId);
    const beforeCapacities = await getAccountCapacities(accountId);
    const beforeBackupCodes = await getBackupCodes(accountId);

    await installUpdateFailureTrigger();
    try {
      const res = await fetch(updateUrl(accountId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          psnEmail: "db-failure-psn@example.com",
          onlineId: `DbFailureOnlineId${nextId()}`,
          birthDate: "1993-03-03",
        }),
      });
      assert.strictEqual(res.status, 500);
      const data = (await res.json()) as { error: string; code: string };
      assert.strictEqual(data.error, "Internal server error");
      assert.strictEqual(data.code, "INTERNAL_ERROR");
      assertNoSecrets(JSON.stringify(data));
    } finally {
      await removeUpdateFailureTrigger();
    }

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);

    const afterRow = await loadAccountRow(accountId);
    assert.strictEqual(afterRow.psnEmailEncrypted, beforeRow.psnEmailEncrypted);
    assert.strictEqual(afterRow.onlineId, beforeRow.onlineId);
    assert.strictEqual(afterRow.birthDate, beforeRow.birthDate);
    assert.strictEqual(afterRow.accountCode, beforeRow.accountCode);
    assert.strictEqual(afterRow.displayNumber, beforeRow.displayNumber);
    assert.strictEqual(afterRow.accountNumberPrefix, beforeRow.accountNumberPrefix);
    assert.strictEqual(afterRow.accountNumberSeq, beforeRow.accountNumberSeq);
    assert.strictEqual(afterRow.gameId, beforeRow.gameId);

    const afterCapacities = await getAccountCapacities(accountId);
    const afterBackupCodes = await getBackupCodes(accountId);
    assert.deepStrictEqual(
      afterCapacities.map((c) => c.id),
      beforeCapacities.map((c) => c.id),
    );
    assert.deepStrictEqual(
      afterBackupCodes.map((c) => c.id),
      beforeBackupCodes.map((c) => c.id),
    );
  });

  it("keeps Backup Codes and Capacities unchanged", async () => {
    const game = await createGame("Update Backup Capacity Game");
    const accountId = await createAccount(game.id);
    const beforeCapacities = await getAccountCapacities(accountId);
    const beforeBackupCodes = await getBackupCodes(accountId);

    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: `UpdatedCapOnlineId${nextId()}` }),
    });
    assert.strictEqual(res.status, 200);

    const afterCapacities = await getAccountCapacities(accountId);
    const afterBackupCodes = await getBackupCodes(accountId);
    assert.deepStrictEqual(
      afterCapacities.map((c) => c.id),
      beforeCapacities.map((c) => c.id),
    );
    assert.deepStrictEqual(
      afterBackupCodes.map((c) => c.id),
      beforeBackupCodes.map((c) => c.id),
    );
  });

  it("keeps identifiers unchanged", async () => {
    const game = await createGame("Update Identifiers Game");
    const accountId = await createAccount(game.id);
    const before = await loadAccountRow(accountId);

    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineId: `UpdatedIdentifierOnlineId${nextId()}` }),
    });
    assert.strictEqual(res.status, 200);

    const after = await loadAccountRow(accountId);
    assert.strictEqual(after.accountCode, before.accountCode);
    assert.strictEqual(after.accountNumberPrefix, before.accountNumberPrefix);
    assert.strictEqual(after.accountNumberSeq, before.accountNumberSeq);
    assert.strictEqual(after.displayNumber, before.displayNumber);
    assert.strictEqual(after.gameId, before.gameId);
  });

  it("response contains no secrets", async () => {
    const game = await createGame("Update Private Data Game");
    const accountId = await createAccount(game.id);

    const res = await fetch(updateUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: `private-psn-${nextId()}@example.com`,
        psnPassword: "private-psn-password",
        emailPassword: "private-email-password",
        familyManagementEmail: `private-family-${nextId()}@example.com`,
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { account: Record<string, unknown> };
    assertNoSecrets(JSON.stringify(data));
    const body = JSON.stringify(data).toLowerCase();
    assert.ok(!body.includes("password"), "response leaks password");
    assert.ok(!body.includes("email"), "response leaks email");
    assert.ok(!body.includes("encrypted"), "response leaks encrypted value");
    assert.ok(!body.includes("ciphertext"), "response leaks ciphertext");
    assert.ok(!body.includes("hash"), "response leaks hash");
  });
});

function assertNoSecrets(body: string): void {
  const lower = body.toLowerCase();
  const patterns = [
    "encrypted",
    "ciphertext",
    "hash",
    "password",
    "backup",
    "secret",
    "psn_email",
    "email_password",
    "family_management",
  ];
  for (const pattern of patterns) {
    assert.ok(
      !lower.includes(pattern),
      `response body leaks a secret/encrypted/hash value (pattern: ${pattern})`,
    );
  }
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
