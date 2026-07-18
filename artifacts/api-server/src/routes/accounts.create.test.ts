import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import express, { type Express } from "express";
import net from "node:net";
import { eq, and } from "drizzle-orm";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { errorHandler } from "../middlewares/error-handler.ts";
import { createAccountHandler } from "./accounts.ts";
import { p } from "../lib/req-param.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

const TEST_MASTER_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function validRequest(overrides: Record<string, unknown> = {}) {
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
    // The production router uses `requireUuidParam` middleware; replicate it here.
    const gameId = p(req.params["gameId"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId)) {
      res.status(400).json({ error: "gameId must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    createAccountHandler(req, res, next);
  });
  app.use(errorHandler);
  return app;
}

describe("Create Account handler", () => {
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

  function testUrl(gameId: string): string {
    return `http://localhost:${testPort}/games/${gameId}/accounts`;
  }

  async function createGame(
    title: string,
    platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY",
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ) {
    const uniqueTitle = `${title} ${nextId()}`;
    const [game] = await db.db
      .insert(db.gamesTable)
      .values({
        title: uniqueTitle,
        titleNormalized: uniqueTitle.toLowerCase().trim(),
        platform,
        status,
      })
      .returning();
    return game;
  }

  async function countRows(table: unknown): Promise<number> {
    const { sql } = await import("drizzle-orm");
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

  it("public POST /games/:gameId/accounts returns 403 and writes nothing", async () => {
    const game = await createGame("Disabled Public Create Game", "PS5_ONLY");
    const before = await getRowCounts();

    const res = await fetch(`${publicBaseUrl}/games/${game.id}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string };
    assert.strictEqual(data.error, "Account operations are not authorized");

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);
  });

  it("valid request returns HTTP 201 and safe AccountDetailResponse", async () => {
    const game = await createGame("Create Account Valid Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: Record<string, unknown> };
    assert.ok(data.account, "response has account");
    assertValidUuid(data.account.id as string);
    assert.strictEqual(data.account.gameId, game.id);
    assert.strictEqual(typeof data.account.accountCode, "string");
    assert.strictEqual(typeof data.account.displayNumber, "string");
    assert.ok(data.account.status);
    assert.ok(Array.isArray(data.account.capacities));
    assert.ok((data.account.capacities as unknown[]).length > 0);
    assertNoSecrets(JSON.stringify(data));

    const body = JSON.stringify(data).toLowerCase();
    assert.ok(!body.includes("backup"), "response leaks backup codes");
    assert.ok(!body.includes("password"), "response leaks password");
    assert.ok(!body.includes("email"), "response leaks email");
    assert.ok(!body.includes("encrypted"), "response leaks encrypted value");
    assert.ok(!body.includes("ciphertext"), "response leaks ciphertext");
    assert.ok(!body.includes("hash"), "response leaks hash");
  });

  it("creates expected Capacity template and Backup Codes", async () => {
    const game = await createGame("Create Account Capacity Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: { id: string } };

    const capacities = await getAccountCapacities(data.account.id);
    assert.ok(capacities.length > 0, "capacities created");

    const backupCodes = await getBackupCodes(data.account.id);
    assert.strictEqual(backupCodes.length, 2, "two backup codes created");
  });

  it("missing Game returns HTTP 404", async () => {
    const res = await fetch(
      testUrl("550e8400-e29b-41d4-a716-446655440000"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequest()),
      },
    );
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { code: string };
    assert.strictEqual(data.code, "GAME_NOT_FOUND");
  });

  it("deleted Game returns HTTP 404", async () => {
    const game = await createGame("Deleted Create Game", "PS5_ONLY");
    await db.db
      .update(db.gamesTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.gamesTable.id, game.id));

    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { code: string };
    assert.strictEqual(data.code, "GAME_NOT_FOUND");
  });

  it("inactive Game returns HTTP 409", async () => {
    const game = await createGame("Inactive Create Game", "PS5_ONLY", "INACTIVE");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 409);
    const data = (await res.json()) as { code: string };
    assert.strictEqual(data.code, "GAME_INACTIVE");
  });

  it("invalid UUID returns HTTP 400", async () => {
    const res = await fetch(testUrl("not-a-uuid"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest()),
    });
    assert.strictEqual(res.status, 400);
  });

  it("invalid Email returns HTTP 400", async () => {
    const game = await createGame("Invalid Email Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ psnEmail: "not-an-email" })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("invalid birthDate returns HTTP 400", async () => {
    const game = await createGame("Invalid BirthDate Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ birthDate: "1990-99-99" })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("empty Backup Code array returns HTTP 400", async () => {
    const game = await createGame("Empty Backup Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ backupCodes: [] })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("whitespace-only Backup Code returns HTTP 400", async () => {
    const game = await createGame("Whitespace Backup Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ backupCodes: ["   "] })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("unexpected body fields are rejected", async () => {
    const game = await createGame("Unexpected Field Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ unexpectedField: "value" })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("body gameId cannot override path gameId", async () => {
    const game = await createGame("Path Wins Game", "PS5_ONLY");
    const otherGame = await createGame("Other Game Path Wins", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ gameId: otherGame.id })),
    });
    assert.strictEqual(res.status, 201);
    const data = (await res.json()) as { account: { gameId: string } };
    assert.strictEqual(data.account.gameId, game.id);
  });

  it("statusOverride is rejected", async () => {
    const game = await createGame("Status Override Reject Game", "PS5_ONLY");
    const res = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validRequest({ statusOverride: "SOLD" })),
    });
    assert.strictEqual(res.status, 400);
  });

  it("unconfirmed duplicate returns HTTP 409 with DUPLICATE_WARNING", async () => {
    const game = await createGame("Duplicate Warning Game", "PS5_ONLY");
    const request = validRequest();

    const first = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.strictEqual(first.status, 201);

    const before = await getRowCounts();
    const second = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.strictEqual(second.status, 409);
    const data = (await second.json()) as {
      code: string;
      detail: { duplicateFields: string[] };
    };
    assert.strictEqual(data.code, "DUPLICATE_WARNING");
    assert.ok(Array.isArray(data.detail.duplicateFields));
    assert.ok(data.detail.duplicateFields.length > 0);
    for (const field of data.detail.duplicateFields) {
      assert.ok(["psnEmail", "familyManagementEmail", "onlineId"].includes(field));
    }

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts, "duplicate response performs no writes");
  });

  it("confirmed duplicate request returns HTTP 201", async () => {
    const game = await createGame("Duplicate Confirmed Game", "PS5_ONLY");
    const request = validRequest();

    const first = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.strictEqual(first.status, 201);

    const second = await fetch(testUrl(game.id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, confirmed: true }),
    });
    assert.strictEqual(second.status, 201);
    const data = (await second.json()) as { account: { id: string } };
    assertValidUuid(data.account.id);
  });

  it("missing encryption key fails closed and performs no writes", async () => {
    const original = process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    delete process.env.PLAYSYNCER_ACCOUNT_MASTER_KEY;
    try {
      const game = await createGame("Missing Key Game", "PS5_ONLY");
      const before = await getRowCounts();
      const res = await fetch(testUrl(game.id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRequest()),
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
});

function assertValidUuid(value: string): void {
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
    "expected a valid UUID",
  );
}

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
