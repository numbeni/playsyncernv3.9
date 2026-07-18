# PS-03D5-1 — Account Mutation Contract and Security Activation Gate Audit

**Status:** `PS-03D5-1 — AUDIT COMPLETE, AWAITING COMMAND CENTER DECISIONS`

**Current HEAD SHA:** `b45ad14f85c7fa649d476772382108fc1fa3caa5`

**Report path:** `reports/ps03d5-1-mutation-security-gate-audit.md`

**Final git status:** only `attached_assets/` and this report are untracked; no source changes.

---

## 1. Scope and Method

This is a source-only audit. No source files, tests, migrations, OpenAPI specs, generated clients, or docs were modified. The inspection focused on:

- Account Domain Service
- Account database schema and Backup Code schema
- Encryption / lookup-hash implementation and key wiring
- Account identifier generation
- Duplicate-warning implementation
- Account delete rules
- API route registration and disabled mutation routes
- OpenAPI mutation contracts
- Generated API clients
- Account-related backend tests
- Read-only Account frontend
- Absence of Auth, RBAC, Audit Logging, and frontend test infrastructure
- `docs/CURRENT_PHASE.md` and `docs/DECISION_LOG.md`

---

## 2. Files Inspected

### Backend core
- `artifacts/api-server/src/services/account/index.ts` (L1–518)
- `artifacts/api-server/src/routes/accounts.ts` (L1–241)
- `artifacts/api-server/src/lib/crypto.ts` (L1–103)
- `artifacts/api-server/src/lib/account-status.ts` (L1–46)
- `artifacts/api-server/src/lib/dto.ts` (L1–104)
- `artifacts/api-server/src/lib/account-contract.test.ts` (L1–215)
- `artifacts/api-server/src/routes/accounts.test.ts` (L1–566)
- `artifacts/api-server/src/routes/accounts.disabled.test.ts` (L1–165)
- `artifacts/api-server/src/middlewares/error-handler.ts`
- `artifacts/api-server/package.json`

### Database schema
- `lib/db/src/schema/accounts.ts` (L1–81)
- `lib/db/src/schema/account-backup-codes.ts` (L1–27)
- `lib/db/src/schema/account-capacities.ts` (L1–52)
- `lib/db/src/schema/game-account-sequences.ts` (L1–36)
- `lib/db/src/schema/enums.ts` (L1–44)

### API contract / generated client
- `lib/api-spec/openapi.yaml` (L238–699)
- `lib/api-client-react/src/generated/api.ts` (inspected via grep and test contract)

### Frontend
- `artifacts/playsyncer/src/pages/GameDetailPage.tsx` (L230–270)
- `artifacts/playsyncer/src/components/AccountCard.tsx` (L1–300)
- `artifacts/playsyncer/src/components/AccountCardReadOnly.tsx`
- `artifacts/playsyncer/src/components/AccountDetailsReadOnly.tsx`
- `artifacts/playsyncer/src/components/AccountFormModal.tsx` (L1–240)
- `artifacts/playsyncer/src/components/AccountStatusBadge.tsx`
- `artifacts/playsyncer/src/domain/permissions/permissions.ts` (L1–42)
- `artifacts/playsyncer/package.json`

### Product / phase docs
- `docs/CURRENT_PHASE.md` (L1–42)
- `docs/DECISION_LOG.md` (relevant sections: PS-03B decisions L362–514, PS-03C2B Backup Code correction L534–554, PS-03D1 design corrections L555–end)
- `docs/PRODUCT_RULES.md` (L105–261)

---

## 3. Endpoint Inventory

