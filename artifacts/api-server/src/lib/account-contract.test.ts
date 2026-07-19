import { describe, it } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..", "..", "..");
const schemasFile = path.resolve(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated",
  "api.schemas.ts",
);
const hooksFile = path.resolve(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);
const openApiFile = path.resolve(root, "lib", "api-spec", "openapi.yaml");

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function splitSchemaBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  let currentName: string | null = null;
  const currentLines: string[] = [];
  for (const line of source.split("\n")) {
    const match = line.match(/^export (interface|type|const) ([A-Za-z0-9_]+)/);
    if (match) {
      if (currentName) {
        blocks.set(currentName, currentLines.join("\n"));
      }
      currentName = match[2];
      currentLines.length = 0;
    }
    if (currentName) {
      currentLines.push(line);
    }
  }
  if (currentName) {
    blocks.set(currentName, currentLines.join("\n"));
  }
  return blocks;
}

const safeAccountSchemaNames = [
  "AccountListItem",
  "AccountDetail",
  "AccountCapacity",
  "AccountListResponse",
  "AccountDetailResponse",
  "AccountCapacitiesResponse",
];

const secretStrings = [
  "psnEmail",
  "psnPassword",
  "emailPassword",
  "familyManagementEmail",
  "backupCode",
  "codeCiphertext",
  "lookupHash",
  "encrypted",
  "decrypted",
  "plaintext",
  "email",
  "password",
  "secret",
];

describe("Account OpenAPI contract", () => {
  it("generates a valid client from OpenAPI", () => {
    assert.doesNotThrow(
      () => {
        execSync("pnpm --filter @workspace/api-spec run codegen", {
          cwd: root,
          stdio: "pipe",
        });
      },
      "OpenAPI codegen failed; the spec is invalid or the generated code does not typecheck",
    );
    assert.ok(fs.existsSync(schemasFile), "generated schemas file is missing");
    assert.ok(fs.existsSync(hooksFile), "generated hooks file is missing");
  });

  it("includes all required Account schemas", () => {
    const blocks = splitSchemaBlocks(readFile(schemasFile));
    const required = [
      "AccountStatus",
      "CapacityKind",
      "AccountListItem",
      "AccountDetail",
      "AccountCapacity",
      "AccountListResponse",
      "AccountDetailResponse",
      "AccountCapacitiesResponse",
      "CreateAccountRequest",
      "UpdateAccountRequest",
      "SetAccountStatusOverrideRequest",
      "DuplicateWarningResponse",
      "DuplicateFieldName",
      "StandardApiError",
    ];
    for (const name of required) {
      assert.ok(blocks.has(name), `expected generated schema ${name} to exist`);
    }
  });

  it("does not expose secret fields in safe Account DTO schemas", () => {
    const blocks = splitSchemaBlocks(readFile(schemasFile));
    for (const name of safeAccountSchemaNames) {
      const block = blocks.get(name);
      assert.ok(block, `expected safe schema ${name} to exist`);
      for (const secret of secretStrings) {
        assert.ok(
          !block.includes(secret),
          `safe schema ${name} must not contain secret indicator ${secret}`,
        );
      }
    }
  });

  it("does not expose matched values or Account IDs in DuplicateWarningResponse", () => {
    const blocks = splitSchemaBlocks(readFile(schemasFile));
    for (const [name, block] of blocks) {
      if (!name.startsWith("DuplicateWarningResponse")) continue;
      assert.ok(
        !block.includes("accountId"),
        `${name} must not contain accountId`,
      );
      assert.ok(
        !block.includes("value"),
        `${name} must not contain matched value fields`,
      );
    }
  });

  it("includes only approved read-only Account hooks", () => {
    const hooks = readFile(hooksFile);
    const requiredReadOnly = [
      "export const listAccounts",
      "export const getAccount",
      "export const getAccountCapacities",
      "export function useListAccounts",
      "export function useGetAccount",
      "export function useGetAccountCapacities",
    ];
    for (const token of requiredReadOnly) {
      assert.ok(
        hooks.includes(token),
        `expected generated hook token ${token}`,
      );
    }
    const requiredCreate = [
      "export const createAccount",
      "export const useCreateAccount",
    ];
    for (const token of requiredCreate) {
      assert.ok(
        hooks.includes(token),
        `expected generated Create Account hook token ${token}`,
      );
    }
    const requiredUpdate = [
      "export const updateAccount",
      "export const setAccountStatusOverride",
      "export const useUpdateAccount",
      "export const useSetAccountStatusOverride",
    ];
    for (const token of requiredUpdate) {
      assert.ok(
        hooks.includes(token),
        `expected generated Update/Status hook token ${token}`,
      );
    }
    const forbidden = [
      "export const deleteAccount",
      "export const getAccountSecrets",
      "export const getAccountBackupCodes",
      "export function useDeleteAccount",
      "export function useGetAccountSecrets",
      "export function useGetAccountBackupCodes",
    ];
    for (const token of forbidden) {
      assert.ok(
        !hooks.includes(token),
        `forbidden generated hook token ${token} must not exist`,
      );
    }
  });

  it("includes only approved read-only Account paths in OpenAPI", () => {
    const openApi = readFile(openApiFile);
    assert.ok(
      openApi.includes("  /games/{gameId}/accounts:"),
      "expected GET /games/{gameId}/accounts path",
    );
    assert.ok(
      openApi.includes("  /accounts/{accountId}:"),
      "expected GET /accounts/{accountId} path",
    );
    assert.ok(
      openApi.includes("  /accounts/{accountId}/capacities:"),
      "expected GET /accounts/{accountId}/capacities path",
    );
    assert.ok(
      openApi.includes("operationId: createAccount"),
      "createAccount operation must be in OpenAPI",
    );
    assert.ok(
      openApi.includes("operationId: updateAccount"),
      "updateAccount operation must be in OpenAPI",
    );
    assert.ok(
      openApi.includes("operationId: setAccountStatusOverride"),
      "setAccountStatusOverride operation must be in OpenAPI",
    );
    assert.ok(
      !openApi.includes("/secrets"),
      "Secret Reveal path must not be in OpenAPI",
    );
    assert.ok(
      !openApi.includes("/backup-codes"),
      "Backup Code Reveal path must not be in OpenAPI",
    );
    assert.ok(
      !openApi.includes("operationId: deleteAccount"),
      "deleteAccount operation must not be in OpenAPI",
    );
  });

  it("does not allow the active frontend to import Account mutation hooks", () => {
    const frontendSrc = path.resolve(root, "artifacts", "playsyncer", "src");
    const output = execSync(
      `grep -R "useUpdateAccount\\|useSetAccountStatusOverride\\|updateAccount\\|setAccountStatusOverride" ${frontendSrc} || true`,
      { encoding: "utf-8" },
    );
    assert.strictEqual(
      output.trim(),
      "",
      "active frontend imports or references Account mutation hooks/functions",
    );
  });
});
