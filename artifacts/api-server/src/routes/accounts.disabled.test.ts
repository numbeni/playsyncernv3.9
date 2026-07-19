import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

type ErrorResponse = { error: string };

function countRows(databaseUrl: string, table: string): number {
  const output = execSync(
    `psql "${databaseUrl}" -c "SELECT count(*)::int FROM ${table};"`,
    { encoding: "utf-8" },
  );
  const match = output.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function seedAccountWithSecrets(databaseUrl: string, gameId: string): void {
  const sql = `
    INSERT INTO "accounts" (
      "game_id", "account_code", "account_number_prefix", "account_number_seq",
      "display_number",
      "psn_email_encrypted", "psn_email_lookup_hash", "psn_password_encrypted",
      "psn_password_lookup_hash", "email_password_encrypted_v2",
      "email_password_lookup_hash", "family_management_email_encrypted_v2",
      "family_management_email_lookup_hash"
    ) VALUES (
      '${gameId}', 'ACC-TEST-001', 'TST', 1, 'TST-001',
      'test-psn-email', 'test-psn-email-hash', 'test-psn-pwd', 'test-psn-pwd-hash',
      'test-email-pwd-v2', 'test-email-pwd-hash', 'test-family-email', 'test-family-email-hash'
    );
  `;
  execSync(`psql "${databaseUrl}" -c "${sql}"`, { stdio: "ignore" });
}

describe("Account mutation routes are disabled", () => {
  let baseUrl: string;
  let databaseUrl: string;
  let stopServer: () => Promise<void>;
  let stopPg: () => Promise<void>;
  let gameId: string;

  before(async () => {
    const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
    databaseUrl = dbUrl;
    stopPg = stopPgFn;

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

    const res = await fetch(`${baseUrl}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Disabled Account Test Game",
        platform: "PS5_ONLY",
      }),
    });
    const data = (await res.json()) as { game: { id: string } };
    gameId = data.game.id;
  });

  after(async () => {
    await stopServer();
    await stopPg();
  });

  it("POST /games/:gameId/accounts returns 403 and writes nothing", async () => {
    const before = countRows(databaseUrl, "accounts");
    const res = await fetch(`${baseUrl}/games/${gameId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        playstationPassword: "secret",
        emailPassword: "secret",
      }),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
    assert.strictEqual(countRows(databaseUrl, "accounts"), before);
  });

  it("PATCH /accounts/:id returns 403 and writes nothing", async () => {
    const before = countRows(databaseUrl, "accounts");
    const res = await fetch(`${baseUrl}/accounts/${gameId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "disabled" }),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
    assert.strictEqual(countRows(databaseUrl, "accounts"), before);
  });

  it("PATCH /accounts/:id/status-override returns 403 and writes nothing", async () => {
    const before = countRows(databaseUrl, "accounts");
    const res = await fetch(`${baseUrl}/accounts/${gameId}/status-override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusOverride: "SOLD" }),
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
    assert.strictEqual(countRows(databaseUrl, "accounts"), before);
  });

  it("DELETE /accounts/:id returns 403 and writes nothing", async () => {
    const before = countRows(databaseUrl, "accounts");
    const res = await fetch(`${baseUrl}/accounts/${gameId}`, {
      method: "DELETE",
    });
    assert.strictEqual(res.status, 403);
    const data = (await res.json()) as { error: string; code: string };
    assert.strictEqual(data.error, "Account operations are not authorized");
    assert.strictEqual(data.code, "ACCOUNT_OPS_DISABLED");
    assert.strictEqual(countRows(databaseUrl, "accounts"), before);
  });

  it("GET /games/:gameId/accounts returns only non-secret account fields", async () => {
    seedAccountWithSecrets(databaseUrl, gameId);
    const res = await fetch(`${baseUrl}/games/${gameId}/accounts`);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as {
      accounts: Record<string, unknown>[];
    };
    assert.strictEqual(data.accounts.length, 1);

    const account = data.accounts[0];
    const allowedKeys = [
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
    assert.deepStrictEqual(Object.keys(account).sort(), allowedKeys.sort());
    assert.ok(
      ["AVAILABLE", "PARTIALLY_SOLD", "SOLD", "INACTIVE"].includes(
        String(account.status),
      ),
      "status is a canonical Account status",
    );

    const body = JSON.stringify(account).toLowerCase();
    assert.ok(!body.includes("secret"), "response body leaks a secret value");
    assert.ok(!body.includes("password"), "response body leaks a password");
    assert.ok(!body.includes("email"), "response body leaks an email");
    assert.ok(!body.includes("hash"), "response body leaks a lookup hash");
    assert.ok(!body.includes("backup"), "response body leaks backup code data");
  });
});
