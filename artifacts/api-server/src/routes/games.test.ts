import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTestPg, startApiServer } from "../lib/test-pg.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "..", "dist");

type GameResponse = {
  game: {
    id: string;
    title: string;
    titleNormalized: string;
    platform: string;
    status: string;
  };
};

type ErrorResponse = { error: string };

type GameOrError = GameResponse | ErrorResponse;

let seedCounter = 0;
let cachedAccountColumns: Set<string> | null = null;

function nextSeed(): string {
  seedCounter += 1;
  return `${Date.now()}_${seedCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

function getAccountsColumns(databaseUrl: string): Set<string> {
  if (cachedAccountColumns) return cachedAccountColumns;
  const sql =
    `SELECT column_name FROM information_schema.columns ` +
    `WHERE table_schema = 'public' AND table_name = 'accounts'`;
  const output = execSync(`psql "${databaseUrl}" -tAc "${sql}"`, {
    encoding: "utf-8",
  });
  cachedAccountColumns = new Set(
    output
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return cachedAccountColumns;
}

/**
 * Seed a minimal Account row directly in the test database so Game guard tests
 * can exercise the "accounts exist for this game" branch. Synthetic values are
 * supplied only for legacy credential columns that are still present in the
 * current schema; after migration 0003 removes those columns, this fixture will
 * continue to work because it skips columns that no longer exist.
 */
function seedAccountForGame(
  databaseUrl: string,
  gameId: string,
): { id: string } {
  const seed = nextSeed();
  const columns: string[] = [
    "game_id",
    "account_code",
    "account_number_prefix",
    "account_number_seq",
    "display_number",
  ];
  const values: string[] = [
    `'${gameId}'`,
    `'ACC-${seed}'`,
    `'SEED'`,
    `${seedCounter}`,
    `'SEED-${seed}'`,
  ];

  const presentColumns = getAccountsColumns(databaseUrl);
  const legacyColumns = [
    "email",
    "email_normalized",
    "playstation_password_encrypted",
    "email_password_encrypted",
  ];
  for (const col of legacyColumns) {
    if (presentColumns.has(col)) {
      columns.push(col);
      if (col === "email" || col === "email_normalized") {
        values.push(`'seed-${seed}@example.com'`);
      } else if (col === "playstation_password_encrypted") {
        values.push(`'pwd-${seed}'`);
      } else if (col === "email_password_encrypted") {
        values.push(`'email-pwd-${seed}'`);
      } else {
        values.push("'x'");
      }
    }
  }

  const sql =
    `INSERT INTO "accounts" (${columns.map((c) => `"${c}"`).join(", ")}) ` +
    `VALUES (${values.join(", ")}) RETURNING "id";`;
  const output = execSync(`psql "${databaseUrl}" -tAc "${sql}"`, {
    encoding: "utf-8",
  });
  const id = output.trim().split("\n")[0]?.trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Failed to seed account; output was: ${JSON.stringify(output)}`);
  }
  return { id };
}

function runSql(databaseUrl: string, sql: string) {
  execSync(`psql "${databaseUrl}" -c "${sql}"`, { stdio: "ignore" });
}

function assertGame(data: GameOrError): GameResponse["game"] {
  assert.ok(
    "game" in data,
    "expected game response, got error: " +
      ("error" in data ? data.error : ""),
  );
  return data.game;
}

