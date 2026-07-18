# PS-03D2-1 — Account API Contract Audit and Decision Gate

> Status: **Design / Inspection only** — no runtime source code, OpenAPI, generated client, schema, migration, or database changes are part of this document.

## 1. Current-state audit

### 1.1 Account backend functionality already exists

- `artifacts/api-server/src/services/account/index.ts` implements a single public domain function: `createAccount(input: unknown): Promise<CreateAccountResult>`.
- It validates input with Zod, loads a master encryption key from `PLAYSYNCER_ACCOUNT_MASTER_KEY`, requires the parent game to be `ACTIVE`, detects duplicate PSN Email / Family Management Email / Online ID via keyed lookup hashes and advisory locks, allocates immutable identifiers from PostgreSQL sequences, encrypts secrets with AES-GCM, inserts the Account, auto-generates Capacity rows from the Game platform template, and inserts encrypted Backup Codes.
- It returns either a safe `SafeAccount` DTO on success or a `duplicate-warning` result with the offending field names.
- There are no service-level functions yet for update, delete, detail retrieval, or capacity finish/unfinish.

### 1.2 Account routes currently do

- `artifacts/api-server/src/routes/accounts.ts` is mounted in the API but fail-closed for mutations:
  - `GET /games/:gameId/accounts` — **active**. Returns non-secret summaries (`SafeAccount`) for a game.
  - `GET /accounts/:id` — **disabled** (403).
  - `POST /games/:gameId/accounts` — **disabled** (403).
  - `PATCH /accounts/:id` — **disabled** (403).
  - `DELETE /accounts/:id` — **disabled** (403).
- `artifacts/api-server/src/routes/accounts.disabled.test.ts` verifies that disabled endpoints return 403, write nothing, and expose no secrets.

### 1.3 Frontend Account UI currently expects

- `artifacts/playsyncer/src/domain/accounts/types.ts` defines an internal `Account` model with:
  - `id`, `accountCode` (`ACC-000001`), `numberPrefix`, `number` (`#PREFIX-001`), `email`, `password`, `emailPassword`, `onlineId`, `birthDate`, `familyManagementEmail`, `backupCodes[]`, `status: "active" | "disabled"`, `slots: AccountSlot[]`.
- `AccountCard.tsx` displays the safe identifiers, a status badge (`active`/`disabled`), and a full expanded panel with secrets (email, password, backup codes) and capacity slots with customer assignments.
- `AccountFormModal.tsx` is a create/edit form for all credential fields plus a status toggle (`active`/`disabled`) and backup codes.
- `GameDetailPage.tsx` currently shows a placeholder: *“Account management is not yet connected to the backend.”*
- `artifacts/playsyncer/src/domain/permissions/permissions.ts` already declares actions such as `account.create`, `account.edit.email`, `account.view.details`, `account.disable`, `account.delete`, `capacity.assignCustomer`, etc.

### 1.4 Safe DTO support already exists

- `artifacts/api-server/src/lib/dto.ts` defines `SafeAccount` and `toSafeAccount()`, stripping every encrypted column, lookup hash, and legacy secret field before returning an Account.
- Returned fields: `id`, `gameId`, `accountCode`, `accountNumberPrefix`, `accountNumberSeq`, `displayNumber`, `onlineId`, `birthDate`, `createdAt`, `updatedAt`.
- The `accounts.disabled.test.ts` assertions confirm that `GET /games/:gameId/accounts` returns only those keys and no secret leakage.

### 1.5 What is still missing

- Service-level update, delete, detail, and capacity-management functions.
- A derived-status helper that maps the schema's `statusOverride` plus capacity/assignment state to the four product statuses (`AVAILABLE`, `PARTIALLY_SOLD`, `SOLD`, `INACTIVE`).
- OpenAPI paths and schemas for Accounts, Capacities, and Backup Codes.
- Generated React Query hooks and Zod schemas for the new contracts.
- A clear HTTP duplicate-confirmation contract (the main unresolved PS-03D1 follow-up).
- A Secret/Backup Code Reveal contract that is gated behind Auth/RBAC/Audit Logging.
- A reconciled frontend status model: the frontend currently uses `active`/`disabled`, while the product rules use `AVAILABLE | PARTIALLY_SOLD | SOLD | INACTIVE`.

---

## 2. Proposed Account endpoint map

Base path: `/api`. All Account endpoints are grouped under the `accounts` tag.