| Endpoint | OpenAPI | Generated client | Route registration | Handler / Service | Status |
|---|---|---|---|---|---|
| `GET /games/{gameId}/accounts` | implemented (L238) | `useListAccounts` (L651) | implemented | `accounts.ts` L124–165 | **implemented** |
| `GET /accounts/{accountId}` | implemented (L276) | `useGetAccount` (L729) | implemented | `accounts.ts` L168–196 | **implemented** |
| `GET /accounts/{accountId}/capacities` | implemented (L314) | `useGetAccountCapacities` (L807) | implemented | `accounts.ts` L199–224 | **implemented** |
| `POST /games/{gameId}/accounts` | **missing** (no path) | **missing** | 403 stub | `createAccount` exists in domain service (L468–518) | **disabled / contract-only in service** |
| `PATCH /accounts/{accountId}` | **missing** | **missing** | 403 stub | **no update service function** | **disabled / missing** |
| `PATCH /accounts/{accountId}/status-override` | **missing** | **missing** | **not registered** | **no service function** | **missing** |
| `DELETE /accounts/{accountId}` | **missing** | **missing** | 403 stub | **no delete service function** | **disabled / missing** |
| Secret Reveal | **missing** | **missing** | **not registered** | **not implemented** | **disabled / missing** |
| Backup Code Reveal | **missing** | **missing** | **not registered** | **not implemented** | **disabled / missing** |

**Facts:**
- Only read-only Account endpoints are in the OpenAPI spec and generated client.
- `CreateAccountRequest` exists in OpenAPI (L625–663) and generated client as a schema, but no `createAccount` operation or hook is generated because the `POST /games/{gameId}/accounts` path is not declared in OpenAPI.
- `DuplicateWarningResponse` exists in OpenAPI (L664–683) and generated schemas.
- `UpdateAccountRequest`, `StatusOverrideRequest`, and any Delete response contract are **not present** in OpenAPI.

---

## 4. Fail-Closed Evidence

### Route-level disabling
`artifacts/api-server/src/routes/accounts.ts` (L226–239) hardcodes three mutation routes to return HTTP 403 with a constant message:

```ts
const ACCOUNT_OPS_DISABLED = "Account operations are not authorized";

router.post("/games/:gameId/accounts", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
});

router.patch("/accounts/:id", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
});

router.delete("/accounts/:id", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
});
```

### Zero-write verification
- `accounts.disabled.test.ts` (L86–125) asserts that POST / PATCH / DELETE return 403 and that `accounts` table row counts do not change.
- `accounts.test.ts` (L527–565) repeats the same assertion under the read-only suite.
- The 403 handlers do not call `db`, any domain service, or any transaction.

### No bypass identified
- No route in `accounts.ts` calls `createAccount`, `updateAccount`, or `deleteAccount`.
- No other route file was found registering `POST /games/:gameId/accounts`, `PATCH /accounts/:id`, or `DELETE /accounts/:id`.
- The generated client has no mutation hooks for accounts, so the active frontend cannot invoke them through the generated API client.
- Direct API requests to these paths receive 403.

### Assumption
- No bypass exists as long as the Express router is mounted as-is and no uninspected route file adds overlapping paths.

---

## 5. Create Account Readiness

### What is complete

