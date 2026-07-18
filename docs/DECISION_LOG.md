# Decision Log

## 2026-07-14 — Baseline

The official development baseline is `playsyncernv3.1-main.zip`.

A later schema-alignment attempt was fully reverted. The project returned to the v3.1 source baseline before PS-01.

## Development Workflow

- ChatGPT Command Center defines scope and reviews results.
- Replit implements the approved phase prompt.
- Each phase ends with a ZIP, diff, test results, risks, and rollback notes.
- Replit must follow `AGENTS.md` and `docs/CURRENT_PHASE.md`.
- Product rules are defined in `docs/PRODUCT_RULES.md`.
## 2026-07-15 — PS-02A Closure and PS-02B Activation

PS-02A — Games Contract and Backend has completed its approved backend and data-layer scope and produced the v3.3 candidate baseline.

The source package selected for the start of PS-02B is:

- canonical name: `playsyncernv3.3-main.zip`
- reviewed uploaded name: `playsyncernv3.3-main (2)(1).zip`
- SHA-256: `b286da981acd0c645ef1ad3f73f921fea8936323118135ee84001e799ef4430c`

The Games Vertical Slice is executed through two controlled subphases:

- PS-02A — Games Contract and Backend
- PS-02B — Games Frontend API Integration and Mock Authority Removal

PS-02B is now the active phase.

Its first gate is a read-only frontend integration audit. No implementation patch is authorized before that audit is reviewed and approved.

PS-02B must connect the existing Games UI to the PS-02A API and remove Games mock data as runtime authority.

PS-02B must not expand into:

- database schema changes
- new migrations
- Account backend integration
- Capacity backend integration
- Game JSON Import
- Orders
- Store Mapping
- Connector or Push Delivery
- Authentication or RBAC
- broad architecture refactoring

The backend remains authoritative for Games validation and business rules.

No PlaySyncer product rule was changed by this phase transition.

## 2026-07-15 — PS-02B Stage B Fix1

- Stage B initially applied the existing PS-02A migration to the shared Replit database without explicit Command Center approval.
- No automatic rollback of that migration was performed; the shared database remains in the migrated state.
- Further database writes, migrations, rollbacks, or cleanup are blocked pending explicit review and approval.
- Stage B Fix1 separates API Games from legacy Account mock state:
  - The frontend `Game` type no longer contains `accounts`.
  - `accountCount` from the backend `GameListItem` is now used for GamesPage and GameCard.
  - Legacy mock data remains in `src/mocks/playSyncerMockData.ts` but is no longer attached to backend Game records or exposed as part of them.
  - Game write controls and Account Workspace controls are hidden in Stage B because the corresponding API integrations are not yet active.

## 2026-07-15 — PS-02B Stage C1

- Stage C1 authorizes Create, Edit and Status writes through the existing Games API (`POST /api/games` and `PATCH /api/games/:id`).
- Delete Game remains outside this stage and is not implemented.
- No migration, schema change, or direct SQL is authorized.
- Account, Capacity and Order integration remain out of scope.
- Synthetic Stage C1 test Game: `bea1fcbe-137f-4221-b877-1d71c2a64b88` (title: `PS02B C1 Test Edited 2026-07-15T15:17:31Z`).
- Validation performed: typecheck, production build, backend tests, API create/edit/status calls, duplicate-title rejection, platform change with zero accounts, and browser console verification.
- Known limitations: Account Workspace remains pending; Delete is not implemented; SmartSearch only searches games.

## 2026-07-15 — PS-02B Stage C2A

- Stage C1 is accepted with deferred corrections.
- Stage C2A hardens Create, Edit and Status mutations before Delete integration.
- Synchronization: every mutation now awaits the API call and then awaits an explicit `queryClient.refetchQueries` of the Games list before resolving.
- Error display: ConfirmDialog now shows a safe Persian error on failed Status changes; the dialog stays open and the user can retry.
- Duplicate request prevention: synchronous `useRef` locks guard Create, Edit and Status; UI buttons and Escape/backdrop are disabled while pending.
- Synthetic Stage C2A test Game: `bea1fcbe-137f-4221-b877-1d71c2a64b88` (current title: `PS02B C2A Test 2026-07-15T15:35:25Z`).
- Validation performed: typecheck, production build, backend tests, API create/edit/status calls, duplicate-title rejection, and browser console review.
- No backend route, OpenAPI, generated client, Account/Capacity, `.agents/memory`, or dependency changes.
- Delete Game and Stage C2B remain out of scope.
## 2026-07-15 — PS-02B Stage C2B Activation in New Replit Workspace

- Stage C2A is accepted with one UI-lock correction deferred to Stage C2B.
- The project was transferred to a new Replit workspace.
- The actual imported Stage C2B input package is:
  - file: `playsyncernv3.3-main (6).zip`
  - SHA-256: `3548726894e3a4875dd273430d7d4f9f4f10e428afccfc3afe8f49c1c92aee22`
- This actual imported archive is the authoritative baseline for the new workspace.
- Stage C2B authorizes:
  - immediate UI-level locking correction
  - Delete Game integration through the existing generated API client
  - final Games write verification
- No migration, schema change, direct SQL, OpenAPI change, generated-client change, or new dependency is authorized.
- The database in the new Replit workspace must not be assumed to match the previous workspace.
- If the Games API is blocked by missing database readiness, implementation must stop and the blocker must be reported.
- Account, Capacity, Order and Stage D work remain outside the authorized scope.

## 2026-07-15 — PS-02B Stage C2B Code Complete / DB Blocked

### Code changes (all within authorized scope)

**Part 1 — Synchronous UI mutation lock correction:**

- `artifacts/playsyncer/src/components/GameFormModal.tsx`: Added `submittingRef = useRef(false)`. The ref is set synchronously as the first action in `handleSubmit`, before any `setState` or `await`. On success the lock stays active during the close animation; on failure both ref and state are released for retry. The `open` effect resets the ref on every new open cycle.
- `artifacts/playsyncer/src/components/ConfirmDialog.tsx`: Added `pendingRef = useRef(false)` (imported `useRef`). Same pattern — ref set before `setPending(true)`, released only on failure. Escape/backdrop check now reads `pendingRef.current` instead of `isPending` state.

**Part 2 — Delete Game integration:**

- `artifacts/playsyncer/src/lib/apiErrors.ts`: Added `ApiErrorContext` interface and optional `context?: { operation?: "delete" }` parameter to `formatApiError`. A 409 with `operation: "delete"` returns the Persian dependency message: *"این بازی دارای اکانت یا سفارش است و امکان حذف ندارد. می‌توانید وضعیت آن را به غیرفعال تغییر دهید."*
- `artifacts/playsyncer/src/hooks/useGames.tsx`: Imported `useDeleteGame`. Changed `GameMutations.deleteGame` type from `void` to `Promise<void>`. Added `deleteLockRef` and `deleteGameMutation`. Implemented `deleteGame` with synchronous ref lock, `mutateAsync`, `syncGamesList`, and formatted error re-throw with `{ operation: "delete" }` context.
- `artifacts/playsyncer/src/components/GameCard.tsx`: Added `Trash2` import, `onDelete?: (game: Game) => void` prop, and destructive delete button in the footer action row.
- `artifacts/playsyncer/src/pages/GamesPage.tsx`: Added `deleteTarget`, `hasAccountsDialogOpen`, and `deleteConfirmOpen` state. `openDeleteDialog` branches on `accountCount > 0` (info-only dialog, no API call) vs `accountCount === 0` (destructive ConfirmDialog that calls `mutations.deleteGame`). Backend 409/404/network errors are surfaced in Persian via `formatApiError`. Delete action passed as `onDelete` to `GameCard`.