### A. Read-only endpoints (can be implemented first)

#### A.1 List Accounts for one Game

- **Method:** `GET`
- **Path:** `/games/{gameId}/accounts`
- **Purpose:** Return non-secret Account summaries for a single Game.
- **Request body:** none.
- **Safe response body:** `{ accounts: AccountListItem[] }`
- **Expected errors:**
  - `400` — malformed `gameId` UUID.
  - `404` — Game not found or soft-deleted.
  - `500` — unexpected database error.
- **Required permission:** `account.view.list`
- **Implementation stage:** PS-03D2-2 (read-only)
- **Currently blocked:** No.

#### A.2 Retrieve one Account detail

- **Method:** `GET`
- **Path:** `/accounts/{accountId}`
- **Purpose:** Return safe Account detail including identifiers, derived status, and capacity summary.
- **Request body:** none.
- **Safe response body:** `{ account: AccountDetail }`
- **Expected errors:**
  - `400` — malformed `accountId` UUID.
  - `404` — Account not found or soft-deleted.
  - `500` — unexpected database error.
- **Required permission:** `account.view.detail`
- **Implementation stage:** PS-03D2-2 (read-only)
- **Currently blocked:** Route returns 403; allowed to be activated once the safe DTO contract is approved.

#### A.3 Retrieve Account Capacities

- **Method:** `GET`
- **Path:** `/accounts/{accountId}/capacities`
- **Purpose:** Return the persistent capacity slots for an Account, including finish state and active customer count per slot.
- **Request body:** none.
- **Safe response body:** `{ capacities: CapacityItem[] }`
- **Expected errors:**
  - `400` — malformed `accountId` UUID.
  - `404` — Account not found or soft-deleted.
  - `500` — unexpected database error.
- **Required permission:** `account.view.detail`
- **Implementation stage:** PS-03D2-2 (read-only)
- **Currently blocked:** No route exists yet.

### B. Mutation endpoints (for later controlled activation)

#### B.1 Create Account

- **Method:** `POST`
- **Path:** `/games/{gameId}/accounts`
- **Purpose:** Create a new Account under a Game, including credentials, Backup Codes, and auto-generated Capacities.
- **Request body:** `CreateAccountRequest` (`psnEmail`, `psnPassword`, `emailPassword`, `onlineId`, `birthDate`, `familyManagementEmail`, `backupCodes: string[]`, optional `numberPrefix`, optional `confirmed: boolean`).
- **Safe response body:**
  - On success: `{ account: AccountDetail }` (201)
  - On duplicate warning: `409` with `{ error: "Duplicate warning", code: "DUPLICATE_WARNING", detail: { duplicateFields: string[] } }`.
- **Expected errors:**
  - `400` — validation failure (invalid email, missing backup code, malformed date, etc.).
  - `403` — parent Game is inactive.
  - `404` — Game not found.
  - `409` — duplicate warning (see section 4) or identifier conflict.
  - `500` — encryption misconfiguration or unexpected database error.
- **Required permission:** `account.create`
- **Implementation stage:** PS-03D2-3 or later
- **Currently blocked:** Yes (route returns 403; needs approved duplicate contract and encryption readiness).

#### B.2 Update Account

- **Method:** `PATCH`
- **Path:** `/accounts/{accountId}`
- **Purpose:** Update editable non-identifier fields of an Account (credentials, onlineId, birthDate, familyManagementEmail, Backup Codes). Identifiers (`accountCode`, `displayNumber`, `accountNumberSeq`) remain immutable.
- **Request body:** `UpdateAccountRequest` (same fields as Create but optional; `numberPrefix` is not allowed because display number is immutable).
- **Safe response body:** `{ account: AccountDetail }`
- **Expected errors:**
  - `400` — validation failure.
  - `404` — Account not found.
  - `409` — duplicate warning on email/onlineId/familyEmail.
  - `500` — unexpected database error.
- **Required permission:** `account.edit.*` (fine-grained by field)
- **Implementation stage:** PS-03D2-3 or later
- **Currently blocked:** Yes.

#### B.3 Set or clear Account status override

- **Method:** `PATCH`
- **Path:** `/accounts/{accountId}/status-override`
- **Purpose:** Set or clear the manual `statusOverride` (`SOLD` or `INACTIVE`). `AVAILABLE` and `PARTIALLY_SOLD` are derived and cannot be set directly. Setting `INACTIVE` is the safe way to disable an Account without deleting it.
- **Request body:** `{ statusOverride: "SOLD" | "INACTIVE" | null }`
- **Safe response body:** `{ account: AccountDetail }`
- **Expected errors:**
  - `400` — invalid status value.
  - `404` — Account not found.
  - `500` — unexpected database error.
