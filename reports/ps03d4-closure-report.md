# PS-03D4 Closure Report

## Final Status

PS-03D4 — APPROVED AND CLOSED

## Scope

Read-only Account Frontend Integration for the PlaySyncer workspace.

## Git History Clarification

- Current HEAD / closure commit: `0f3c9190b3c9c343d470d4053912a84cf5564345`
- Initial PS-03D4 implementation commits:
  - `e8f4bbf` — Implement account card display and expand game details page with API error handling
  - `9e13e99` — Refactor account components and add capacity kind badge with domain model
- Previous stage baseline: `babc01e` (Initial commit clean)
- The earlier work-in-progress note that no commit existed was incorrect; the PS-03D4-1 implementation had already been committed as `9e13e99` before PS-03D4-2 started.

## Source Corrections Applied in PS-03D4-2

### 1. Independent Account detail and Capacity request states

File: `artifacts/playsyncer/src/components/AccountDetailsReadOnly.tsx`

- Account detail loading is now shown independently in the modal body.
- Account detail error is shown independently with a retry that calls `refetchAccount()`.
- Safe Account metadata is rendered as soon as the Account request succeeds.
- Capacity loading is displayed only inside the Capacity section.
- Capacity error is displayed only inside the Capacity section.
- A Capacity failure no longer hides successfully loaded Account metadata.
- Capacity retry calls `refetchCapacities()` only.
- Raw API/database errors remain hidden through `formatApiError`.

### 2. Account-list 404 semantics

File: `artifacts/playsyncer/src/pages/GameDetailPage.tsx`

- The Account-list 404 is now formatted with `resource: "game"`, producing `بازی مورد نظر یافت نشد.`
- Account detail 404 still uses `resource: "account"`.
- Capacity endpoint 404 still uses `resource: "capacity"` with the approved safe message.

### 3. False-zero Account count prevention

File: `artifacts/playsyncer/src/pages/GameDetailPage.tsx`

- `accounts.length` is used only after a successful `useListAccounts` response (`!!accountsData`).
- While loading, the preliminary `game.accountCount` is displayed.
- During an error before a successful response, a neutral `—` is displayed instead of `0`.

## Preserved PS-03D4-1 Behavior

- Live Account list via `useListAccounts`.
- Safe Account detail via `useGetAccount`.
- Read-only Capacities via `useGetAccountCapacities`.
- API ordering preserved.
- Backend Account status treated as authoritative; no frontend derivation.
- Canonical Persian status labels; unknown status fallback without crashes.
- Account detail modal closes when `gameId` changes.
- No stale previous-Game Account remains visible.
- Independent Account-card action buttons; keyboard-accessible accordion; no nested-button structure.
- Live Account count after successful loading.
- Loading, empty, error, retry, and refresh states.
- Desktop and mobile responsive layouts.

## Capacity Mapping and Wording

File: `artifacts/playsyncer/src/domain/accounts/capacityKind.ts`

| Backend kind | Display label |
|---|---|
| `Z2_PS5` | PS5 |
| `Z2_PS4` | PS4 |
| `Z3_SHARED_PS5_PS4` | مشترک PS5/PS4 |
| unknown | نامشخص |

Completion wording:

- `isFinished = true` → `تمام‌شده`
- `isFinished = false` → `تکمیل‌نشده`

The frontend does not display an unfinished Capacity as `آزاد` and does not infer available, assigned, sold, or Customer state from the safe DTO.

## Safe Fields Rendered

- Account list: `displayNumber`, `accountCode`, `onlineId`, `status`.
- Account detail: `accountCode`, `onlineId`, `birthDate`, `createdAt`, `updatedAt`, `status`, `displayNumber` (header).
- Capacity: `capacityKind`, `instanceNo`, `displayLabel`, `isFinished`, `finishedAt` when present.

The active UI does not render, log, or persist: `psnEmail`, `psnPassword`, `emailPassword`, `familyManagementEmail`, `backupCodes`, `ciphertext`, lookup hashes, encryption keys, Customer IDs, Customer phone numbers, or raw SQL/database errors.

## Fail-Closed Mutation Evidence

Source inspection and runtime verification confirm that the active Account frontend cannot issue:

- Account create requests
- Account update requests
- Account delete requests
- Account status-override requests
- Capacity mutation requests
- Customer Assignment writes
- Secret Reveal requests
- Backup Code Reveal requests

The backend test suite confirms that the Account mutation routes return `403` and write nothing. Legacy components remain in the repository but are not on the active runtime path.

## Synthetic Preview-Data Cleanup

The following records were identified as PS-03D4 synthetic preview data and removed in a single PostgreSQL transaction:

| Entity | Identifier | Notes |
|---|---|---|
| Game | `d3e46703-be74-47b1-82d5-060b25c39ea4` | Title `PS03D4 Frontend Test` |
| Account | `3c6d0ffa-c487-4413-9f55-0ab3f003eb16` | Display number `PS03D4-001`, code `ACC-000100` |
| Capacities | 3 rows | `Z2_PS5` × 2, `Z3_SHARED_PS5_PS4` × 1 |
| Backup Codes | 0 rows | None present for this Account |
| capacity_customers | 0 rows | None present for these Capacities |

After cleanup:

- Synthetic Game no longer exists.
- Synthetic Account no longer exists.
- Dependent synthetic Capacities no longer exist.
- Dependent synthetic Backup Codes and relations no longer exist.
- Unrelated records (e.g., Game `vvvv`) remain unchanged.

## Final Validation

| Command | Result | Counts |
|---|---|---|
| `pnpm run typecheck` | PASS (exit 0) | — |
| `pnpm --filter @workspace/api-spec run codegen` | PASS (exit 0) | — |
| `pnpm --filter @workspace/api-server run test` | PASS (exit 0) | 77 tests |
| `pnpm --filter @workspace/db run test` | PASS (exit 0) | 16 tests |
| `pnpm --filter @workspace/db run test:migrations` | PASS (exit 0) | 38 tests |
| `PORT=24351 BASE_PATH=/ pnpm --filter @workspace/playsyncer run build` | PASS (exit 0) | 1768 modules |

Browser console on the artifact-managed preview: clean of new errors (Vite connect and React DevTools info only).

## Final Screenshot Evidence

| File | SHA-256 |
|---|---|
| `screenshots/ps03d4-final-list-desktop.jpg` | `99da7de57ebd3efe197f090e98afedfd931dac2aa2e800409be710d20b8cbb07` |
| `screenshots/ps03d4-final-capacities-desktop.jpg` | `89217f8822579422cbfd4bba4732192e6f7c79f69782f009b8bc3ebf2091c27b` |
| `screenshots/ps03d4-final-details-desktop.jpg` | `db7258918c36b346675f8a1712a887ffc78f1b930b2de5974ba1d20d8e58b0fe` |
| `screenshots/ps03d4-final-mobile.jpg` | `7868cbdd07086af2631415aa6dadd3fd937ad89a4470b91a6fdbb8a42a7d4524` |
| `screenshots/ps03d4-final-empty-state.jpg` | `d96d88dfe0220451eeed7c65219995850b18f3a1a1281350b887afdfc88c04b7` |
| `screenshots/ps03d4-final-error-retry.jpg` | `65f360c2cd397ebeda5163ab98b574f04165d4571a2b11322caa57447ead8156` |

All six hashes are distinct. No temporary forced-state code remains in the source.

## Frontend Test Infrastructure Gate

No frontend test framework was added in this stage. The requirement is classified as:

**MUST FIX BEFORE READ-WRITE FRONTEND ACTIVATION**

Before any Account or Capacity mutation UI is activated, an approved frontend test setup must cover loading, empty state, API error, retry, canonical status rendering, safe Account detail, Capacity rendering, route changes, and fail-closed mutation controls.

This gap does not block closure of the current read-only stage.

## Remaining Deferred Items

- Account and Capacity mutation UI
- Secret Reveal / Backup Code Reveal
- Customer Assignment writes
- Frontend test framework setup
- Authentication, RBAC, and Audit Logging

## Next Authorized Stage

PS-03D5 — Account Mutation Planning and Security Gate, awaiting Command Center authorization to start.

---

Report generated after commit `0f3c9190b3c9c343d470d4053912a84cf5564345`.