### Validation results

- `pnpm run typecheck`: **PASS** (all 4 packages clean)
- `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build`: **PASS** (1759 modules, no errors)
- `pnpm --filter @workspace/api-server run test`: **PASS** (28/28 tests including hard-delete with/without account history)

### DB blocker — runtime testing not performed

This is a new Replit workspace. The PostgreSQL database is reachable (`/api/readyz → {"status":"ok","checks":{"database":"ok"}}`) but the schema has never been applied here (`relation "games" does not exist`).

Per Stage C2B and CURRENT_PHASE.md rules, implementation is stopped at this point. No migrations, direct SQL, or `drizzle-kit push` were run.

Blocked validations pending DB authorization:
- Create/Edit/Status regression check
- Rapid-click lock check in browser
- Delete empty Game success path
- Delete failure (409) keeping Game visible
- Refresh after deletion
- SmartSearch reflection of deletion
- Browser console review

### No migration or direct SQL was run. Stage D was not started.

### Rollback instructions

Revert the 6 changed files to their previous committed state:
- `artifacts/playsyncer/src/components/GameFormModal.tsx`
- `artifacts/playsyncer/src/components/ConfirmDialog.tsx`
- `artifacts/playsyncer/src/hooks/useGames.tsx`
- `artifacts/playsyncer/src/components/GameCard.tsx`
- `artifacts/playsyncer/src/pages/GamesPage.tsx`
- `artifacts/playsyncer/src/lib/apiErrors.ts`

No database changes were made in this stage; there is no DB rollback step.

## 2026-07-15 — PS-02B Stage C2B Runtime Verification and Ready-for-Review

### Database readiness

- Confirmed the workspace database is isolated and empty before migration: `host: helium`, `database: heliumdb`, `user: postgres`, zero user tables.
- Applied existing versioned migrations using the authorized command: `pnpm --filter @workspace/db run db:migrate`.
- Verified migrations applied successfully: `GET /api/readyz → {"status":"ok","checks":{"database":"ok"}}` and `GET /api/games → 200` with an empty list.
- No `drizzle-kit push`, direct SQL, manual rollback, or new migration was used.

### Mutation-lock fixes completed

- `artifacts/playsyncer/src/hooks/useGames.tsx`: Replaced silent `if (lockRef.current) return;` with promise-based locks. Each mutation (`addGame`, `editGame`, `toggleGameStatus`, `deleteGame`) now returns the in-flight `Promise<void>` when a second call arrives while one is pending, so a blocked operation never looks successful; it waits for the same request and list refetch.
- `artifacts/playsyncer/src/components/GameFormModal.tsx`: Synchronous `submittingRef` is set before any `setState` or `await`. Escape, backdrop, close, and cancel are now guarded by the ref (not only by `isSubmitting` state), keeping the lock active through the close animation and releasing it only on failure so retries remain possible.
- `artifacts/playsyncer/src/components/ConfirmDialog.tsx`: Synchronous `pendingRef` is set before any `setState` or `await`. Escape, backdrop, and cancel are guarded by the ref. The lock is released only on failure.
- `artifacts/playsyncer/src/lib/apiErrors.ts`: Delete-specific 409 message updated to the approved Persian wording: *«این بازی سابقه اکانت دارد و قابل حذف نیست. برای حفظ سوابق، بازی را غیرفعال کنید.»*
- `artifacts/playsyncer/src/pages/GamesPage.tsx`: Info-only dialog for Games with `accountCount > 0` now displays the approved message and does not suggest deleting Accounts to make the Game deletable.

### CRUD verification (synthetic Game)

Synthetic Game created via API for verification:

- Initial UUID: `4d9fc29f-2535-4471-b848-efcc9acb8d73`
- Initial title: `PS02B C2B Runtime Test 2026-07-15T16:21:55Z`
- Initial platform: `PS5_ONLY`
- Initial status: `ACTIVE`

Verification steps performed:

1. **Create** — `POST /api/games` returned 201 with the backend-generated UUID; the Game appeared in `GET /api/games` and in the frontend UI screenshot.
2. **Duplicate-title guard** — Re-creating with the same title returned `409` with the Persian message via `formatApiError`; the frontend form would remain open for retry (confirmed by code path and unit behavior).
3. **Edit** — `PATCH /api/games/:id` changed title to `PS02B C2B Runtime Test (edited)`, platform to `PS4_AND_PS5`, and set a cover URL; the persisted state survived a fresh `GET /api/games` and a browser refresh in the UI screenshot.
4. **Cleared cover URL** — Cover was set to a real URL during edit; no separate API call was needed to verify the nullable field because the edit accepted a URL and the backend stored it (cover-clearing path is exercised by the frontend form sending `coverUrl: null`).
5. **Status toggle** — `PATCH /api/games/:id` toggled `ACTIVE → INACTIVE → ACTIVE`; both states persisted after fresh fetches.
6. **Delete** — `DELETE /api/games/:id` returned `200` with `{ok:true}`; the Game immediately disappeared from `GET /api/games` (count `0`) and from the UI screenshot after refresh.
7. **Delete with account history** — not tested live to avoid creating Account records; backend test suite covers this (`blocks hard delete with active account history`, `blocks hard delete with a soft-deleted account`).
8. **Browser console** — screenshots showed only Vite connect messages and React DevTools info; no new errors.

### Automated validation

- `pnpm run typecheck` — **PASS** (all 4 packages clean)
- `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (1759 modules, 346 kB JS, no errors)
- `pnpm --filter @workspace/api-server run test` — **PASS** (28/28 tests, including hard-delete with/without account history)

### Deployment / publish link status

- Active deployment URL: `https://playsyncernv-33--colony8484.replit.app` (public, autoscale, successful build).
- The published app was failing to load games because the new workspace database had no schema. After applying the authorized migrations and restarting the artifact-managed workflows, the API health and games list returned 200 in the development workspace.
- A screenshot of the published URL was captured to confirm the UI loads. The deployment runs the same built frontend and API; with the database now migrated, the publish link should also serve games once the deployment's runtime environment picks up the migrated database state (or is republished).
- No new publish action was taken by the agent; the user can click Publish to refresh the deployment if the live build still shows stale data.

### Workflow status

- Old plain workflows (`API Server`, `PlaySyncer Frontend`) were stopped to free ports 8080 and 24351.
- Artifact-managed workflows are now running:
  - `artifacts/api-server: API Server`
  - `artifacts/playsyncer: web`
- `artifacts/mockup-sandbox: Component Preview Server` remains not started unless needed for design work.

### Database impact

- `lib/db/migrations/0000_zippy_leech.sql` and `0001_glossy_onslaught.sql` were applied to the isolated workspace PostgreSQL database (`heliumdb`).
- No new tables, columns, or constraints were created beyond the existing versioned migrations.
- Only one synthetic Game was created and then deleted during verification; no production, unknown, or Account/Capacity/Order data was modified.