- **Required permission:** `account.disable` (for `INACTIVE`) and `account.edit` (for `SOLD`)
- **Implementation stage:** PS-03D2-3 or later
- **Currently blocked:** Yes.

#### B.4 Hard-delete Account

- **Method:** `DELETE`
- **Path:** `/accounts/{accountId}`
- **Purpose:** Hard-delete an Account only when it has no current or historical customer Assignment. Otherwise it must be set to `INACTIVE`.
- **Request body:** none.
- **Safe response body:** `{ ok: true }` (200)
- **Expected errors:**
  - `404` — Account not found.
  - `409` — Account has assignment history; deletion blocked.
  - `500` — unexpected database error.
- **Required permission:** `account.delete`
- **Implementation stage:** PS-03D2-3 or later
- **Currently blocked:** Yes (needs transaction workflow and audit readiness).

#### B.5 Capacity finish / unfinish

- **Method:** `PATCH`
- **Path:** `/accounts/{accountId}/capacities/{capacityId}/finish`
- **Path:** `/accounts/{accountId}/capacities/{capacityId}/unfinish`
- **Purpose:** Toggle the `FINISHED` state of a Capacity slot. `FINISHED` blocks new assignments but is reversible.
- **Request body:** none.
- **Safe response body:** `{ capacity: CapacityItem }`
- **Expected errors:**
  - `404` — Account or Capacity not found.
  - `409` — Capacity already in target state.
  - `500` — unexpected database error.
- **Required permission:** `capacity.finish` / `capacity.unfinish`
- **Implementation stage:** PS-03D2-3 or later
- **Currently blocked:** Yes (requires actor-based Audit Logging before activation).

### C. Security-blocked endpoints

These endpoints must not be designed in detail or activated until Authentication, RBAC, permission checks, and actor-based Audit Logging are approved and implemented.

| Method | Path | Purpose | Blocked reason |
|--------|------|---------|----------------|
| `GET` | `/accounts/{accountId}/secrets` | Reveal PSN Email, PSN Password, Email Password, Family Management Email | Secret Reveal |
| `GET` | `/accounts/{accountId}/backup-codes` | Reveal Backup Codes | Backup Code Reveal |
| Any audit endpoint | `/accounts/{accountId}/audit-log` | Actor-based Audit Logging | Audit Logging |

---

## 3. Safe DTO design

### 3.1 Core principles

Generic DTOs must never expose:

- Plaintext credentials
- Ciphertext
- Lookup hashes
- Backup Codes
- Encryption keys or key material

### 3.2 AccountListItem

```yaml
id: string (uuid)
gameId: string (uuid)
accountCode: string          # ACC-000001
displayNumber: string        # PREFIX-001 (no #)
accountNumberPrefix: string
accountNumberSeq: integer
onlineId: string | null
birthDate: string | null       # YYYY-MM-DD
status: AccountStatus         # AVAILABLE | PARTIALLY_SOLD | SOLD | INACTIVE
createdAt: string (ISO 8601)
updatedAt: string (ISO 8601)
capacitySummary:
  totalSlots: integer
  finishedSlots: integer
  activeCustomers: integer
```

### 3.3 AccountDetail

Same as `AccountListItem` plus:

```yaml
capacities: CapacityItem[]
```

No secrets, no backup codes, no lookup hashes.

### 3.4 CapacityItem

```yaml
id: string (uuid)
accountId: string (uuid)
capacityKind: "Z2_PS5" | "Z2_PS4" | "Z3_SHARED_PS5_PS4"
instanceNo: integer
label: string
isFinished: boolean
finishedAt: string | null (ISO 8601)
createdAt: string (ISO 8601)
activeCustomerCount: integer
```

### 3.5 CreateAccountRequest

```yaml
psnEmail: string             # valid email
psnPassword: string          # non-empty
emailPassword: string        # non-empty
onlineId: string             # non-empty, trimmed
birthDate: string            # YYYY-MM-DD
familyManagementEmail: string # valid email
backupCodes: string[]        # min 1, non-empty after trim
numberPrefix?: string       # optional, normalized to game title if omitted
confirmed?: boolean          # default false; see section 4
```