| Requirement | Evidence | Verdict |
|---|---|---|
| Game existence validation | `requireGame` in `services/account/index.ts` L198–215 checks game exists, is not deleted, and is not `INACTIVE` | **complete** |
| Inactive Game rejection | `InactiveGameError` thrown if `game.status === "INACTIVE"` (L210–212) | **complete** |
| Account code generation | `allocateGlobalCode` (L318–327) uses `nextval('account_code_seq')` | **complete** |
| Display number generation | `allocatePerGameNumber` (L329–349) uses `game_account_sequences` with `UPDATE ... + 1 RETURNING` | **complete** |
| Concurrency protection | `pg_advisory_xact_lock` (L217–251) for duplicate locks; sequence `nextval` and atomic `UPDATE` for identifiers | **complete** |
| Input normalization | Emails trimmed and lowercased (L58–61, L185–191); Online ID trimmed (L63–66, L189–191) | **complete** |
| Duplicate detection | `findDuplicateFields` (L253–316) checks `psnEmailLookupHash`, `familyManagementEmailLookupHash`, and `LOWER(onlineId)` against non-deleted accounts | **complete** |
| Duplicate confirmation | `confirmed` flag in `CreateAccountInput` (L113); unconfirmed duplicates return `kind: "duplicate-warning"` (L478–494) | **complete** |
| Encryption | `encrypt()` from `crypto.ts` (L41–52, AES-256-GCM) used for all sensitive fields (L375–401) | **complete** |
| Lookup hashes | `hashForLookup` HMAC-SHA256 (L100–103) used for all duplicate/search fields (L376–400) | **complete** |
| Backup Code validation | `backupCodes` array min 1, each non-empty (L68–71, L112) | **complete** |
| Backup Code encryption | `insertBackupCodes` (L430–444) encrypts each code individually before insert | **complete** |
| Capacity template generation | `insertCapacities` (L410–428) uses `buildCapacityDefinitions` from `@workspace/db/helpers` | **complete** |
| Transaction boundary | `createAccount` wraps everything in `db.transaction` (L474–517) | **complete** |
| Safe response DTO | `toSafeAccount` (L74–87) strips all secret/encrypted/hash fields | **complete** |

### What is incomplete or conflicting

| Requirement | Conflict | Risk |
|---|---|---|
| `CreateAccountRequest` OpenAPI contract | `CreateAccountRequest` schema exists (L625–663) but no `POST /games/{gameId}/accounts` path operation, so the contract is not actually routable from the generated client. | Frontend cannot safely call the create endpoint even if the backend were enabled. |
| Duplicate response code / shape | Product rules require `HTTP 409` with `code: DUPLICATE_WARNING` and safe Persian message. The current service returns `200` with `{ kind: "duplicate-warning", duplicateFields: [...] }`. The route is currently 403, so the conflict is latent. | Once enabled, the response shape will not match the approved contract unless the service or route is changed. |
| `confirmed` default | `confirmed` defaults to `false` (L113), which is correct. | None. |
| Birth date format | `CreateAccountInput` enforces `YYYY-MM-DD` (L73–101). | Consistent with product rules. |

### Decision required
- Should the duplicate-warning response be converted from the current `200 + kind` service return to the approved `409 + DUPLICATE_WARNING` route response before the create endpoint is activated?

---

## 6. Edit Account Readiness

### Current state
- **No `updateAccount` service function exists** in `services/account/index.ts`.
- **No `PATCH /accounts/{accountId}` OpenAPI contract exists**.
- **No generated `useUpdateAccount` hook exists**.
- The route returns 403 and performs zero writes.

### Editable / immutable fields
Based on the `accounts` schema and `CreateAccountInput`, the natural editable fields would be:
- Editable non-sensitive: `onlineId`, `birthDate`.
- Editable sensitive (require re-encryption + lookup-hash regeneration): `psnEmail`, `psnPassword`, `emailPassword`, `familyManagementEmail`.
- Immutable per product rules: `id`, `accountCode`, `displayNumber`, `gameId`, `createdAt`.
- Prohibited: `accountNumberPrefix`, `accountNumberSeq`, `status` (status is derived except for override).

### Backup Code update behavior
There is **no service function or contract** for editing Backup Codes. The `account_backup_codes` table is storage-only (no status/hash/used_at). A decision is needed whether editing an Account replaces all Backup Codes, appends, or is disallowed.

### Decisions required
- Which sensitive fields may be edited?
- Does editing a sensitive field require duplicate confirmation (re-run `findDuplicateFields`)?
- What is the Backup Code replacement behavior on edit?

---

## 7. Status-Override Readiness

### Current state
- **No `PATCH /accounts/{accountId}/status-override` route exists**.
- **No service function exists** for status override.
- The schema only allows `status_override` enum values `SOLD` and `INACTIVE` (`lib/db/src/schema/enums.ts` L11–14), which matches the product rule.
- `deriveAccountStatus` (`account-status.ts` L22–46) correctly implements the precedence: `INACTIVE` override > `SOLD` override > all finished = `SOLD` > all available = `AVAILABLE` > mixed = `PARTIALLY_SOLD`.