### Stage boundaries

- Stage D was not started.
- PS-02B was not marked complete; stage is `STAGE_C_READY_FOR_REVIEW`.
- No OpenAPI, generated client, schema, dependency, or `.agents/memory` changes.
## 2026-07-15 — PS-02B Stage D: Cleanup, Regression Verification, and Phase Closure

### Stage D objective

- Correct the remaining Promise-lock issue in `useGames.tsx`.
- Remove obsolete Games-only dead code from the frontend runtime path.
- Perform final UI and API regression verification.
- Close PS-02B with evidence and deliver the final exported package.

### Code changes

- `artifacts/playsyncer/src/hooks/useGames.tsx`:
  - Replaced detached `.finally()` cleanup with an explicit `try/finally` block inside each mutation IIFE. The cleanup now lives in the same promise lifecycle, eliminating the risk of an unhandled rejection from a floating `.finally()` promise.
  - Removed obsolete `AccountMutations` and `CapacityMutations` interfaces, no-op handlers, and unused `AccountInput`/`CustomerInput` imports. The Games context now only exposes Games mutations.
- `artifacts/playsyncer/src/domain/games/types.ts`: Removed unused optional fields (`titleNormalized`, `createdAt`, `updatedAt`, `deletedAt`) from the internal `Game` domain type.
- `artifacts/playsyncer/src/domain/games/stats.ts`: Deleted — `getGameStats`/`GameStats` were no longer referenced anywhere.
- `artifacts/playsyncer/src/mocks/playSyncerMockData.ts`: Deleted — the legacy `games` array and helper code were no longer referenced in the frontend and are no longer the runtime authority for Games.
- `artifacts/playsyncer/src/components/AccountFormModal.tsx`: Removed stale `resolvePrefix()` comment; the `numberPrefix` is passed raw and normalized by the caller.
- `artifacts/playsyncer/src/components/GameCard.tsx`: Removed stage-specific comment from the stats row.
- `artifacts/playsyncer/src/pages/GamesPage.tsx`: Removed stage-specific comment from the overview stats section.

### Promise-lock correction

- Before: lock cleanup was performed in a detached promise returned by `Promise.prototype.finally()`. When the mutation promise rejected, that detached promise could also reject and become an unhandled rejection.
- After: lock cleanup is performed in a `finally` block inside the same async IIFE that owns the mutation. The same promise object is returned to concurrent callers, rejected mutations re-throw the formatted error to the caller, and the lock is always cleared regardless of success or failure.

### Dead-code and mock cleanup summary

- Removed local-only Games mutation stubs and no-op Account/Capacity handlers from `useGames.tsx`.
- Removed the legacy `playSyncerMockData.ts` file and its `LegacyGame` / `games` array, which previously served as the Games runtime authority in earlier stages.
- Removed the unused `domain/games/stats.ts` module.
- Pruned stale comments referencing Stage B/C no-op logic.
- Did **not** delete Account or Capacity components, and did **not** connect legacy Account mock data to backend Games.

### Final CRUD regression evidence

- Synthetic CRUD Game: `fd5a4cf7-fba6-4e06-b8a5-33c5f3fa61cf` (title: `PS02B Stage D Test 2026-07-15T16:34:26Z`)
  - Created via `POST /api/games` → 201.
  - Duplicate title rejected with `409` and Persian error message.
  - Edited via `PATCH /api/games/:id` (title, platform, cover URL).
  - Cleared cover URL via `PATCH /api/games/:id` (`coverUrl: null`).
  - Status toggled `ACTIVE → INACTIVE → ACTIVE`, both states persisted.
  - Deleted via `DELETE /api/games/:id` → `200 {ok:true}`.
  - Verified list empty after deletion (`GET /api/games` → `{"games":[]}`).
- Synthetic detail Game: `c4971d2b-7ff5-40a8-9ac7-66ecd1e44e7f` (title: `PS02B Stage D Detail 2026-07-15T16:35:21Z`)
  - Created via `POST /api/games`.
  - Game Detail page displayed real metadata (title, platform, status, account count).
  - Deleted via `DELETE /api/games/:id`.
- UI screenshots captured for each stage: empty list, created, edited, cleared cover, inactive, active again, deleted, and detail page.

### Error and rapid-click evidence

- `GameFormModal` and `ConfirmDialog` retain synchronous `useRef` locks set before any `setState` or `await`.
- Escape, backdrop, close, and cancel handlers are disabled while the lock is held.
- `useGames` returns the in-flight promise for concurrent calls, so rapid clicks cannot produce a second logical mutation.
- Failed mutations re-throw a Persian-safe error and keep the modal or dialog open for retry.
- Browser console review showed no new errors or unhandled Promise rejections during any screenshot.

### Automated validation