### 3.6 UpdateAccountRequest

Same as `CreateAccountRequest` but all fields optional. `numberPrefix` is omitted because display number is immutable. `backupCodes` can be replaced as a whole array.

### 3.7 Duplicate warning response

```yaml
error: "Duplicate warning"
code: "DUPLICATE_WARNING"
detail:
  duplicateFields: string[]   # e.g. ["psnEmail", "onlineId"]
```

HTTP status: `409 Conflict`.

### 3.8 Standard API error response

```yaml
error: string        # Persian user-safe message
code: string         # machine-readable error code (optional on 500)
detail?: unknown     # extra structured context when safe
```

### 3.9 Derived Account status

No new `status` column is persisted. The API returns the status derived from existing data:

| Condition | Returned status |
|-----------|-----------------|
| `statusOverride = 'INACTIVE'` or parent Game is `INACTIVE` | `INACTIVE` |
| `statusOverride = 'SOLD'` | `SOLD` |
| All Capacities are `FINISHED` and at least one customer has been assigned historically | `SOLD` (derived) |
| Some Capacities have active customers but not all finished | `PARTIALLY_SOLD` |
| No active customers and no override | `AVAILABLE` |

**Decision needed:** The frontend currently renders only `active`/`disabled`. The API should return the four product statuses; the frontend must be updated to map `AVAILABLE | PARTIALLY_SOLD | SOLD` to “active” and `INACTIVE` to “disabled”, or to display the full product status. This is a Command Center decision before read-only implementation.

---

## 4. Duplicate confirmation HTTP contract

### 4.1 The problem

PSN Email, Online ID, and Family Management Email may legitimately be duplicated across Accounts (e.g., shared credentials). The backend must warn the admin and require explicit confirmation before creating or updating the Account.

The internal `createAccount` function already supports this with a `confirmed` boolean that defaults to `false` and returns `duplicate-warning` when duplicates exist.

### 4.2 Option A — Same request with `confirmed: true` (recommended)

**Request shape:**
- First call: `POST /games/{gameId}/accounts` with `confirmed: false` (or omitted).

**Response if duplicates exist:**
- `409 Conflict`
- Body: `{ error: "Duplicate warning", code: "DUPLICATE_WARNING", detail: { duplicateFields: ["psnEmail", "onlineId"] } }`

**User flow:**
1. Admin submits the form.
2. Backend returns `409 DUPLICATE_WARNING` with the list of duplicate fields.
3. Frontend shows a Persian confirmation dialog naming the fields.
4. If admin confirms, frontend re-submits the exact same body with `confirmed: true`.
5. Backend skips duplicate checks and creates/updates the Account.

**Security risk:** Low. The caller must explicitly opt-in. The response does not reveal the matching Account IDs or any secret data.

**Implementation complexity:** Low. Reuses the existing internal `confirmed` flag. No additional server state, tokens, or endpoints.

**Compatibility:** Directly compatible with the existing `CreateAccountInput.confirmed` flag.

### 4.3 Option B — Separate pre-check endpoint

**Request shape:**
- `POST /games/{gameId}/accounts/check-duplicates` with the same body (without `confirmed`).
- Returns `{ duplicateFields: string[] }` (200) or empty array if no duplicates.
- Then the client calls `POST /games/{gameId}/accounts` with a header `X-Confirm-Duplicates: true`.

**User flow:** Two API calls and extra state on the client.

**Security risk:** Low, but the pre-check endpoint could be abused for enumeration if not protected by the same permission.

**Implementation complexity:** Medium. Requires a new endpoint and a custom header contract.

### 4.4 Option C — Idempotency key with warning hash

**Request shape:**
- First call returns a warning token/hash.
- Second call includes the warning token.

**User flow:** More complex; requires the server to store or reproduce the token.

**Security risk:** Low if token is short-lived, but adds state.

**Implementation complexity:** High. Requires token storage or deterministic hashing.

### 4.5 Recommendation

**Adopt Option A.** It is:

- Explicit (admin must confirm).
- Stateless (no server-side tokens).
- Compatible with the existing internal `confirmed` flag.
- Simple enough for the current product stage.
- Safe against accidental confirmation because the same request body must be re-sent with a boolean flag.

This should be the Command Center decision for the duplicate confirmation contract.

---

## 5. HTTP status and error mapping

All errors use the standard error response shape (section 3.8). Machine-readable `code` values are uppercase `SNAKE_CASE`.