### Conflicts
- The `AccountFormModal.tsx` (L76, L110–111, L212) treats `status` as an editable field with values like `"active"`, which is **not** the approved Account status model. This component is not currently used by the read-only page, so it is a latent conflict, not an active one.

### Decisions required
- Should the status-override endpoint accept `SOLD`, `INACTIVE`, or `null` only?
- Should the frontend expose an override control or a simple enable/disable toggle?
- What should happen when an override is cleared (`null`)? The derivation logic is ready.

---

## 8. Account Deletion Readiness

### Current state
- **No `deleteAccount` service function exists**.
- **No `DELETE` route contract exists** beyond the 403 stub.
- The schema uses `deletedAt` (soft delete marker) on `accounts`.
- The `accounts.disabled.test.ts` and `accounts.test.ts` test helpers use `deletedAt` for soft delete.

### Assignment history representation
- `capacity_customers` is the current de-facto Assignment history table.
- Read-only routes treat any non-deleted, `active` row in `capacity_customers` as an active customer assignment.
- Historical rows with `status = "removed"` or `status = "cancelled"`, or rows with a non-null `deletedAt`, are ignored by the status derivation (see `loadActiveCustomerCapacityIds` in `accounts.ts` L82–103).

### Conflict / blocker
- Product rules say hard delete is allowed only when no current or historical Assignment exists. `capacity_customers` is **not** the approved final Assignment model (`docs/DECISION_LOG.md` L460–465, `docs/PRODUCT_RULES.md` L225–230). The audit therefore classifies deletion dependency as:

> **MUST FIX BEFORE ACCOUNT DELETE ACTIVATION**

### Decisions required
- Is `capacity_customers` (current + historical rows) sufficient evidence of Assignment history for the PS-03D5 delete gate, or must the final Assignment model be approved first?
- Should deleted Accounts have their identifiers permanently blocked from reuse? The current schema constraints (`accounts_account_code_unique`, `accounts_game_seq_unique`, `accounts_game_display_unique`) would block reuse of the same code/number while the row exists, but a hard delete would remove that protection unless a separate tombstone/audit table is added.

---

## 9. Security Risks

| Risk | Severity | Evidence | Mitigation state |
|---|---|---|---|
| Mutation routes currently disabled | Low | 403 stubs | Acceptable for current read-only phase. |
| `can()` returns `true` for all actions | **Medium** | `permissions.ts` L40–42 | AccountCard mutation UI is not used by the active read-only page, so no active bypass. If the page switches to `AccountCard`, all mutation actions become visible. |
| `AccountFormModal` has stale mutation logic | **Medium** | `AccountFormModal.tsx` L1–485 | Not currently mounted; contains editable status field and YYYY/MM/DD birth date, both of which conflict with approved rules. |
| No Auth/RBAC middleware | **High** | `middlewares/` only has `error-handler.ts` | Required before any Account mutation route activation. |
| No actor-aware Audit Logging | **High** | No audit-log middleware or service | Required before any Account mutation route activation. |
| Encryption key wiring | Low | `loadAccountMasterKey` wired; `crypto.ts` docblock still says "NOT wired" (L4–6) | Docblock is stale; actual wiring is correct. |
| Generated client lacks mutation hooks | Low | `account-contract.test.ts` L160–178 | Prevents accidental frontend mutation calls. |

**No active security bypass** was found for the current read-only configuration.

---

## 10. Sequencing Options

### Option A — Implement backend mutations now, keep routes disabled until Auth/RBAC/Audit exist
- **Advantages:** Backend code can be written and tested in isolation; frontend test foundation can be built in parallel; minimal rework once gates are met.
- **Risks:** Some delete/Assignment-history decisions remain unresolved; code may sit disabled for a while.
- **Rework risk:** Low if contracts are finalized first.
- **Recommendation:** **Preferred.**