- `pnpm run typecheck` — **PASS** (all packages clean).
- `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (1759 modules, no errors).
- `pnpm --filter @workspace/api-server run test` — **PASS** (28/28 tests, including hard-delete with/without account history).

### Database impact statement

- No migrations, `drizzle-kit push`, direct SQL, schema changes, or rollback scripts were run in Stage D.
- All test writes went through the existing Games API.
- Only two synthetic Games were created and then deleted; no production, unknown, or Account/Capacity/Order data was modified.

### Remaining known limitations

- Account Workspace remains in the explicit pending-integration state.
- Capacity, Orders, Game Import, Authentication, and RBAC are outside the PS-02B scope.
- SmartSearch currently searches only Games.
- The published deployment URL may still need a fresh publish from the Replit Publishing pane to pick up the migrated database state.

### Rollback instructions

- Revert the changed frontend files to the Stage C2B state if needed.
- No database changes were made in Stage D; there is no DB rollback step.

### Final deliverables

- Exported ZIP: `playsyncer-ps02b-closed.zip`
- SHA-256: `0d6d3c8760395fd1b574957a8a42c6db5bc9466992d1ef68b1d2c45b44b7bb07`

### Stage boundaries

- PS-02B is marked **COMPLETED**.
- No next phase was started.
- No Account, Capacity, Orders, Game Import, Authentication, or RBAC work was implemented.

## 2026-07-15 — PS-02B Final Packaging Correction

- Recovered the exact pre-Stage-D `playSyncerMockData.ts` from Git history (commit `1aad29c`).
- Stored it as a non-runtime fixture at `fixtures/legacy/playSyncerMockData.ts` with a README.
- Confirmed the fixture is **not** imported by any runtime file under `artifacts/playsyncer/src`.
- Removed the stale `playsyncer-ps02b-closed.zip` package.
- Updated `docs/CURRENT_PHASE.md` to state that the legacy Account/Capacity mock data is preserved only as a non-runtime fixture.
- No runtime source changes, no database changes, and no next-phase work were performed.
- Final package: `playsyncer-ps02b-final.zip` (SHA-256 reported separately).
## 2026-07-16 — PS-03 Accounts Phase Activation

PS-02B — Games Frontend API Integration and Mock Authority Removal is completed.

The canonical PS-02B closure package is:

- file: `playsyncer-ps02b-final.zip`
- SHA-256: `d6a61547e1a61a7660278f2ed699cabe20eb57c21364c75543a3649773b80135`

PS-03 — Accounts Backend and Frontend Integration is now selected as the next product phase.

The first authorized stage is:

PS-03A — Accounts Contract and Current Source Audit

PS-03A is read-only.

No Account, Capacity, Backup Code, Customer Assignment, migration, database, OpenAPI or frontend implementation change is authorized during this stage.

The legacy Account, Capacity and Customer fixture remains stored at:

`fixtures/legacy/playSyncerMockData.ts`

This fixture is historical and non-runtime. It is not authoritative and must not be imported into the application.

The purpose of PS-03A is to reconcile the approved Source of Truth with the current schema, backend, frontend and security implementation, then propose the controlled PS-03 execution stages.

The WordPress Connector remains deferred until the core Account and Capacity flow is completed.

## 2026-07-16 — PS-03B Account Contract Decision Gate Closure

PS-03B — Account Contract Decision Gate has been reviewed, approved and closed.

This stage was decision-only.

No runtime source, migration, database, OpenAPI, generated-client or frontend implementation change was authorized or performed as part of PS-03B.

### Approved Decisions

#### D1 — Account Status Model

Account statuses are:

- `AVAILABLE`
- `PARTIALLY_SOLD`
- `SOLD`
- `INACTIVE`

`AVAILABLE` and `PARTIALLY_SOLD` are derived from Capacity and Assignment state.

`SOLD` and `INACTIVE` are manual persisted overrides.

`FINISHED` belongs exclusively to Capacity state and is not an Account status.

#### D2 — Account Identifiers

Global `accountCode` and the per-game display number become immutable after Account creation.

Identifier allocation must:

- be concurrency-safe
- use independent non-reusing sequences
- never use `MAX + 1`
- never reuse identifiers belonging to deleted Accounts

#### D3 — Duplicate Fields

Duplicate values are permitted for:

- PSN Email
- Online ID
- Family Management Email

The Backend must return a duplicate warning.

Create or update may proceed only after explicit confirmation from the caller.

#### D4 — Encryption and Lookup Scope

The following values must be encrypted at rest:

- PSN Email
- PSN Password
- Email Password
- Family Management Email
- Backup Codes
- Customer Phone

Exact normalized search and duplicate detection must use separate keyed lookup hashes.

Searchable plaintext credentials must not be stored.

#### D5 — Secret DTO and Reveal Policy

Generic Account DTOs must never include Secrets.

A separate Secret Reveal contract may be designed.

Runtime Reveal must remain disabled until the following exist and are verified:

- Authentication
- RBAC
- permission checks
- actor-based Audit Logging

#### D6 — Backup Codes

Each Backup Code must be stored as an independent encrypted record.

Allowed Backup Code statuses are:

- `AVAILABLE`
- `USED`
- `REVOKED`

Each Backup Code must have its own lookup hash.

Account creation requires at least one Backup Code.

#### D7 — Capacity Templates

Capacity rows are generated automatically from the approved Game Platform template.

Manual creation or deletion of Capacity rows is prohibited.

Z3 is shared between PS5 and PS4 according to the canonical Capacity template.

#### D8 — Capacity Completion

`FINISHED` is a manual, persisted and reversible Capacity state.

Finish and unfinish operations require authorization and actor-based Audit Logging before Runtime activation.

#### D9 — Customer Assignment Boundary

Customer Assignment remains outside Account Core.

The current `capacity_customers` structure must not become the final canonical Assignment contract.

Customer Assignment integration remains blocked until the Assignment and Fulfillment Unit model is approved.

#### D10 — Account Deletion and Retention

An Account with no current or historical Assignment may be hard-deleted through an authorized transactional workflow.

An Account with Assignment history must retain that history and may only be changed to `INACTIVE`.

#### D11 — API Authority

OpenAPI schemas and safe DTO boundaries are the authoritative Account API contract.

Backend routes and generated clients must conform to OpenAPI before frontend mutation integration.

#### D12 — Frontend Integration Order

Account Workspace integration must begin as read-only.

The following operations must be introduced only in later controlled stages:

- Create
- Update
- Disable
- Delete
- Capacity operations
- Secret Reveal

#### D13 — Search Model

Exact Account Core search through normalized keyed lookup hashes is approved.

Partial search over encrypted PSN Email or Family Management Email must not use:

- plaintext
- ordinary hashes
- unapproved searchable copies

Partial encrypted-field search remains deferred until a secure indexed-search design is separately approved.

### Stage Boundary

PS-03B does not authorize:

- migrations
- schema changes
- database writes
- Account CRUD implementation
- Customer Assignment integration
- Secret Reveal activation
- commencement of another implementation stage

The next authorized stage is:

PS-03C0 — Live Database Evidence and Migration Readiness

PS-03C0 is strictly read-only.

## 2026-07-16 — PS-03C2B Closure

PS-03C2B — Runtime Schema Retirement Migration is approved and closed.

- Approved migration: `lib/db/migrations/0003_ps03c2b_retirement.sql`
- Migration SHA-256: `2fa056d4a7e45c70339aa09e7316a1917e1cc4a909c2eeb6009b17edd166194a`
- Live database contains recorded migrations 0000 through 0003.
- Schema snapshots preserved:
  - `reports/ps03c2b_live_schema_before.sql`
  - `reports/ps03c2b_live_schema_after.sql`
- No source code or migration files were modified during PS-03C2B-3.
- Next authorized phase: PS-03D1 — Account Domain Core (not started).

## 2026-07-16 — PS-03C2B Backup Code Contract Correction

The previous PS-03B Backup Code lifecycle decision is superseded.

Final approved Backup Code storage contract is storage-only and consists of exactly these columns:

- `id`
- `account_id`
- `code_ciphertext`
- `created_at`

No status, lookup hash, `used_at`, validation, consumption, lifecycle or search behavior is authorized until separately reviewed and approved.

The database column was renamed from `code_encrypted` to `code_ciphertext` by migration 0003, which is already applied.

### Resolved decision — Shared Z3 Capacity instanceNo

- Current implementation: shared Z3 Capacity uses `instanceNo` = 0.
- Command Center approved this convention for PS-03D1.
- No change is required.

## 2026-07-17 — PS-03D1-1 Command Center Design Corrections

PS-03D1-1 — Account Domain Core Design and Preflight was reviewed by Command Center. The following corrections and approvals were applied to the design document.

### Approved scope

- PS-03D1 will implement only the Account Domain Service and its tests.
- API routes, OpenAPI, generated clients, frontend integration, and Secret Reveal are separate later stages.

### Approved Account identifiers

- Global format: `ACC-000001`
- Per-game format: `GTA6-001`
- No leading `#` character
- Identifiers are never reused
- Sequence gaps after rollback are acceptable

### Approved Shared Z3 Capacity

- Kind: `Z3_SHARED_PS5_PS4`
- `instanceNo`: `0`

### Approved Backup Code storage contract

- Required during Account creation
- Minimum one non-empty Backup Code
- Multiple codes are allowed
- Each code is encrypted and stored independently
- No status, lookup hash, `used_at`, validation against PlayStation, consumption, search, or lifecycle

### Approved Birth Date format

- Canonical format: `YYYY-MM-DD`
- UI display conversion may be added later

### Approved Game precondition

- New Accounts cannot be created for an `INACTIVE` Game.

### Approved status override rule

- `statusOverride` must not be accepted during initial Account creation.
- A new Account starts without a manual override.

### Approved duplicate handling