| Scenario | HTTP | `code` | Persian user message | Notes |
|----------|------|--------|----------------------|-------|
| Invalid input / Zod validation | `400` | `VALIDATION_ERROR` | «اطلاعات ورودی صحیح نیست. لطفاً فیلدها را بررسی کنید.» | Includes Zod `issues` in `detail` for form fields. |
| Malformed JSON | `400` | `MALFORMED_JSON` | «فرمت JSON درخواست صحیح نیست.» | From existing error handler. |
| Game not found | `404` | `GAME_NOT_FOUND` | «بازی مورد نظر یافت نشد.» | Also applies to soft-deleted Game. |
| Account not found | `404` | `ACCOUNT_NOT_FOUND` | «اکانت مورد نظر یافت نشد.» | Also applies to soft-deleted Account. |
| Inactive Game | `403` | `INACTIVE_GAME` | «امکان ایجاد اکانت برای بازی غیرفعال وجود ندارد.» | Return 403 because the operation is forbidden. |
| Duplicate warning | `409` | `DUPLICATE_WARNING` | «فیلدهای {fields} تکراری شناسایی شد. آیا مطمئن هستید؟» | `detail.duplicateFields` lists machine names. |
| Identifier conflict (sequence) | `409` | `IDENTIFIER_CONFLICT` | «تخصیص شناسه اکانت با تداخل مواجه شد. لطفاً دوباره تلاش کنید.» | Rare; safe retry expected. |
| Missing/invalid encryption config | `500` | `ENCRYPTION_ERROR` | «تنظیمات رمزنگاری اکانت ناقص است. با پشتیبانی تماس بگیرید.» | Do not expose key details. |
| Unauthorized | `401` | `UNAUTHORIZED` | «لطفاً ابتدا وارد شوید.» | Auth not implemented yet. |
| Forbidden | `403` | `FORBIDDEN` | «شما اجازه انجام این عملیات را ندارید.» | RBAC not implemented yet. |
| Account deletion blocked by history | `409` | `ACCOUNT_HAS_HISTORY` | «این اکانت سابقه تخصیص مشتری دارد و قابل حذف نیست. می‌توانید آن را غیرفعال کنید.» | Same pattern as Games delete. |
| Unexpected database error | `500` | `INTERNAL_ERROR` | «خطای داخلی رخ داد. لطفاً دوباره تلاش کنید.» | Log full details server-side only. |

**Note:** `403` is used for business-forbidden operations (inactive game, disabled route, missing permission). `401` is reserved for missing/invalid authentication. Until Auth is implemented, mutation routes remain disabled at the route level.

---

## 6. Read-only-first implementation boundary

The smallest first implementation slice after this design is approved should contain **only** the read-only endpoints:

1. `GET /games/{gameId}/accounts`
2. `GET /accounts/{accountId}`
3. `GET /accounts/{accountId}/capacities`

These endpoints:

- Do not write to the database.
- Do not expose secrets.
- Do not require the duplicate confirmation contract.
- Do not require Audit Logging.
- Allow the frontend Game Detail page to be wired to real Account data safely.

### What must remain disabled

Until separate authorization is given:

- `POST /games/{gameId}/accounts`
- `PATCH /accounts/{accountId}`
- `PATCH /accounts/{accountId}/status-override`
- `DELETE /accounts/{accountId}`
- Capacity finish/unfinish endpoints
- All Secret/Backup Code Reveal endpoints

---

## 7. Authentication, RBAC and Audit boundary

Security is **not** implemented in this stage. The following is a proposed permission map for later review.

### 7.1 Proposed permission map

| Permission | Endpoint(s) | Notes |
|------------|-------------|-------|
| `account.view.list` | `GET /games/{gameId}/accounts` | Safe summary only. |
| `account.view.detail` | `GET /accounts/{accountId}`, `GET /accounts/{accountId}/capacities` | Safe detail + capacities. |
| `account.create` | `POST /games/{gameId}/accounts` | Includes duplicate confirmation. |
| `account.edit` | `PATCH /accounts/{accountId}` | Edits credentials; may be split into `account.edit.email`, `account.edit.password`, etc. |
| `account.disable` | `PATCH /accounts/{accountId}/status-override` | Setting `INACTIVE` or clearing an override. |
| `account.delete` | `DELETE /accounts/{accountId}` | Hard-delete only when no history. |
| `capacity.finish` | `PATCH /accounts/{accountId}/capacities/{capacityId}/finish` | Requires Audit Logging. |
| `capacity.unfinish` | `PATCH /accounts/{accountId}/capacities/{capacityId}/unfinish` | Requires Audit Logging. |
| `secret.reveal` | `GET /accounts/{accountId}/secrets` | Requires Auth/RBAC/Audit. |
| `backupCode.reveal` | `GET /accounts/{accountId}/backup-codes` | Requires Auth/RBAC/Audit. |