### Option B — Build Auth/RBAC/Audit first, then implement mutations
- **Advantages:** Activation is safer; no mutation code exists before controls exist.
- **Risks:** Longer time to value; may delay discovery of domain-edge cases until later.
- **Rework risk:** Low, but slower.
- **Recommendation:** Feasible, but not necessary if routes remain disabled.

### Option C — Implement and activate mutations before Auth/RBAC/Audit
- **Advantages:** Fastest functional delivery.
- **Risks:** Violates product rules; Secret Reveal and mutation activation are explicitly blocked until Auth/RBAC/Audit exist; high security risk.
- **Rework risk:** Very high.
- **Recommendation:** **Not acceptable.**

---

## 11. Recommended Sequence

Adopt **Option A** with the following sub-stages:

1. **PS-03D5-2 — Frontend Test Foundation:** Add a test runner (Vitest) to `artifacts/playsyncer`, plus at least form validation, duplicate-confirmation, submission lock, and error-state tests.
2. **PS-03D5-3 — Create Account Backend, Runtime Disabled:** Add `POST /games/{gameId}/accounts` to OpenAPI, generate the client, implement the route handler using the existing `createAccount` service, and keep the route disabled (or behind a feature flag). Convert duplicate warning to the approved `409 + DUPLICATE_WARNING` contract.
3. **PS-03D5-4 — Update and Status Override Backend, Runtime Disabled:** Add `PATCH /accounts/{accountId}` and `PATCH /accounts/{accountId}/status-override` OpenAPI contracts, generated clients, and route handlers. Implement `updateAccount` and `setStatusOverride` services. Keep routes disabled.
4. **PS-03D5-5 — Delete Account Backend, Runtime Disabled:** Add `DELETE /accounts/{accountId}` contract and handler. Resolve the Assignment-history dependency (`capacity_customers` vs final model). Keep route disabled.
5. **PS-03D5-6 — Read-Write Frontend, Activation Disabled:** Replace `AccountCardReadOnly` with a hardened `AccountCard`, implement mutation hooks, duplicate-confirmation dialog, and loading locks. Keep controls hidden or disabled.
6. **PS-03D5-7 — Verification and Pre-Activation Closure:** Full typecheck, backend tests, frontend tests, and a final readiness checklist. **Do not activate runtime routes here.**
7. **PS-03D7 — Auth, RBAC, actor-aware Audit Logging, and Runtime Activation:** Activate mutation routes only after this separate phase is approved and implemented.

**What must wait for PS-03D7:**
- Secret Reveal / Backup Code Reveal.
- Runtime activation of any Account mutation route.
- Customer Assignment writes (already outside PS-03D5 per product rules).

---

## 12. Activation Gates

### Backend Implementation Gate (before writing mutation code)
- [ ] OpenAPI contracts for Create, Update, Status Override, and Delete approved.
- [ ] Generated client hooks and schemas regenerated and typecheck passes.
- [ ] `PLAYSYNCER_ACCOUNT_MASTER_KEY` secret is present and valid in all environments.
- [ ] Duplicate-warning response shape converted to `409 + DUPLICATE_WARNING` if required.

### Backend Runtime Activation Gate (before routes stop returning 403)
- [ ] Auth middleware exists and is enforced on all mutation routes.
- [ ] RBAC middleware exists and checks `account.create`, `account.edit.*`, `account.disable`, `account.delete`.
- [ ] Actor-aware Audit Logging writes an immutable record for every mutation.
- [ ] All mutation routes have route-level tests covering 401/403 when unauthenticated/unauthorized.
- [ ] Delete endpoint has a definitive Assignment-history check (final model or interim rule approved by Command Center).