describe("Games API", () => {
  let baseUrl: string;
  let databaseUrl: string;
  let stopServer: () => Promise<void>;
  let stopPg: () => Promise<void>;

  before(async () => {
    const { databaseUrl: dbUrl, stop: stopPgFn } = await startTestPg();
    databaseUrl = dbUrl;
    stopPg = stopPgFn;

    // Build the server so the test can run it as a subprocess. The raw
    // TypeScript source is not directly importable from node --test because of
    // directory/no-extension imports used across the codebase.
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
  });

  after(async () => {
    await stopServer();
    await stopPg();
  });

  async function createGame(title: string, platform: string, status?: string) {
    const body: Record<string, string> = { title, platform };
    if (status) body.status = status;
    const res = await fetch(`${baseUrl}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: (await res.json()) as GameOrError };
  }

  async function updateGame(id: string, body: object) {
    const res = await fetch(`${baseUrl}/games/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: (await res.json()) as GameOrError };
  }

  async function deleteGame(id: string) {
    const res = await fetch(`${baseUrl}/games/${id}`, {
      method: "DELETE",
    });
    return { res, data: (await res.json()) as { ok: boolean } | ErrorResponse };
  }

  it("creates a game successfully", async () => {
    const { res, data } = await createGame("FC 26", "PS5_ONLY");
    assert.strictEqual(res.status, 201);
    const game = assertGame(data);
    assert.strictEqual(game.title, "FC 26");
    assert.strictEqual(game.titleNormalized, "fc 26");
    assert.strictEqual(game.platform, "PS5_ONLY");
    assert.strictEqual(game.status, "ACTIVE");
  });

  it("created Game returns a valid UUID and is retrievable by GET /games/:id", async () => {
    const { res, data } = await createGame("UUID Retrieve Test", "PS5_ONLY");
    assert.strictEqual(res.status, 201);
    const game = assertGame(data);
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        game.id,
      ),
      "created game id is a valid UUID",
    );

    const getRes = await fetch(`${baseUrl}/games/${game.id}`);
    assert.strictEqual(getRes.status, 200);
    const getData = (await getRes.json()) as GameResponse;
    assert.strictEqual(getData.game.id, game.id);
    assert.strictEqual(getData.game.title, "UUID Retrieve Test");
  });

  it("created Game appears in GET /games", async () => {
    const { data } = await createGame("List Appear Test", "PS5_ONLY");
    const game = assertGame(data);

    const listRes = await fetch(`${baseUrl}/games`);
    assert.strictEqual(listRes.status, 200);
    const listData = (await listRes.json()) as {
      games: { id: string; title: string }[];
    };
    const found = listData.games.find((g) => g.id === game.id);
    assert.ok(found, "created game appears in GET /games list");
    assert.strictEqual(found.title, "List Appear Test");
  });

  it("normal POST /games validation/conflict failures never return 404", async () => {
    const title = "Conflict Failure Test";
    await createGame(title, "PS5_ONLY");

    const { res: dupRes } = await createGame(title, "PS4_ONLY");
    assert.notStrictEqual(dupRes.status, 404);
    assert.strictEqual(dupRes.status, 409);

    const { res: invalidRes } = await createGame("   ", "PS5_ONLY");
    assert.notStrictEqual(invalidRes.status, 404);
    assert.strictEqual(invalidRes.status, 400);
  });

  it("rejects duplicate normalized titles", async () => {
    await createGame("Duplicate Title", "PS5_ONLY");
    const { res, data } = await createGame(" Duplicate Title ", "PS4_ONLY");
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(data.error, "A game with this title already exists");
    assert.ok(!data.error.includes("23505"));
  });

  it("rejects whitespace-only titles on create", async () => {
    const { res, data } = await createGame("   ", "PS5_ONLY");
    assert.strictEqual(res.status, 400);
    assert.ok("error" in data);
  });

  it("rejects whitespace-only titles on update", async () => {
    const { data: createData } = await createGame("Whitespace Update", "PS5_ONLY");
    const game = assertGame(createData);
    const { res, data } = await updateGame(game.id, { title: "\t\n" });
    assert.strictEqual(res.status, 400);
    assert.ok("error" in data);
  });

  it("collapses repeated internal spaces in the stored title", async () => {
    const { res, data } = await createGame("Collapse   Title", "PS5_ONLY");
    assert.strictEqual(res.status, 201);
    const game = assertGame(data);
    assert.strictEqual(game.title, "Collapse Title");
    assert.strictEqual(game.titleNormalized, "collapse title");
  });

  it("rejects invalid UUID with 400", async () => {
    const res = await fetch(`${baseUrl}/games/not-a-uuid`);
    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as ErrorResponse;
    assert.ok(data.error);
  });

  it("returns 404 for missing game", async () => {
    const res = await fetch(
      `${baseUrl}/games/550e8400-e29b-41d4-a716-446655440000`,
    );
    assert.strictEqual(res.status, 404);
  });

  it("allows platform change without account history", async () => {
    const { data: createData } = await createGame("Platform Change", "PS4_ONLY");
    const game = assertGame(createData);
    const { res, data } = await updateGame(game.id, {
      platform: "PS5_ONLY",
    });
    assert.strictEqual(res.status, 200);
    const updated = assertGame(data);
    assert.strictEqual(updated.platform, "PS5_ONLY");
  });

  it("blocks platform change with active account history", async () => {
    const { data: createData } = await createGame("Platform Lock", "PS4_ONLY");
    const game = assertGame(createData);

    seedAccountForGame(databaseUrl, game.id);

    const { res, data } = await updateGame(game.id, { platform: "PS5_ONLY" });
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(
      data.error,
      "Cannot change platform after accounts exist for this game",
    );
  });

  it("allows same-platform update when an account exists", async () => {
    const { data: createData } = await createGame("Same Platform", "PS4_ONLY");
    const game = assertGame(createData);

    seedAccountForGame(databaseUrl, game.id);

    const { res, data } = await updateGame(game.id, {
      platform: "PS4_ONLY",
      status: "INACTIVE",
    });
    assert.strictEqual(res.status, 200);
    const updated = assertGame(data);
    assert.strictEqual(updated.platform, "PS4_ONLY");
    assert.strictEqual(updated.status, "INACTIVE");
  });

  it("blocks platform change with a soft-deleted account", async () => {
    const { data: createData } = await createGame("Soft Delete Lock", "PS4_ONLY");
    const game = assertGame(createData);

    const account = seedAccountForGame(databaseUrl, game.id);
    runSql(
      databaseUrl,
      `UPDATE "accounts" SET "deleted_at" = now() WHERE "id" = '${account.id}';`,
    );

    const { res, data } = await updateGame(game.id, { platform: "PS5_ONLY" });
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(
      data.error,
      "Cannot change platform after accounts exist for this game",
    );
  });

  it("changes status from ACTIVE to INACTIVE", async () => {
    const { data: createData } = await createGame("Status Change", "PS5_ONLY");
    const game = assertGame(createData);
    const { res, data } = await updateGame(game.id, {
      status: "INACTIVE",
    });
    assert.strictEqual(res.status, 200);
    const updated = assertGame(data);
    assert.strictEqual(updated.status, "INACTIVE");
  });

  it("allows hard delete without history", async () => {
    const { data: createData } = await createGame("Delete Allowed", "PS5_ONLY");
    const game = assertGame(createData);
    const { res } = await deleteGame(game.id);
    assert.strictEqual(res.status, 200);
    const getRes = await fetch(`${baseUrl}/games/${game.id}`);
    assert.strictEqual(getRes.status, 404);
  });

  it("blocks hard delete with active account history", async () => {
    const { data: createData } = await createGame("Delete Lock", "PS5_ONLY");
    const game = assertGame(createData);

    seedAccountForGame(databaseUrl, game.id);

    const { res, data } = await deleteGame(game.id);
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(
      data.error,
      "Cannot delete game while accounts exist; mark it inactive instead",
    );
  });

  it("blocks hard delete with a soft-deleted account", async () => {
    const { data: createData } = await createGame(
      "Soft Delete Delete",
      "PS5_ONLY",
    );
    const game = assertGame(createData);

    const account = seedAccountForGame(databaseUrl, game.id);
    runSql(
      databaseUrl,
      `UPDATE "accounts" SET "deleted_at" = now() WHERE "id" = '${account.id}';`,
    );

    const { res, data } = await deleteGame(game.id);
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(
      data.error,
      "Cannot delete game while accounts exist; mark it inactive instead",
    );
  });

  it("enforces global normalized-title uniqueness across soft-deleted games", async () => {
    const { data: createData } = await createGame("Global Unique", "PS5_ONLY");
    const game = assertGame(createData);
    runSql(
      databaseUrl,
      `UPDATE "games" SET "deleted_at" = now() WHERE "id" = '${game.id}';`,
    );

    const { res, data } = await createGame("Global Unique", "PS4_ONLY");
    assert.strictEqual(res.status, 409);
    assert.ok("error" in data);
    assert.strictEqual(data.error, "A game with this title already exists");
  });

  it("lists all games including inactive ones", async () => {
    const { data: g1 } = await createGame("List Inactive", "PS5_ONLY");
    const inactiveGame = assertGame(g1);
    await updateGame(inactiveGame.id, { status: "INACTIVE" });
    await createGame("List Active", "PS5_ONLY");

    const res = await fetch(`${baseUrl}/games`);
    const data = (await res.json()) as { games: { title: string }[] };
    assert.strictEqual(res.status, 200);
    const titles = data.games.map((g) => g.title);
    assert.ok(titles.includes("List Inactive"));
    assert.ok(titles.includes("List Active"));
  });
});