### 7.2 Endpoints that may not be activated before Auth/RBAC/Audit

- `secret.reveal`
- `backupCode.reveal`
- `capacity.finish`
- `capacity.unfinish`
- `account.delete` (should be audited)

---

## 8. OpenAPI and generated-client plan

### 8.1 What would be added to OpenAPI

After Command Center approval of this design:

- New `accounts` tag.
- New paths:
  - `GET /games/{gameId}/accounts`
  - `GET /accounts/{accountId}`
  - `GET /accounts/{accountId}/capacities`
  - `POST /games/{gameId}/accounts`
  - `PATCH /accounts/{accountId}`
  - `PATCH /accounts/{accountId}/status-override`
  - `DELETE /accounts/{accountId}`
  - `PATCH /accounts/{accountId}/capacities/{capacityId}/finish`
  - `PATCH /accounts/{accountId}/capacities/{capacityId}/unfinish`
- New schemas:
  - `AccountListItem`, `AccountDetail`, `AccountStatus`, `CapacityItem`
  - `CreateAccountRequest`, `UpdateAccountRequest`, `StatusOverrideRequest`
  - `DuplicateWarningResponse`, `AccountListResponse`, `AccountDetailResponse`, `CapacityListResponse`
  - `StandardErrorResponse` (reuse existing `ErrorResponse` or extend it with `code`)

### 8.2 How generated clients will be updated

- Run `pnpm --filter @workspace/api-spec run codegen` (or `pnpm run codegen` inside `lib/api-spec`).
- Orval generates:
  - React Query hooks in `lib/api-client-react/src/generated/api.ts`.
  - Zod schemas in `lib/api-zod/src/generated/`.
- The frontend imports hooks from `@workspace/api-client-react` and stops using local mock types as the authority.

### 8.3 How contract drift will be prevented

- OpenAPI is the source of truth. Any backend route or frontend change must start with an OpenAPI change reviewed by Command Center.
- The generated client is regenerated in a single workspace-wide command.
- Route-level tests verify that responses match the generated Zod schemas.
- Safe-DTO assertions (like `accounts.disabled.test.ts`) are extended to new endpoints.

### 8.4 Tests to add

- Route tests for each read-only endpoint (200, 404, 400).
- Route tests confirming disabled mutation endpoints still return 403 until activation.
- Safe-DTO assertions for `AccountDetail` and `CapacityItem`.
- Duplicate confirmation flow test (409 → 201 with `confirmed: true`).
- Service tests for status derivation.
- Service tests for update, delete, capacity finish/unfinish when authorized.

---

## 9. Decision gate

### 9.1 Blocker before read-only API implementation

1. **Frontend status model mismatch.** The frontend uses `active | disabled`; the product rules use `AVAILABLE | PARTIALLY_SOLD | SOLD | INACTIVE`. Command Center must decide whether the API returns the four product statuses and the frontend adapts, or whether a simplified UI status is returned separately.
2. **Account detail secret exposure.** The current `AccountDetailsModal` shows plaintext passwords and backup codes. Command Center must confirm that the read-only detail endpoint returns only the safe `AccountDetail` DTO, and secret reveal is deferred to a separate Auth/RBAC/Audit-gated stage.

### 9.2 Must decide before mutation API implementation

1. **Duplicate confirmation contract.** Adopt Option A (`confirmed: boolean` in the same request body returning 409 `DUPLICATE_WARNING`) or choose another option.
2. **Update request scope.** Which fields are editable? Can Backup Codes be replaced wholesale? Can Online ID change? Identifiers are immutable per PS-03B decision D2.
3. **Status override endpoint vs. inline field.** Should the status toggle be a separate `PATCH /accounts/{accountId}/status-override` or part of the general `PATCH`? Recommendation: separate endpoint for clarity and audit.

### 9.3 Must fix before route activation

