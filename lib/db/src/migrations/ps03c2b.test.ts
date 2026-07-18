import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required for migration tests");
}

const ACTIVE_DB_NAME = new URL(DATABASE_URL).pathname.slice(1);
const TEST_DB_NAME = process.env.PS03C2B_TEST_DATABASE_URL
  ? new URL(process.env.PS03C2B_TEST_DATABASE_URL).pathname.slice(1)
  : `ps03c2b_test_${crypto.randomUUID().replace(/-/g, "")}`;
const TEST_DATABASE_URL =
  process.env.PS03C2B_TEST_DATABASE_URL ??
  DATABASE_URL.replace(/\/[^/]*$/, `/${TEST_DB_NAME}`);

const TEST_DB_PATTERN = /^ps03c2b_test_[a-f0-9]{32}$/;
if (!TEST_DB_PATTERN.test(TEST_DB_NAME)) {
  throw new Error(
    `Generated test DB name "${TEST_DB_NAME}" does not match PS03C2B test naming pattern`,
  );
}
if (TEST_DB_NAME === ACTIVE_DB_NAME) {
  throw new Error(
    `Refusing to run tests against the active workspace database "${ACTIVE_DB_NAME}"`,
  );
}

function databaseUrlForName(baseUrl: string, dbName: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

function deriveManagementUrl(testUrl: string): string {
  return databaseUrlForName(testUrl, "postgres");
}

const MANAGEMENT_DATABASE_URL = process.env.PS03C2B_TEST_DATABASE_URL
  ? deriveManagementUrl(process.env.PS03C2B_TEST_DATABASE_URL)
  : DATABASE_URL;

const DB_DIR = path.resolve(fileURLToPath(import.meta.url), "../../..");

let managementPool: pg.Pool | undefined;
let testPool: pg.Pool | undefined;
let testGameCounter = 0;

async function nextGame(client: pg.PoolClient) {
  testGameCounter += 1;
  const title = `Test Game ${testGameCounter} ${Date.now()}`;
  const titleNormalized = `test-game-${testGameCounter}-${Date.now()}`;
  const result = await client.query(
    `INSERT INTO games (title, title_normalized, platform)
     VALUES ($1, $2, 'PS5_ONLY')
     RETURNING id`,
    [title, titleNormalized],
  );
  return result.rows[0].id as string;
}

async function insertAccount(
  client: pg.PoolClient,
  gameId: string,
  overrides: Record<string, unknown> = {},
) {
  testGameCounter += 1;
  const seq = testGameCounter;
  const prefix = (overrides.account_number_prefix as string) ?? "TST";
  const displayNumber =
    (overrides.display_number as string) ??
    `${prefix}-${String(seq).padStart(3, "0")}`;
  const defaults: Record<string, unknown> = {
    game_id: gameId,
    account_code: `ACC-${String(seq).padStart(6, "0")}`,
    account_number_prefix: prefix,
    account_number_seq: seq,
    display_number: displayNumber,
  };
  const merged = { ...defaults, ...overrides };
  const entries = Object.entries(merged);
  const columns = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const result = await client.query(
    `INSERT INTO accounts (${columns.join(", ")})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    values,
  );
  return result.rows[0].id as string;
}

async function insertCapacity(
  client: pg.PoolClient,
  accountId: string,
  overrides: Record<string, unknown> = {},
) {
  const instanceNo = (overrides.instance_no as number) ?? 1;
  const displayLabel =
    (overrides.display_label as string) ?? `Z2 PS5 #${instanceNo}`;
  const defaults: Record<string, unknown> = {
    account_id: accountId,
    capacity_kind_v2: "Z2_PS5",
    instance_no: instanceNo,
    display_label: displayLabel,
    is_finished: false,
    finished_at: null,
  };
  const merged = { ...defaults, ...overrides };
  const entries = Object.entries(merged);
  const columns = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const result = await client.query(
    `INSERT INTO account_capacities (${columns.join(", ")})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    values,
  );
  return result.rows[0].id as string;
}

async function insertBackupCode(
  client: pg.PoolClient,
  accountId: string,
  overrides: Record<string, unknown> = {},
) {
  const defaults: Record<string, unknown> = {
    account_id: accountId,
    code_ciphertext: `ciphertext-${testGameCounter}`,
  };
  const merged = { ...defaults, ...overrides };
  const entries = Object.entries(merged);
  const columns = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const result = await client.query(
    `INSERT INTO account_backup_codes (${columns.join(", ")})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
     RETURNING id`,
    values,
  );
  return result.rows[0].id as string;
}

async function listColumns(client: pg.PoolClient, tableName: string) {
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName],
  );
  return res.rows.map((r) => r.column_name as string);
}

async function listEnumValues(client: pg.PoolClient, enumName: string) {
  const res = await client.query(
    `SELECT e.enumlabel FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`,
    [enumName],
  );
  return res.rows.map((r) => r.enumlabel as string);
}

async function enumExists(client: pg.PoolClient, enumName: string) {
  const res = await client.query(
    `SELECT 1 FROM pg_type t
     WHERE t.typname = $1 AND t.typnamespace = 'public'::regnamespace`,
    [enumName],
  );
  return res.rows.length > 0;
}

async function indexDefinition(client: pg.PoolClient, indexName: string) {
  const res = await client.query(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [indexName],
  );
  return res.rows[0]?.indexdef as string | undefined;
}

before(async () => {
  managementPool = new Pool({ connectionString: MANAGEMENT_DATABASE_URL });
  await managementPool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME};`);
  await managementPool.query(`CREATE DATABASE ${TEST_DB_NAME};`);

  // Run all migrations, including the new 0003, on a disposable database only.
  execSync("pnpm run db:migrate", {
    cwd: DB_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  testPool = new Pool({ connectionString: TEST_DATABASE_URL });
});

after(async () => {
  await testPool?.end();
  if (TEST_DB_PATTERN.test(TEST_DB_NAME)) {
    await managementPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME};`);
  }
  await managementPool?.end();
});

describe("PS-03C2B retirement migration", { concurrency: false }, () => {
  test("disposable database is not the active workspace database", async () => {
    const client = await testPool!.connect();
    try {
      const res = await client.query("SELECT current_database()");
      assert.notEqual(res.rows[0].current_database, ACTIVE_DB_NAME);
      assert.equal(res.rows[0].current_database, TEST_DB_NAME);
    } finally {
      client.release();
    }
  });

  test("migration history contains all four approved migrations", async () => {
    const client = await testPool!.connect();
    try {
      const res = await client.query(
        `SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`,
      );
      assert.equal(res.rows.length, 4);
      assert.equal(Number(res.rows[0].id), 1);
      assert.equal(
        res.rows[0].hash,
        "a43ab14cacf73a107d5c115c2025dc56de3537efe4d409ca65c79e48a8aa07ca",
      );
      assert.equal(Number(res.rows[1].id), 2);
      assert.equal(
        res.rows[1].hash,
        "c09f28b3895fa3ee2732f42438d55e4ad136a02d485386bfe001c4530d14c4c2",
      );
      assert.equal(Number(res.rows[2].id), 3);
      assert.equal(
        res.rows[2].hash,
        "99f124e4bb93a8763d485813a65355c44e4a0aa4a1a6b4eb8ddffc47e3059b6a",
      );
      assert.equal(Number(res.rows[3].id), 4);
      assert.equal(
        res.rows[3].hash,
        "2fa056d4a7e45c70339aa09e7316a1917e1cc4a909c2eeb6009b17edd166194a",
      );
    } finally {
      client.release();
    }
  });

  test("legacy Account columns and enums are removed", async () => {
    const client = await testPool!.connect();
    try {
      const cols = await listColumns(client, "accounts");
      assert.ok(!cols.includes("email"));
      assert.ok(!cols.includes("email_normalized"));
      assert.ok(!cols.includes("playstation_password_encrypted"));
      assert.ok(!cols.includes("email_password_encrypted"));
      assert.ok(!cols.includes("family_management_email_encrypted"));
      assert.ok(!cols.includes("status"));

      assert.ok(!(await enumExists(client, "account_status")));
    } finally {
      client.release();
    }
  });

  test("legacy Backup Code columns and enums are removed", async () => {
    const client = await testPool!.connect();
    try {
      const cols = await listColumns(client, "account_backup_codes");
      assert.ok(!cols.includes("code_encrypted"));
      assert.ok(!cols.includes("code_encrypted_v2"));
      assert.ok(!cols.includes("code_lookup_hash_v2"));
      assert.ok(!cols.includes("status"));
      assert.ok(!cols.includes("used_at"));

      assert.ok(!(await enumExists(client, "backup_code_status")));
    } finally {
      client.release();
    }
  });

  test("legacy Capacity column and enum are removed", async () => {
    const client = await testPool!.connect();
    try {
      const cols = await listColumns(client, "account_capacities");
      assert.ok(!cols.includes("capacity_kind"));
      assert.ok(!(await enumExists(client, "capacity_kind")));
    } finally {
      client.release();
    }
  });

  test("Backup Code has exactly four columns", async () => {
    const client = await testPool!.connect();
    try {
      const cols = await listColumns(client, "account_backup_codes");
      assert.deepStrictEqual(cols.sort(), [
        "account_id",
        "code_ciphertext",
        "created_at",
        "id",
      ]);
    } finally {
      client.release();
    }
  });

  test("capacity_kind_v2 is NOT NULL", async () => {
    const client = await testPool!.connect();
    try {
      const res = await client.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'account_capacities' AND column_name = 'capacity_kind_v2'`,
      );
      assert.equal(res.rows[0].is_nullable, "NO");
    } finally {
      client.release();
    }
  });

  test("Capacity unique index is unconditional", async () => {
    const client = await testPool!.connect();
    try {
      const def = await indexDefinition(client, "account_capacities_v2_unique_slot");
      assert.ok(def?.includes("account_id"));
      assert.ok(def?.includes("capacity_kind_v2"));
      assert.ok(def?.includes("instance_no"));
      assert.ok(!def?.toLowerCase().includes("where"));
    } finally {
      client.release();
    }
  });

  test("preserved Account objects remain", async () => {
    const client = await testPool!.connect();
    try {
      const cols = await listColumns(client, "accounts");
      for (const col of [
        "status_override",
        "psn_email_encrypted",
        "psn_email_lookup_hash",
        "psn_password_encrypted",
        "psn_password_lookup_hash",
        "email_password_encrypted_v2",
        "email_password_lookup_hash",
        "family_management_email_encrypted_v2",
        "family_management_email_lookup_hash",
      ]) {
        assert.ok(cols.includes(col), `missing preserved column ${col}`);
      }

      const enums = await listEnumValues(client, "account_status_override");
      assert.deepStrictEqual(enums, ["SOLD", "INACTIVE"]);

      const seq = await client.query(
        `SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'account_code_seq'`,
      );
      assert.equal(seq.rows.length, 1);

      const trigger = await client.query(
        `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'accounts_protect_identifiers_trigger'`,
      );
      assert.equal(trigger.rows.length, 1);
    } finally {
      client.release();
    }
  });

  test("preserved game_account_sequences and identifier constraints remain", async () => {
    const client = await testPool!.connect();
    try {
      const seq = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_account_sequences'`,
      );
      assert.equal(seq.rows.length, 1);

      const constraints = await client.query(
        `SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace`,
      );
      const names = constraints.rows.map((r) => r.conname as string);
      assert.ok(names.includes("accounts_account_code_unique"));
      assert.ok(names.includes("accounts_game_seq_unique"));
      assert.ok(names.includes("accounts_game_display_unique"));
      assert.ok(names.includes("account_capacities_finished_consistency"));
    } finally {
      client.release();
    }
  });

  test("migration 0003 does not affect games or capacity_customers", async () => {
    const client = await testPool!.connect();
    try {
      const gamesCols = await listColumns(client, "games");
      assert.deepStrictEqual(gamesCols.sort(), [
        "cover_url",
        "created_at",
        "deleted_at",
        "id",
        "platform",
        "status",
        "title",
        "title_normalized",
        "updated_at",
      ]);

      const customersCols = await listColumns(client, "capacity_customers");
      assert.deepStrictEqual(customersCols.sort(), [
        "capacity_id",
        "created_at",
        "customer_phone_blind_index",
        "customer_phone_encrypted",
        "deleted_at",
        "id",
        "note",
        "order_id",
        "status",
        "updated_at",
      ]);
    } finally {
      client.release();
    }
  });

  test("final schema accepts valid Account, Capacity, and Backup Code rows", async () => {
    const client = await testPool!.connect();
    try {
      const gameId = await nextGame(client);
      const accountId = await insertAccount(client, gameId, {
        status_override: "SOLD",
      });
      const capacityId = await insertCapacity(client, accountId, {
        capacity_kind_v2: "Z3_SHARED_PS5_PS4",
      });
      const backupCodeId = await insertBackupCode(client, accountId);

      const accountRes = await client.query(
        `SELECT status_override FROM accounts WHERE id = $1`,
        [accountId],
      );
      assert.equal(accountRes.rows[0].status_override, "SOLD");

      const capacityRes = await client.query(
        `SELECT capacity_kind_v2 FROM account_capacities WHERE id = $1`,
        [capacityId],
      );
      assert.equal(capacityRes.rows[0].capacity_kind_v2, "Z3_SHARED_PS5_PS4");

      const backupRes = await client.query(
        `SELECT code_ciphertext FROM account_backup_codes WHERE id = $1`,
        [backupCodeId],
      );
      assert.ok(backupRes.rows[0].code_ciphertext);
    } finally {
      client.release();
    }
  });
});