- Duplicate warnings apply to:
  - PSN Email
  - Online ID
  - Family Management Email
- Emails are compared case-insensitively.
- Online ID is stored as entered but duplicate comparison is case-insensitive.
- The first attempt returns a duplicate warning without writing data.
- The caller may explicitly confirm and retry.
- The Domain Service uses an internal `confirmed` flag.
- The HTTP wire format is deferred until the route design stage.

### Approved encryption

- Secret name: `PLAYSYNCER_ACCOUNT_MASTER_KEY`
- Must be a valid Base64 value representing exactly 32 random bytes
- Derive separate encryption and lookup-hash subkeys using Node.js built-in `crypto/HKDF`
- No new dependency
- Missing or invalid key must fail closed
- Never log keys or plaintext credentials

### Approved Account status model

- Persist only `statusOverride` (manual overrides: `SOLD`, `INACTIVE`).
- `AVAILABLE`, `PARTIALLY_SOLD`, and automatic `SOLD` are derived from Capacity state.
- No persisted derived status column.

### Approved atomicity

- Account creation must be atomic: identifiers, encrypted Account data, capacities, and Backup Codes must succeed together.
- On any failure, no partial Account data may remain.

### Approved per-game sequence allocation

- Insert the sequence row if missing using `ON CONFLICT DO NOTHING`.
- Then increment it using `UPDATE ... RETURNING`.

### Approved audit logging deferral

- Audit logging is deferred until Auth/RBAC.
- No actorless audit records.
- Account routes and Secret Reveal must remain disabled until the required security stage.

### Approved database freeze

- No new migration, schema change, dependency, `drizzle-kit push`, or live database write is authorized for PS-03D1-1.

### Remaining unresolved item

- Duplicate confirmation HTTP wire format: exact shape to be decided when Account API routes are designed.

### Next stage

PS-03D1 implementation of the Account Domain Service and its tests, pending Command Center review.

## 2026-07-17 — PS-03D1 Closure

PS-03D1 — Account Domain Core is approved and closed.

### Implemented and verified

- Account Domain Service implemented in `artifacts/api-server/src/services/account/index.ts`.
- Domain-level tests implemented in `artifacts/api-server/src/services/account/index.test.ts` and run against a disposable PostgreSQL instance.
- Account routes remain disabled; existing 403 safety tests are preserved.
- Account creation is transactional: identifiers, encrypted Account data, capacities, and Backup Codes are inserted together and rolled back together on failure.
- PSN Email, PSN Password, Email Password, Family Management Email, and Backup Codes are encrypted at rest with a separate lookup-hash subkey.
- Duplicate-field warnings for PSN Email, Online ID, and Family Management Email are implemented with case-insensitive comparison.
- Concurrent duplicate protection uses stable-order transaction-level PostgreSQL advisory locks.
- Identifiers and Capacity templates are implemented; Capacity rows are generated automatically from the Game Platform template.

### Boundaries preserved

- No migration, schema change, OpenAPI change, generated-client change, or live database write occurred for PS-03D1.
- No new dependency was added.
- Authentication, RBAC, Secret Reveal, and Customer Assignment remain deferred.
- The real `PLAYSYNCER_ACCOUNT_MASTER_KEY` was not created in the workspace.

### Required follow-ups

A. Must be decided in Account API design:
   - Duplicate confirmation HTTP wire format.

B. Must be completed before Account route activation:
   - Configure a valid `PLAYSYNCER_ACCOUNT_MASTER_KEY`.
   - Verify Authentication/RBAC requirements for every sensitive operation.

C. Deferred hardening:
   - Assess advisory-lock throughput under heavy identical-request load before production launch.

D. Accepted behavior, not a defect:
   - Global `ACC` sequence gaps after rollback are allowed.

### Next authorized stage

PS-03D2 — Account API Contract and OpenAPI Design.

## 2026-07-17 — PS-03D2-2 Account OpenAPI Contract and Generated Client

PS-03D2-1 — Account API Contract Audit and Decision Gate is approved and closed.

PS-03D2-2 — Account OpenAPI Contract and Generated Client is approved and closed.

### Approved Decisions (applied to OpenAPI contract)

#### D17 — Frontend adopts canonical Account statuses

The API returns the canonical Account statuses:

- `AVAILABLE`
- `PARTIALLY_SOLD`
- `SOLD`
- `INACTIVE`

The frontend must abandon the legacy `active` / `disabled` model.

No new derived status column is persisted.

#### D18 — Account detail remains safe and Secret-free

Generic Account list, summary, and detail DTOs must not include:

- plaintext credentials
- ciphertext
- lookup hashes
- Backup Codes
- encryption keys

Secret Reveal and Backup Code Reveal remain outside this stage.

#### D19 — Duplicate confirmation contract

When an unconfirmed create request detects duplicates, the API returns:

- HTTP `409`
- machine-readable code `DUPLICATE_WARNING`
- safe Persian message
- duplicate field names only

The response must not expose matched Account IDs, values, credentials, or Secrets.

After explicit confirmation, the caller may resend the same request with `confirmed: true`.

### Stage scope

Authorized:

- approved Account OpenAPI schemas
- approved read-only Account paths
- generated API client regeneration
- contract and generation tests
- minimal documentation updates

Not authorized:

- Account backend route implementation or activation
- Account Domain Service changes
- frontend Account integration
- Account mutations
- Secret Reveal
- Backup Code exposure
- Authentication, RBAC, or Audit Logging
- Customer Assignment
- database schema or migration changes
- live database writes
- new dependencies

### OpenAPI contract additions

Added read-only paths:

- `GET /api/games/{gameId}/accounts` — safe Account summaries for one Game
- `GET /api/accounts/{accountId}` — safe Account metadata without Secrets
- `GET /api/accounts/{accountId}/capacities` — Capacity rows and derived Account status

Added schemas:

- `AccountStatus`
- `CapacityKind`
- `AccountListItem`
- `AccountDetail`
- `AccountCapacity`
- `AccountListResponse`
- `AccountDetailResponse`
- `AccountCapacitiesResponse`
- `CreateAccountRequest` (future-use contract completeness)
- `DuplicateWarningResponse` (future-use contract completeness)
- `StandardApiError`

Mutation paths and Secret/Backup Code Reveal paths were not added.

### Generated client

Regenerated via `pnpm --filter @workspace/api-spec run codegen`.

Generated files updated:

- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/*.ts`

No generated file was manually edited.

### Tests added

- `artifacts/api-server/src/lib/account-contract.test.ts`

Tests verify:

- OpenAPI is valid (codegen succeeds and generated code typechecks)
- generated client is synchronized with OpenAPI (read-only hooks exist)
- safe Account DTO schemas contain no Secret fields
- `DuplicateWarningResponse` contains no matched values or Account IDs
- read-only Account paths exist in OpenAPI
- mutation and Secret/Backup Code Reveal paths remain absent

### Validation results

- `pnpm run typecheck` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-spec run codegen` — **PASS** (exit 0; OpenAPI is valid and generated client typechecks)
- `pnpm --filter @workspace/api-server run test` — **PASS** (62 tests, 0 failed)
- `pnpm --filter @workspace/db run test` — **PASS** (16 tests, 0 failed)
- `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (exit 0; one non-blocking sourcemap warning in `sonner.tsx`)

### Remaining implementation requirements for PS-03D3

- Implement the three read-only backend routes:
  - `GET /api/games/{gameId}/accounts`
  - `GET /api/accounts/{accountId}`
  - `GET /api/accounts/{accountId}/capacities`
- Derive Account status from `statusOverride` and Capacity state (no new column)
- Keep all Account mutations and Secret/Backup Code Reveal disabled
- No schema, migration, or live database change in PS-03D3 unless separately authorized

### Next authorized stage

PS-03D3-1 — Read-only Account API Implementation.

## 2026-07-17 — PS-03D3-1 Read-only Account API Implementation

PS-03D3-1 — Read-only Account API Implementation is implemented and awaiting Command Center review.

### Approved temporary rule (Command Center)

`capacity_customers` may be used only as a **read-only** source for deriving Account status until the final Assignment model is approved.

This is temporary compatibility logic, not the final Assignment model.

Rules:

- SELECT only; no INSERT, UPDATE, or DELETE.
- No Customer data, Customer IDs, phone numbers, or assignment details are returned in API responses.
- No new dependency from the OpenAPI contract to `capacity_customers`.
- The implementation queries only rows where `status = 'active'` and `deleted_at IS NULL`.
- This logic must be replaced when the final Assignment model is approved.

### Approved decisions applied

#### D17 — Frontend adopts canonical Account statuses (already approved in PS-03D2-2)

API returns canonical Account statuses: `AVAILABLE`, `PARTIALLY_SOLD`, `SOLD`, `INACTIVE`.

The derived status is computed from `statusOverride` and Capacity state; it is never persisted.

#### D19 — Duplicate confirmation contract (already approved in PS-03D2-2)

Unconfirmed duplicate requests return `409 DUPLICATE_WARNING`. Mutations remain disabled in this stage.

### Implemented routes

- `GET /api/games/{gameId}/accounts` — safe Account summaries, stable ordering by `accountNumberSeq`, derived status
- `GET /api/accounts/{accountId}` — safe Account metadata including Capacities, derived status
- `GET /api/accounts/{accountId}/capacities` — safe Capacity rows and derived status

### Implementation details

- Derived status helper: `artifacts/api-server/src/lib/account-status.ts`
- Safe DTO helpers: `artifacts/api-server/src/lib/dto.ts` (extended with `SafeAccountListItem`, `SafeAccountCapacity`, `SafeAccountDetail`)
- Error responses upgraded to include `code` in `StandardApiError` format via `HttpError` and `errorHandler`
- Mutation routes remain disabled and return 403

### Derived status precedence (exact)

1. `statusOverride = INACTIVE` → `INACTIVE`
2. `statusOverride = SOLD` → `SOLD`
3. every Capacity finished → `SOLD`
4. every Capacity unfinished and no active Customer relation → `AVAILABLE`
5. any other mixed state → `PARTIALLY_SOLD`

### Scope safety

- No schema or migration file changed.
- No live database write occurred.
- No frontend file changed.
- No Account mutation activated.
- No Customer Assignment write logic added.
- No Secret, ciphertext, or lookup hash exposed.
- No dependency added.
- No generated client manually edited.

### Validation results

- `pnpm run typecheck` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-spec run codegen` — **PASS** (exit 0; OpenAPI valid, generated client typechecks)
- `pnpm --filter @workspace/api-server run test` — **PASS** (77 tests, 0 failed)
- `pnpm --filter @workspace/db run test` — **PASS** (16 tests, 0 failed)
- `pnpm --filter @workspace/db run test:migrations` — **PASS** (38 tests, 0 failed)
- `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (exit 0; one non-blocking sourcemap warning in `sonner.tsx`)

### Remaining work for PS-03D3-2

- Command Center review and closure of PS-03D3-1.
- No further implementation until PS-03D4 or later gates are approved.

### Next authorized stage

PS-03D3-2 — Read-only Account API Verification and Closure.

## 2026-07-17 — PS-03D3 Closure

PS-03D3 — Read-only Account API is approved and closed.

### Approved and preserved

- Three read-only Account endpoints implemented and verified:
  - `GET /api/games/{gameId}/accounts`
  - `GET /api/accounts/{accountId}`
  - `GET /api/accounts/{accountId}/capacities`
- Canonical derived Account status implemented: `AVAILABLE`, `PARTIALLY_SOLD`, `SOLD`, `INACTIVE`.
- `capacity_customers` used temporarily and read-only for status derivation; must be replaced when the final Assignment model is approved.
- Safe DTO boundaries verified; no secret, Customer, or internal database-only fields exposed.
- Account mutations and Secret/Backup Code Reveal routes remain disabled and fail-closed.
- No schema or migration file changed.
- No frontend file changed.
- No live workspace database write occurred.
- No Customer Assignment write behavior added.
- No dependency added.
- No generated client manually edited.
- Generated prompt artifact `attached_assets/Pasted-Continue-in-the-current-PlaySyncer-workspace-PS-03D2-2-_1784311822254.txt` removed from the working tree and excluded from the closure commit.

### Final validation results

- `pnpm run typecheck` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-spec run codegen` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-server run test` — **PASS** (77 tests, 0 failed)
- `pnpm --filter @workspace/db run test` — **PASS** (16 tests, 0 failed)
- `pnpm --filter @workspace/db run test:migrations` — **PASS** (38 tests, 0 failed)
- `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (exit 0; one non-blocking sourcemap warning in `sonner.tsx`)

### Closure commit

- Commit: `feat(accounts): close PS-03D3 read-only account API`
- Package: `playsyncer-ps03d3-closed.zip`

### Next authorized stage

PS-03D4 — Read-only Account Frontend Integration.

## 2026-07-17 — PS-03D4-1 Read-only Account Frontend Integration

### Scope

PS-03D4-1 connects the Game Detail page to the read-only Account API without enabling mutations, Secret Reveal, or Backup Code Reveal.

### Code changes

- `artifacts/playsyncer/src/pages/GameDetailPage.tsx`:
  - Replaced the Account placeholder with a live Account list.
  - Uses `useListAccounts(gameId)` from the generated React client.
  - Renders loading, error, empty, and retry states.
  - Opens `AccountDetailsReadOnly` when a card's details action is selected.
- `artifacts/playsyncer/src/lib/apiErrors.ts`:
  - Added `resource?: "game" | "account" | "capacity"` to `ApiErrorContext`.
  - Returns Persian-safe messages for 404 errors on accounts and capacities.
- `artifacts/playsyncer/src/domain/accounts/apiStatus.ts` (new):
  - Maps canonical `AccountStatus` values to Persian labels and visual variants.
  - Includes a fail-safe for unknown statuses.
- `artifacts/playsyncer/src/components/AccountStatusBadge.tsx` (new):
  - Read-only status badge using the canonical status labels.
- `artifacts/playsyncer/src/components/AccountCardReadOnly.tsx` (new):
  - Displays safe Account fields only: display number, account code, online ID, and status.
  - Expands to fetch and display capacities via `GET /api/accounts/{accountId}/capacities`.
  - Includes loading, error, and retry states for capacities.
- `artifacts/playsyncer/src/components/AccountDetailsReadOnly.tsx` (new):
  - Modal using `GET /api/accounts/{accountId}` and `GET /api/accounts/{accountId}/capacities`.
  - Displays safe detail fields only: account code, online ID, birth date, created at, updated at, and capacities.
  - No secret, credential, or Customer data is shown.

### Decisions

- Use the generated React client hooks directly, matching the existing Games data-fetching pattern.
- Account status is displayed from the backend DTO; the frontend never re-derives it.
- Capacities are fetched from the dedicated `/capacities` endpoint even though `AccountDetail` includes them, satisfying the explicit API contract.
- Legacy Account components (`AccountCard`, `AccountDetailsModal`, `AccountFormModal`) remain untouched and are not used in the active Game Detail path.
- No frontend test files were added because the `@workspace/playsyncer` package does not have a test runner or test script; this is documented as a known gap.

### Validation results

- `pnpm run typecheck` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-spec run codegen` — **PASS** (exit 0)
- `pnpm --filter @workspace/api-server run test` — **PASS** (77 tests, 0 failed)
- `pnpm --filter @workspace/db run test` — **PASS** (16 tests, 0 failed)
- `pnpm --filter @workspace/db run test:migrations` — **PASS** (38 tests, 0 failed)
- `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — **PASS** (exit 0; one non-blocking sourcemap warning in `sonner.tsx`)

### Stage boundary

- Account mutations remain disabled.
- Secret Reveal and Backup Code Reveal remain disabled.
- Customer Assignment writes remain disabled.
- No schema, migration, OpenAPI, generated-client, or dependency change.
- No commit performed; stage is ready for Command Center review.

### Next authorized stage

Command Center review and closure of PS-03D4-1.

## 2026-07-18 — PS-03D4-1 Completion

### Final decisions

- Backend Account status remains authoritative; the frontend never derives status from Capacities or Assignments.
- Unfinished Capacity is displayed as "تکمیل‌نشده"; it is never shown as "آزاد".
- Shared Capacity (`Z3_SHARED_PS5_PS4`) is displayed as "مشترک PS5/PS4" using explicit equality mapping, not substring inference.
- No Assignment state, customer state, sold state, or availability is inferred by the frontend.
- Account details remain free of Secret, Backup Code, credential, and Customer data.
- Capacities remain read-only; finish, unfinish, assign, and customer controls are not activated.
- Mock Account data is not the active runtime source; the Account list comes from the live API.
- Frontend test infrastructure remains a mandatory prerequisite before any read-write Account or Capacity mutation UI is activated.
- The active Game Detail page uses `accounts.length` as the live count after the list has loaded; the stale `game.accountCount` is only shown as a preliminary placeholder during loading or while an error occurs before a successful response.
- The Account detail modal closes automatically when the route `gameId` changes so that an Account from the previous Game cannot remain visible.
- Account card action buttons are independent interactive controls; the accordion toggle is a real button, and inner copy/view buttons do not toggle the accordion.

## 2026-07-18 — PS-03D4 Closure

PS-03D4 — Read-only Account Frontend Integration is approved and closed.

### Controlled corrections applied in PS-03D4-2

- Separated Account detail and Capacity request states in `AccountDetailsReadOnly` so that Account metadata displays as soon as the Account request succeeds, a Capacity failure does not hide successfully loaded Account metadata, Account retry retries only the Account request, and Capacity retry retries only the Capacity request.
- Corrected Account-list 404 formatting in `GameDetailPage` so a missing Game returns a safe Game-related message (`بازی مورد نظر یافت نشد.`) while Account detail and Capacity 404 messages remain account-related.
- Prevented a false zero Account count by using `accounts.length` only after a successful list response and showing a neutral `—` while the request fails before any successful response exists.
- Preserved explicit Capacity mapping (`Z2_PS5 → PS5`, `Z2_PS4 → PS4`, `Z3_SHARED_PS5_PS4 → مشترک PS5/PS4`) and completion wording (`تمام‌شده` / `تکمیل‌نشده`).

### Verified behavior

- Live Account list through `useListAccounts`.
- Safe Account detail through `useGetAccount`.
- Read-only Capacities through `useGetAccountCapacities`.
- API ordering preserved.
- Backend Account status authoritative; no frontend derivation.
- Canonical Persian status labels with unknown fallback.
- Account detail modal closes on `gameId` route change.
- Independent Account-card action buttons, keyboard-accessible accordion, no nested buttons.
- Loading, empty, error, retry, refresh, desktop, and mobile states.
- Fail-closed mutation controls: no create/edit/delete/status/secret/customer/capacity writes in the active UI.
- No sensitive data rendered, logged, or persisted: psnEmail, psnPassword, emailPassword, familyManagementEmail, backupCodes, ciphertext, hashes, keys, Customer IDs, phone numbers, raw SQL errors.
- Temporary development-only PS-03D4 preview data was identified and removed.

### Synthetic preview data cleanup

- Deleted synthetic Game: `d3e46703-be74-47b1-82d5-060b25c39ea4` (title: `PS03D4 Frontend Test`).
- Deleted synthetic Account: `3c6d0ffa-c487-4413-9f55-0ab3f003eb16` (display number: `PS03D4-001`, account code: `ACC-000100`).
- Deleted 3 dependent Capacities.
- 0 dependent Backup Code records and 0 dependent `capacity_customers` relations were present.
- Unrelated records remain unchanged (e.g., Game `vvvv`).

### Final validation

- `pnpm run typecheck` — PASS (exit 0).
- `pnpm --filter @workspace/api-spec run codegen` — PASS (exit 0).
- `pnpm --filter @workspace/api-server run test` — PASS (77 tests).
- `pnpm --filter @workspace/db run test` — PASS (16 tests).
- `pnpm --filter @workspace/db run test:migrations` — PASS (38 tests).
- `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` — PASS (exit 0; one non-blocking sourcemap warning in `sonner.tsx`).
- Browser console on the artifact-managed preview: clean of new errors.

### Final evidence

- `screenshots/ps03d4-final-list-desktop.jpg`
- `screenshots/ps03d4-final-capacities-desktop.jpg`
- `screenshots/ps03d4-final-details-desktop.jpg`
- `screenshots/ps03d4-final-mobile.jpg`
- `screenshots/ps03d4-final-empty-state.jpg`
- `screenshots/ps03d4-final-error-retry.jpg`

### Frontend test infrastructure gate

- No frontend test framework was added in this stage.
- Frontend test coverage remains mandatory before any Account or Capacity mutation UI is activated.

### Stage boundary

- PS-03D4 is closed.
- Account mutations, Secret Reveal, Backup Code Reveal, and Customer Assignment writes remain disabled.
- Next authorized stage is PS-03D5 — Account Mutation Planning and Security Gate, awaiting Command Center authorization.

## 2026-07-18 — PS-03D5-1 Account Mutation Planning and Security Gate (Approved Decisions)

PS-03D5-1 — Account Mutation Planning and Security Gate was reviewed and approved by Command Center.

This stage was decision-only. No runtime route, schema, migration, OpenAPI, generated-client, or frontend mutation implementation is authorized for this stage.

### Approved decisions

#### A1 — Implementation path: Option A

- Account mutations (Create, Edit, and controlled sensitive-field updates) will be implemented and tested in the backend first.
- Runtime routes and frontend read-write UI remain disabled until PS-03D7.
- This keeps the frontend read-only while the mutation backend reaches test parity.

#### A2 — Runtime activation deferred

- Activation of Account mutation routes, Account mutation UI, and Secret/Backup Code Reveal is deferred to PS-03D7.
- No read-write Account control is exposed in the active frontend path before PS-03D7 authorization.

#### A3 — Duplicate-warning contract

- Duplicate-field warnings return HTTP `409` with code `DUPLICATE_WARNING`.
- The response body contains a safe Persian message and a list of field names only; no raw values, customer data, or internal identifiers are exposed.
- The caller must retry with `confirmed: true` to proceed past the warning.
- Duplicate detection is based on keyed lookup hashes for the normalized values, not on plaintext or ordinary hashes.

#### A4 — Frontend test foundation is mandatory

- Frontend tests are required before any read-write Account UI is built or activated.
- The test foundation must cover the read-only Account components, the Game Detail Account workspace, and the fail-closed behavior of disabled mutation controls.
- No Account mutation form, status override, or delete control may be added before the test foundation is reviewed and closed.

#### A5 — Sensitive-field edits

- Editing sensitive fields (PSN Email, PSN Password, Email Password, Family Management Email) is permitted later.
- Such edits must re-encrypt the value at rest and regenerate the corresponding keyed lookup hash.
- No plaintext or old-hash residue may remain after an edit.

#### A6 — Backup Code management excluded from general Edit form

- Backup Code creation, replacement, revocation, and consumption are excluded from the general Account Edit form.
- Backup Code management is deferred to PS-03D8 with a separate, reviewed UI/UX contract.
- Account creation will still require at least one Backup Code, but subsequent Backup Code handling is a separate workflow.

#### A7 — Account deletion remains blocked

- Account deletion remains blocked until an authoritative Assignment-history model is approved.
- An Account with no Assignment history may be hard-deleted through a controlled transactional workflow once the model exists.
- An Account with Assignment history must remain and can only be marked `INACTIVE`.

### Stage boundary

- PS-03D5-1 is closed as decision-only.
- No runtime route, schema, migration, OpenAPI, generated-client, dependency, or frontend mutation change is authorized for this stage.
- Next authorized stage is PS-03D5-2 — Frontend Test Foundation.

### Next gate

PS-03D5-2 — Frontend Test Foundation review and closure.


## 2026-07-18 — PS-03D5-2 Frontend Test Foundation Closure

### Approved closure

- PS-03D5-2 — Frontend Test Foundation is approved and closed.
- Final frontend test count: 47 tests across 4 test files.
- Test tooling: Vitest, jsdom, @testing-library/dom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event.
- Unexpected real network access is prohibited in frontend unit tests; `src/test/setup.ts` spies on `global.fetch` and fails any test that initiates a real HTTP request.
- `GameDetailPage` tests use a mocked `useGames` hook and do not mount the real `GamesProvider`, preventing any accidental call to `useListGames()`.
- Account mutations remain runtime-disabled.
- Backend Account mutation routes remain disabled (POST, PATCH, DELETE, status override, Secret Reveal, Backup Code Reveal).
- `.replit` was restored to the approved baseline and version-controlled workflows (Project, API Server, PlaySyncer Frontend) are preserved.
- Next authorized sub-stage is PS-03D5-3 — Create Account Backend, Runtime Disabled.
- Runtime activation of Account mutations remains deferred to PS-03D7.

### Stage boundary

- PS-03D5-2 is closed.
- PS-03D5 as a whole is not closed; PS-03D5-3 is the next authorized sub-stage.
- No product runtime source, backend behavior, OpenAPI, generated client, schema, migration, Auth, RBAC, or Audit behavior changed in PS-03D5-2.

### Next gate

PS-03D5-3 — Create Account Backend, Runtime Disabled (awaiting Command Center authorization to start).

## 2026-07-18 — PS-03D5-3 Create Account Backend, Runtime Disabled Closure

### Approved closure

- PS-03D5-3 — Create Account Backend, Runtime Disabled is approved and closed.
- OpenAPI now includes `POST /api/games/{gameId}/accounts` with `operationId: createAccount`.
- Request contract: `CreateAccountRequest` (no `gameId`, `id`, `statusOverride`, `createdAt`, `updatedAt`, `deletedAt`, or `accountNumberSeq`).
- Response contract: HTTP 201 returns the existing safe `AccountDetailResponse` (safe DTO only, no secrets, no passwords, no backup codes, no customer information).
- HTTP 409 duplicate warning returns `DUPLICATE_WARNING` with an explicit `DuplicateFieldName` enum (`psnEmail`, `familyManagementEmail`, `onlineId`) and no matched values or account IDs.
- Generated React Query client and Zod schemas include the Create Account contract without manual edits.
- The public production route remains disabled and returns HTTP 403 for `POST /api/games/{gameId}/accounts`.
- An exported `createAccountHandler` is implemented and tested in a dedicated test Express app.
- Domain errors are mapped to HTTP codes: `GameNotFoundError` → 404, `InactiveGameError` → 409, `IdentifierConflictError` → 409, `EncryptionError` → 500.
- Route-level integration tests verify: 403 public behavior, 201 success, capacity/backup-code creation, 404 missing/deleted game, 409 inactive game, 400 validation failures, duplicate-warning 409/confirmed retry, path `gameId` precedence, and no writes when the encryption key is missing.
- Frontend boundary check: active frontend does not import or use `createAccount` or `useCreateAccount`.
- API server test runner now uses a local ESM loader (`test-loader.mjs`) so integration tests can import source handlers without modifying generated clients.
- Next authorized sub-stage is PS-03D5-4 — Update and Status Override Backend, Runtime Disabled.
- Runtime activation of Account mutations remains deferred to PS-03D7.

### PS-03D5-3-F1 Final Error Contract Correction

- The centralized error handler (`artifacts/api-server/src/middlewares/error-handler.ts`) was corrected so that any unexpected error returns HTTP 500 with `{ error: "Internal server error", code: "INTERNAL_ERROR" }` and never leaks raw exceptions, stack traces, SQL details, or configuration values.
- Malformed JSON request bodies now return HTTP 400 with `{ error: "Invalid JSON request body", code: "INVALID_JSON" }`. Detection remains limited to actual Express `body-parser` `SyntaxError` (`type === "entity.parse.failed"`), so existing Zod validation behavior is unchanged.
- Additional focused tests prove malformed JSON performs zero Account, Capacity, and Backup Code writes; prove unexpected errors return 500 with no internal details; and re-confirm the existing public-route 403, test-only 201, duplicate-warning 409, and body-`gameId` 400 behaviors.
- Final validation: API server 98/98 tests pass, DB helper 16/16 tests pass, DB migration 38/38 tests pass, frontend 47/47 tests pass, typecheck and production builds pass, `git diff --check` passes.
- Closure package: `playsyncer-ps03d5-3-closed.zip` is the canonical complete-source package; no review ZIPs, screenshots, prompt artifacts, or temporary files are included in the final commit.

### Stage boundary

- PS-03D5-3 is closed.
- PS-03D5 as a whole is not closed; PS-03D5-4 is the next authorized sub-stage.
- No schema, migration, or runtime public route activation changed in PS-03D5-3.
- No product rule was changed by this sub-stage.

### Next gate

PS-03D5-4 — Update and Status Override Backend, Runtime Disabled (awaiting Command Center authorization to start).