### Frontend Read-Write Activation Gate (before users can use mutation controls)
- [ ] Frontend test runner configured.
- [ ] Form validation tests for Account create/edit.
- [ ] Duplicate-warning confirmation flow tested.
- [ ] Loading/submission state and duplicate-submission prevention tested.
- [ ] API error handling and retry tested.
- [ ] Cache invalidation and Account list refresh tested.
- [ ] `can()` permission function is no longer hardcoded to `true`.
- [ ] Unauthorized / fail-closed behavior tested.

### Secret Feature Gate (before Secret Reveal / Backup Code Reveal)
- [ ] Auth + RBAC + actor-aware Audit Logging verified.
- [ ] Separate Reveal API contract approved.
- [ ] Reveal routes implemented and tested.
- [ ] Frontend Reveal UI tested.

---

## 13. Required Decision Table

| Decision | Options | Main risk | Recommendation | Requires approval |
|---|---|---|---|---|
| Implement mutations before Auth | A) Yes, keep disabled. B) No, build Auth first. C) Activate before Auth. | C is a security violation; B is slower. | **A** — implement disabled, activate only after PS-03D7. | Yes |
| Runtime activation timing | A) Inside PS-03D5. B) Deferred to PS-03D7. | A violates product rules. | **B** — defer to PS-03D7. | Yes |
| Frontend test foundation timing | A) Before mutation UI. B) After mutation UI. | B allows untrusted UI to be built first. | **A** — tests first. | Yes |
| Frontend mutation implementation timing | A) Implement but keep disabled. B) Wait until tests exist. | B blocks backend verification. | **A** — implement disabled, but only after test runner exists. | Yes |
| Deletion dependency on Assignment history | A) Use `capacity_customers` as interim history. B) Wait for final Assignment model. | A may bake in a non-canonical model. | **B** — wait for final model, or add an explicit interim rule with a sunset date. | **Yes** |
| Sensitive-field update behavior | A) Re-encrypt + regenerate hash. B) Disallow sensitive edits. | A requires duplicate confirmation; B limits functionality. | **A** for email/password fields, with duplicate confirmation. | Yes |
| Backup Code update or replacement behavior | A) Replace all on edit. B) Append only. C) Disallow edit. | A is destructive; B/C are simpler. | **A** — replace all on edit, with at least one required. | Yes |

---

## 14. Conflicts Found

| Conflict | Location | Severity | Resolution required |
|---|---|---|---|
| `CreateAccount` duplicate warning returns `200` shape instead of `409 + DUPLICATE_WARNING` | `services/account/index.ts` L491–493 vs product rules | Medium | Decide whether to change service return or route-level response before activation. |
| `AccountFormModal` allows editing a status field with `"active"` value | `AccountFormModal.tsx` L76, L110–111, L212 | Medium | Remove status editing from the form; status is derived except for SOLD/INACTIVE override. |
| `AccountFormModal` birth date format is `YYYY/MM/DD` | `AccountFormModal.tsx` L34–35 | Low | Change to `YYYY-MM-DD` per product rules. |
| `permissions.ts` `can()` always returns `true` | `permissions.ts` L40–42 | Medium | Replace with real RBAC before any mutation UI is activated. Currently safe because the mutation card is not used. |
| `crypto.ts` docblock says utilities are "NOT wired" | `crypto.ts` L4–6 | Low | Update docblock; actual wiring is correct in `services/account/index.ts`. |

---

## 15. Assumptions

- The Express router in `accounts.ts` is the only place registering the three mutation paths; no other route file overlaps them.
- `capacity_customers` is the current interim Assignment representation, but the Command Center has not yet approved it as the final Assignment model.
- `PLAYSYNCER_ACCOUNT_MASTER_KEY` is intended to be provided via Replit Secrets before any mutation is exercised.
- The current read-only frontend (`AccountCardReadOnly`) will remain active until PS-03D5-6.

---

## 16. Final Status

`PS-03D5-1 — AUDIT COMPLETE, AWAITING COMMAND CENTER DECISIONS`

No source files were modified. No migrations, dependencies, or tests were added. The report is ready for Command Center review.
