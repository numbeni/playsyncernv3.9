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
import { setAccountStatusOverrideHandler } from "./accounts.ts";
import { p } from "../lib/req-param.ts";
import { createAccount as createAccountService } from "../services/account/index.ts";

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
  app.patch("/accounts/:id/status-override", (req, res, next) => {
    const id = p(req.params["id"]);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: "id must be a valid UUID", code: "VALIDATION_ERROR" });
      return;
    }
    setAccountStatusOverrideHandler(req, res, next);
  });
  app.use(errorHandler);
  return app;
}

describe("Set Account Status Override handler", { concurrency: 1 }, () => {
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

  function statusOverrideUrl(accountId: string): string {
    return `http://localhost:${testPort}/accounts/${accountId}/status-override`;
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
    const result = await createAccountService({
      ...createRequest(),
      gameId,
    });
    assert.strictEqual(result.kind, "created");
    if (result.kind !== "created") throw new Error("failed to create account");
    return result.account.id;
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

  it("public PATCH /accounts/:id/status-override returns 403 and writes nothing", async () => {
    const game = await createGame("Disabled Public Status Override Game");
    const accountId = await createAccount(game.id);
    const before = await getRowCounts();

    const res = await fetch(
      `${publicBaseUrl}/accounts/${accountId}/status-override`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusOverride: "SOLD" }),
      },
    );
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");

    const after = await getRowCounts();
    assert.strictEqual(after.accounts, before.accounts);
    assert.strictEqual(after.capacities, before.capacities);
    assert.strictEqual(after.backupCodes, before.backupCodes);
  });

  it("SOLD override succeeds and returns the recalculated status", async () => {
    const game = await createGame("Status Override SOLD Game");
    const accountId = await createAccount(game.id);

    const res = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { account: { status: string } };
    assert.strictEqual(data.account.status, "SOLD");
  });

  it("INACTIVE override succeeds and returns the recalculated status", async () => {
    const game = await createGame("Status Override INACTIVE Game");
    const accountId = await createAccount(game.id);

    const res = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "INACTIVE" }),
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as { account: { status: string } };
    assert.strictEqual(data.account.status, "INACTIVE");
  });

  it("null clears the override and restores the derived status", async () => {
    const game = await createGame("Status Override Clear Game");
    const accountId = await createAccount(game.id);

    const soldRes = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(soldRes.status, 200);

    const clearRes = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: null }),
    });
    assert.strictEqual(clearRes.status, 200);
    const data = (await clearRes.json()) as { account: { status: string } };
    assert.strictEqual(data.account.status, "AVAILABLE");
  });

  it("AVAILABLE and PARTIALLY_SOLD are rejected", async () => {
    const game = await createGame("Status Override Reject Game");
    const accountId = await createAccount(game.id);

    for (const statusOverride of ["AVAILABLE", "PARTIALLY_SOLD"]) {
      const res = await fetch(statusOverrideUrl(accountId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusOverride }),
      });
      assert.strictEqual(
        res.status,
        400,
        `expected 400 for statusOverride=${statusOverride}`,
      );
    }
  });

  it("rejects unknown fields", async () => {
    const game = await createGame("Status Override Unknown Field Game");
    const accountId = await createAccount(game.id);

    const res = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD", unknownField: "value" }),
    });
    assert.strictEqual(res.status, 400);
  });

  it("returns 404 for missing or deleted Account", async () => {
    const res = await fetch(
      `http://localhost:${testPort}/accounts/550e8400-e29b-41d4-a716-446655440000/status-override`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusOverride: "SOLD" }),
      },
    );
    assert.strictEqual(res.status, 404);

    const game = await createGame("Status Override Deleted Account Game");
    const accountId = await createAccount(game.id);
    await db.db
      .update(db.accountsTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.accountsTable.id, accountId));

    const deletedRes = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(deletedRes.status, 404);
  });

  it("Capacities remain unchanged", async () => {
    const game = await createGame("Status Override Capacities Game");
    const accountId = await createAccount(game.id);
    const beforeCapacities = await getAccountCapacities(accountId);

    const res = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(res.status, 200);

    const afterCapacities = await getAccountCapacities(accountId);
    assert.deepStrictEqual(
      afterCapacities.map((c) => ({
        id: c.id,
        isFinished: c.isFinished,
      })),
      beforeCapacities.map((c) => ({ id: c.id, isFinished: c.isFinished })),
    );
  });

  it("derived status is correct after clearing", async () => {
    const game = await createGame("Status Override Derived Game");
    const accountId = await createAccount(game.id);

    const soldRes = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(soldRes.status, 200);
    const soldData = (await soldRes.json()) as { account: { status: string } };
    assert.strictEqual(soldData.account.status, "SOLD");

    const clearRes = await fetch(statusOverrideUrl(accountId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: null }),
    });
    assert.strictEqual(clearRes.status, 200);
    const clearData = (await clearRes.json()) as { account: { status: string } };
    assert.strictEqual(clearData.account.status, "AVAILABLE");
  });
});

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