1. `PLAYSYNCER_ACCOUNT_MASTER_KEY` must be configured as a Replit secret before any Account creation or update can be tested in the deployed environment.
2. Auth/RBAC/Audit must be implemented before activating Secret Reveal, Backup Code Reveal, capacity finish/unfinish, and hard-delete.
3. The frontend must stop importing the legacy `playSyncerMockData.ts` fixture as authority (already done per PS-02B) and must not display secrets from generic DTOs.

### 9.4 Deferred hardening

1. Partial search over encrypted fields (PS-03B decision D13).
2. Encryption-at-rest verification tooling (currently plaintext in dev if key is missing).
3. Concurrency stress tests for sequence allocation.
4. Purging of soft-deleted Accounts after retention period.

### 9.5 Accepted behavior

1. Backup Codes are storage-only with no validation, consumption, or reveal (PS-03C2B correction).
2. Capacity rows are generated automatically from the Game platform and cannot be manually created/deleted (PS-03B decision D7).
3. Soft deletes are used everywhere; no hard purge is implemented yet.
4. `Z3_SHARED_PS5_PS4` uses `instanceNo = 0` (PS-03D1-1 correction).

---

## 10. Recommended execution plan

### PS-03D2-2 — Read-only Account API implementation

- Implement `GET /games/{gameId}/accounts` (already partially present, finalize and add tests).
- Implement `GET /accounts/{accountId}` and `GET /accounts/{accountId}/capacities`.
- Add derived-status helper returning the approved product status.
- Add OpenAPI schemas and paths for read-only endpoints only.
- Regenerate API client.
- Add route tests and safe-DTO assertions.
- Do **not** activate mutation routes.

### PS-03D2-3 — Account mutation API implementation

- Implement `createAccount` route with duplicate confirmation (Option A).
- Implement `updateAccount` route (limited to editable fields).
- Implement status-override endpoint.
- Implement hard-delete endpoint with history check.
- Implement capacity finish/unfinish endpoints (still gated by Audit readiness).
- Extend OpenAPI and regenerate client.
- Extend tests.
- Keep Secret/Backup Code Reveal blocked.

### PS-03D3 — Frontend Account integration

- Wire `GameDetailPage` to the read-only Account endpoints.
- Replace local `Account` type authority with generated API types.
- Adapt the status badge to the API status model (pending Command Center decision).
- Split secret display into a separate, permission-gated reveal flow.
- Add Account create/edit/delete/status forms against the approved mutation endpoints in controlled sub-stages.

---

## Appendix A — Files inspected for this design

- `docs/CURRENT_PHASE.md`
- `docs/DECISION_LOG.md`
- `docs/PRODUCT_RULES.md`
- `artifacts/api-server/src/services/account/index.ts`
- `artifacts/api-server/src/services/account/index.test.ts`
- `artifacts/api-server/src/routes/accounts.ts`
- `artifacts/api-server/src/routes/accounts.disabled.test.ts`
- `artifacts/api-server/src/routes/games.ts`
- `artifacts/api-server/src/lib/dto.ts`
- `artifacts/api-server/src/middlewares/error-handler.ts`
- `artifacts/playsyncer/src/domain/accounts/types.ts`
- `artifacts/playsyncer/src/domain/slots/types.ts`
- `artifacts/playsyncer/src/domain/permissions/permissions.ts`
- `artifacts/playsyncer/src/components/AccountCard.tsx`
- `artifacts/playsyncer/src/components/AccountFormModal.tsx`
- `artifacts/playsyncer/src/pages/GameDetailPage.tsx`
- `lib/db/src/schema/index.ts`
- `lib/db/src/schema/accounts.ts`
- `lib/db/src/schema/account-capacities.ts`
- `lib/db/src/schema/account-backup-codes.ts`
- `lib/db/src/schema/games.ts`
- `lib/db/src/schema/enums.ts`
- `lib/api-spec/openapi.yaml` (structure and existing paths)
- `lib/api-spec/orval.config.ts` (via subagent summary)
- `lib/api-spec/package.json` (via subagent summary)
- `lib/api-client-react/package.json` (via subagent summary)
- `lib/api-client-react/src/generated/api.ts` (existence, not full content)
- `fixtures/legacy/playSyncerMockData.ts` (referenced in DECISION_LOG as non-runtime)

## Appendix B — Files changed for this design

- `docs/PS-03D2-1-account-api-design.md` (new)
- `docs/CURRENT_PHASE.md` (updated to PS-03D2-1 status)

No runtime source, OpenAPI, generated client, schema, migration, or database changes were made.
