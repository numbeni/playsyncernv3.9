import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";

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

const ACCOUNT_STATUS_VALUES = [
  "AVAILABLE",
  "PARTIALLY_SOLD",
  "SOLD",
  "INACTIVE",
];

const CAPACITY_KIND_VALUES = ["Z2_PS5", "Z2_PS4", "Z3_SHARED_PS5_PS4"];

const SAFE_ACCOUNT_KEYS = [
  "id",
  "gameId",
  "accountCode",
  "accountNumberPrefix",
  "accountNumberSeq",
  "displayNumber",
  "onlineId",
  "birthDate",
  "status",
  "createdAt",
  "updatedAt",
];

const SAFE_CAPACITY_KEYS = [
  "id",
  "accountId",
  "capacityKind",
  "instanceNo",
  "displayLabel",
  "isFinished",
  "finishedAt",
];

const SECRET_PATTERNS = [
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

type AccountListItem = {
  id: string;
  gameId: string;
  accountCode: string;
  accountNumberPrefix: string;
  accountNumberSeq: number;
  displayNumber: string;
  onlineId: string | null;
  birthDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AccountCapacity = {
  id: string;
  accountId: string;
  capacityKind: string;
  instanceNo: number;
  displayLabel: string;
  isFinished: boolean;
  finishedAt: string | null;
};

type AccountDetail = AccountListItem & {
  capacities: AccountCapacity[];
};

function assertValidUuid(value: unknown): string {
  assert.strictEqual(typeof value, "string");
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value as string,
    ),
    "expected a valid UUID",
  );
  return value as string;
}

function assertAccountListItem(account: unknown): AccountListItem {
  assert.ok(account && typeof account === "object", "account is an object");
  const a = account as Record<string, unknown>;
  assert.deepStrictEqual(Object.keys(a).sort(), SAFE_ACCOUNT_KEYS.sort());
  assertValidUuid(a.id);
  assertValidUuid(a.gameId);
  assert.strictEqual(typeof a.accountCode, "string");
  assert.strictEqual(typeof a.accountNumberPrefix, "string");
  assert.strictEqual(typeof a.accountNumberSeq, "number");
  assert.strictEqual(typeof a.displayNumber, "string");
  assert.ok(a.onlineId === null || typeof a.onlineId === "string");
  assert.ok(a.birthDate === null || typeof a.birthDate === "string");
  assert.ok(ACCOUNT_STATUS_VALUES.includes(a.status as string));
  assert.strictEqual(typeof a.createdAt, "string");
  assert.strictEqual(typeof a.updatedAt, "string");
  return a as unknown as AccountListItem;
}

function assertAccountCapacity(capacity: unknown): AccountCapacity {
  assert.ok(capacity && typeof capacity === "object", "capacity is an object");
  const c = capacity as Record<string, unknown>;
  assert.deepStrictEqual(Object.keys(c).sort(), SAFE_CAPACITY_KEYS.sort());
  assertValidUuid(c.id);
  assertValidUuid(c.accountId);
  assert.ok(CAPACITY_KIND_VALUES.includes(c.capacityKind as string));
  assert.strictEqual(typeof c.instanceNo, "number");
  assert.strictEqual(typeof c.displayLabel, "string");
  assert.strictEqual(typeof c.isFinished, "boolean");
  assert.ok(c.finishedAt === null || typeof c.finishedAt === "string");
  return c as unknown as AccountCapacity;
}

function assertNoSecrets(body: string) {
  const lower = body.toLowerCase();
  for (const pattern of SECRET_PATTERNS) {
    assert.ok(
      !lower.includes(pattern),
      `response body leaks a secret/encrypted/hash value (pattern: ${pattern})`,
    );
  }
}

function parseListResponse(data: unknown): { accounts: AccountListItem[] } {
  assert.ok(data && typeof data === "object", "response is an object");
  const d = data as { accounts: unknown };
  assert.ok(Array.isArray(d.accounts), "accounts is an array");
  const accounts = d.accounts.map(assertAccountListItem);
  return { accounts };
}

function parseDetailResponse(data: unknown): { account: AccountDetail } {
  assert.ok(data && typeof data === "object", "response is an object");
  const d = data as { account: Record<string, unknown> };
  const { capacities, ...listItem } = d.account;
  const account = assertAccountListItem(listItem);
  assert.ok(Array.isArray(capacities), "account has capacities array");
  const capacityItems = capacities.map((c) => assertAccountCapacity(c));
  return { account: { ...account, capacities: capacityItems } };
}

function parseCapacitiesResponse(data: unknown): {
  capacities: AccountCapacity[];
  status: string;
} {
  assert.ok(data && typeof data === "object", "response is an object");
  const d = data as { capacities: unknown; status: unknown };
  assert.ok(Array.isArray(d.capacities), "capacities is an array");
  const capacities = d.capacities.map(assertAccountCapacity);
  assert.ok(ACCOUNT_STATUS_VALUES.includes(d.status as string));
  return { capacities, status: d.status as string };
}

describe("Read-only Account API", () => {
  let baseUrl: string;
  let databaseUrl: string;
  let stopServer: () => Promise<void>;
  let stopPg: () => Promise<void>;
  let db: typeof import("@workspace/db");
  let accountService: typeof import("../services/account/index.ts");

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
    baseUrl = serverUrl;
    stopServer = stopServerFn;

    db = await import("@workspace/db");
    accountService = await import("../services/account/index.ts");
  });

  after(async () => {
    await stopServer();
    if (db) {
      await db.pool.end();
    }
    await stopPg();
  });

  async function createGame(
    title: string,
    platform: "PS5_ONLY" | "PS4_AND_PS5" | "PS4_ONLY",
  ) {
    const [game] = await db.db
      .insert(db.gamesTable)
      .values({
        title,
        titleNormalized: title.toLowerCase().trim(),
        platform,
        status: "ACTIVE",
      })
      .returning();
    return game;
  }

  async function createAccount(gameId: string) {
    const result = await accountService.createAccount({
      gameId,
      psnEmail: `test-${nextId()}@example.com`,
      psnPassword: "psn-secret",
      emailPassword: "email-secret",
      onlineId: `TestOnlineId${nextId()}`,
      birthDate: "1990-01-01",
      familyManagementEmail: `family-${nextId()}@example.com`,
      backupCodes: ["code1", "code2"],
      confirmed: true,
    });
    if (result.kind !== "created") {
      throw new Error("Expected account to be created, got duplicate warning");
    }
    return result.account;
  }

  async function seedOrder() {
    const [order] = await db.db
      .insert(db.ordersTable)
      .values({
        orderCode: `ORD-${nextId()}`,
        source: "manual",
        status: "pending_assignment",
      })
      .returning();
    return order;
  }

  async function seedCapacityCustomer(
    capacityId: string,
    orderId: string,
    status: "active" | "removed" | "cancelled",
  ) {
    await db.db.insert(db.capacityCustomersTable).values({
      capacityId,
      orderId,
      customerPhoneEncrypted: "encrypted-phone",
      status,
    });
  }

  async function finishCapacity(capacityId: string) {
    await db.db
      .update(db.accountCapacitiesTable)
      .set({ isFinished: true, finishedAt: new Date() })
      .where(eq(db.accountCapacitiesTable.id, capacityId));
  }

  async function softDeleteAccount(accountId: string) {
    await db.db
      .update(db.accountsTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.accountsTable.id, accountId));
  }

  async function setStatusOverride(
    accountId: string,
    status: "SOLD" | "INACTIVE",
  ) {
    await db.db
      .update(db.accountsTable)
      .set({ statusOverride: status })
      .where(eq(db.accountsTable.id, accountId));
  }

  async function countCapacityCustomers(): Promise<number> {
    const [row] = (await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.capacityCustomersTable)) as { count: number }[];
    return row.count;
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

  it("GET /games/:gameId/accounts returns an empty list for a game with no accounts", async () => {
    const game = await createGame("Empty Accounts Game", "PS5_ONLY");
    const res = await fetch(`${baseUrl}/games/${game.id}/accounts`);
    assert.strictEqual(res.status, 200);
    const data = parseListResponse(await res.json());
    assert.deepStrictEqual(data.accounts, []);
  });

  it("GET /games/:gameId/accounts returns multiple accounts in stable order", async () => {
    const game = await createGame("Ordered Accounts Game", "PS5_ONLY");
    const a1 = await createAccount(game.id);
    const a2 = await createAccount(game.id);
    const a3 = await createAccount(game.id);

    const res = await fetch(`${baseUrl}/games/${game.id}/accounts`);
    assert.strictEqual(res.status, 200);
    const data = parseListResponse(await res.json());
    assert.strictEqual(data.accounts.length, 3);

    const seqs = data.accounts.map((a) => a.accountNumberSeq);
    const sortedSeqs = [...seqs].sort((a, b) => a - b);
    assert.deepStrictEqual(seqs, sortedSeqs);

    const ids = data.accounts.map((a) => a.id);
    assert.ok(ids.includes(a1.id));
    assert.ok(ids.includes(a2.id));
    assert.ok(ids.includes(a3.id));
  });

  it("GET /games/:gameId/accounts excludes deleted accounts", async () => {
    const game = await createGame("Deleted Account Game", "PS5_ONLY");
    const active = await createAccount(game.id);
    const deleted = await createAccount(game.id);
    await softDeleteAccount(deleted.id);

    const res = await fetch(`${baseUrl}/games/${game.id}/accounts`);
    assert.strictEqual(res.status, 200);
    const data = parseListResponse(await res.json());
    assert.strictEqual(data.accounts.length, 1);
    assert.strictEqual(data.accounts[0].id, active.id);
  });

  it("GET /games/:gameId/accounts returns GAME_NOT_FOUND for missing or deleted games", async () => {
    const res = await fetch(
      `${baseUrl}/games/550e8400-e29b-41d4-a716-446655440000/accounts`,
    );
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "بازی یافت نشد");
    assert.strictEqual(data.code, "GAME_NOT_FOUND");
  });

  it("GET /accounts/:id returns safe Account detail with capacities", async () => {
    const game = await createGame("Account Detail Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    assert.strictEqual(res.status, 200);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.id, account.id);
    assert.strictEqual(data.account.gameId, game.id);
    assert.strictEqual(data.account.capacities.length, capacities.length);
    for (const capacity of data.account.capacities) {
      assertAccountCapacity(capacity);
    }
    assertNoSecrets(JSON.stringify(data));
  });

  it("GET /accounts/:id returns ACCOUNT_NOT_FOUND for missing or deleted accounts", async () => {
    const res = await fetch(
      `${baseUrl}/accounts/550e8400-e29b-41d4-a716-446655440000`,
    );
    assert.strictEqual(res.status, 404);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "اکانت یافت نشد");
    assert.strictEqual(data.code, "ACCOUNT_NOT_FOUND");

    const game = await createGame("Deleted Account Detail Game", "PS5_ONLY");
    const deleted = await createAccount(game.id);
    await softDeleteAccount(deleted.id);
    const res2 = await fetch(`${baseUrl}/accounts/${deleted.id}`);
    assert.strictEqual(res2.status, 404);
  });

  it("GET /accounts/:id/capacities returns safe capacities and derived status", async () => {
    const game = await createGame("Capacity Endpoint Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);

    const res = await fetch(`${baseUrl}/accounts/${account.id}/capacities`);
    assert.strictEqual(res.status, 200);
    const data = parseCapacitiesResponse(await res.json());
    assert.strictEqual(data.capacities.length, capacities.length);
    for (const capacity of data.capacities) {
      assertAccountCapacity(capacity);
    }
    assert.ok(ACCOUNT_STATUS_VALUES.includes(data.status));
    assertNoSecrets(JSON.stringify(data));
  });

  it("statusOverride INACTIVE returns INACTIVE", async () => {
    const game = await createGame("Inactive Override Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    await setStatusOverride(account.id, "INACTIVE");

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "INACTIVE");
  });

  it("statusOverride SOLD returns SOLD", async () => {
    const game = await createGame("Sold Override Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    await setStatusOverride(account.id, "SOLD");

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "SOLD");
  });

  it("all capacities finished returns SOLD", async () => {
    const game = await createGame("All Finished Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);
    for (const c of capacities) {
      await finishCapacity(c.id);
    }

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "SOLD");
  });

  it("no finished capacity and no customer relation returns AVAILABLE", async () => {
    const game = await createGame("Available Game", "PS5_ONLY");
    const account = await createAccount(game.id);

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "AVAILABLE");
  });

  it("one active capacity_customers relation returns PARTIALLY_SOLD", async () => {
    const game = await createGame("Partially Sold Customer Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);
    const order = await seedOrder();
    await seedCapacityCustomer(capacities[0].id, order.id, "active");

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "PARTIALLY_SOLD");
  });

  it("one finished capacity while others remain unfinished returns PARTIALLY_SOLD", async () => {
    const game = await createGame("Partially Sold Finished Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);
    assert.ok(
      capacities.length >= 2,
      "PS5_ONLY account has at least two capacities",
    );
    await finishCapacity(capacities[0].id);

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "PARTIALLY_SOLD");
  });

  it("historical/deleted capacity_customers relations do not affect status", async () => {
    const game = await createGame("Historical Customer Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);
    const order = await seedOrder();
    await seedCapacityCustomer(capacities[0].id, order.id, "removed");
    await db.db
      .update(db.capacityCustomersTable)
      .set({ deletedAt: new Date() })
      .where(eq(db.capacityCustomersTable.capacityId, capacities[0].id));

    const res = await fetch(`${baseUrl}/accounts/${account.id}`);
    const data = parseDetailResponse(await res.json());
    assert.strictEqual(data.account.status, "AVAILABLE");
  });

  it("capacity_customers row counts remain unchanged after read-only requests", async () => {
    const game = await createGame("Read-Only Customer Game", "PS5_ONLY");
    const account = await createAccount(game.id);
    const capacities = await getAccountCapacities(account.id);
    const order = await seedOrder();
    await seedCapacityCustomer(capacities[0].id, order.id, "active");
    const before = await countCapacityCustomers();

    await fetch(`${baseUrl}/games/${game.id}/accounts`);
    await fetch(`${baseUrl}/accounts/${account.id}`);
    await fetch(`${baseUrl}/accounts/${account.id}/capacities`);

    const after = await countCapacityCustomers();
    assert.strictEqual(after, before);
  });

  it("Account mutation routes remain disabled and do not write data", async () => {
    const game = await createGame("Disabled Mutation Game", "PS5_ONLY");
    const [before] = await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.accountsTable);

    const postRes = await fetch(`${baseUrl}/games/${game.id}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        psnEmail: "test@example.com",
        psnPassword: "secret",
        emailPassword: "secret",
      }),
    });
    assert.strictEqual(postRes.status, 403);

    const [afterPost] = await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.accountsTable);
    assert.strictEqual(afterPost.count, before.count);

    const patchRes = await fetch(`${baseUrl}/accounts/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SOLD" }),
    });
    assert.strictEqual(patchRes.status, 403);

    const deleteRes = await fetch(`${baseUrl}/accounts/${game.id}`, {
      method: "DELETE",
    });
    assert.strictEqual(deleteRes.status, 403);

    const [afterAll] = await db.db
      .select({ count: sql`count(*)::int` })
      .from(db.accountsTable);
    assert.strictEqual(afterAll.count, before.count);
  });
});
