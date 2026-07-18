import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  db,
  gamesTable,
  accountsTable,
  accountCapacitiesTable,
  capacityCustomersTable,
  type Account,
  type AccountCapacity,
} from "@workspace/db";
import { eq, isNull, and, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.ts";
import { p } from "../lib/req-param.ts";
import {
  toSafeAccount,
  toSafeAccountCapacity,
  type SafeAccount,
  type SafeAccountDetail,
} from "../lib/dto.ts";
import { requireUuidParam } from "../lib/validate-uuid.ts";
import { HttpError } from "../middlewares/error-handler.ts";
import {
  deriveAccountStatus,
  type StatusCapacity,
} from "../lib/account-status.ts";
import {
  createAccount as createAccountService,
  GameNotFoundError,
  InactiveGameError,
  IdentifierConflictError,
  EncryptionError,
} from "../services/account/index.ts";

const router: IRouter = Router();

// Malformed UUID route params fail fast with HTTP 400 instead of reaching the DB.
router.param("gameId", requireUuidParam("gameId"));
router.param("id", requireUuidParam("id"));

const ACCOUNT_OPS_DISABLED = "Account operations are not authorized";

const PERSIAN = {
  GAME_NOT_FOUND: "بازی یافت نشد",
  ACCOUNT_NOT_FOUND: "اکانت یافت نشد",
  INTERNAL_ERROR: "خطای داخلی رخ داد",
  DUPLICATE_WARNING:
    "اطلاعات وارد شده با اکانت دیگری شباهت دارد. برای ادامه دوباره ارسال کنید با تایید صحت.",
  GAME_INACTIVE: "بازی غیرفعال است و امکان ایجاد اکانت وجود ندارد",
  ACCOUNT_IDENTIFIER_CONFLICT: "شناسه اکانت تکراری است",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireGame(gameId: string) {
  const [game] = await db
    .select({ id: gamesTable.id, deletedAt: gamesTable.deletedAt })
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId))
    .limit(1);
  if (!game || game.deletedAt) {
    throw new HttpError(404, PERSIAN.GAME_NOT_FOUND, "GAME_NOT_FOUND");
  }
  return game;
}

async function requireAccount(accountId: string): Promise<Account> {
  const [account] = await db
    .select()
    .from(accountsTable)
    .where(
      and(eq(accountsTable.id, accountId), isNull(accountsTable.deletedAt)),
    )
    .limit(1);
  if (!account) {
    throw new HttpError(404, PERSIAN.ACCOUNT_NOT_FOUND, "ACCOUNT_NOT_FOUND");
  }
  return account;
}

async function loadCapacities(accountIds: string[]): Promise<AccountCapacity[]> {
  if (accountIds.length === 0) return [];
  return db
    .select()
    .from(accountCapacitiesTable)
    .where(inArray(accountCapacitiesTable.accountId, accountIds))
    .orderBy(
      asc(accountCapacitiesTable.capacityKindV2),
      asc(accountCapacitiesTable.instanceNo),
    );
}

async function loadActiveCustomerCapacityIds(
  capacityIds: string[],
): Promise<Set<string>> {
  if (capacityIds.length === 0) return new Set();

  // Temporary read-only compatibility check: a Capacity currently has a Customer
  // relation when capacity_customers has an active, non-deleted row for that
  // capacity. This must be replaced with the final Assignment model once it is
  // approved; no Customer data is exposed by these read-only APIs.
  const rows = await db
    .select({ capacityId: capacityCustomersTable.capacityId })
    .from(capacityCustomersTable)
    .where(
      and(
        inArray(capacityCustomersTable.capacityId, capacityIds),
        eq(capacityCustomersTable.status, "active"),
        isNull(capacityCustomersTable.deletedAt),
      ),
    );

  return new Set(rows.map((r) => r.capacityId));
}

function groupCapacitiesByAccount(
  capacities: AccountCapacity[],
): Map<string, AccountCapacity[]> {
  const map = new Map<string, AccountCapacity[]>();
  for (const c of capacities) {
    const list = map.get(c.accountId) ?? [];
    list.push(c);
    map.set(c.accountId, list);
  }
  return map;
}

function toStatusInput(capacities: AccountCapacity[]): StatusCapacity[] {
  return capacities.map((c) => ({ id: c.id, isFinished: c.isFinished }));
}

/** Build an AccountDetailResponse from a newly created safe Account. */
async function buildCreatedAccountResponse(
  account: SafeAccount,
): Promise<SafeAccountDetail> {
  const capacities = await loadCapacities([account.id]);
  const capacityIds = capacities.map((c) => c.id);
  const activeCustomerCapacityIds =
    await loadActiveCustomerCapacityIds(capacityIds);
  const status = deriveAccountStatus(
    null,
    toStatusInput(capacities),
    activeCustomerCapacityIds,
  );
  return {
    ...account,
    status,
    capacities: capacities.map(toSafeAccountCapacity),
  };
}

/**
 * Create Account HTTP handler.
 *
 * Exported but intentionally NOT mounted in the production router. The public
 * POST /games/:gameId/accounts route remains disabled. Tests mount this handler
 * in an isolated Express app to verify the contract and behavior.
 */
export async function createAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const gameId = p(req.params["gameId"]);
    const body = req.body as Record<string, unknown>;

    // The Game ID is taken from the path only; a body gameId is rejected as an
    // unexpected field before any validation, encryption, or database writes.
    if (Object.hasOwn(body, "gameId")) {
      next(
        new HttpError(
          400,
          "Unexpected field: gameId must come from the path",
          "VALIDATION_ERROR",
        ),
      );
      return;
    }

    const result = await createAccountService({ ...body, gameId });

    if (result.kind === "duplicate-warning") {
      res.status(409).json({
        error: PERSIAN.DUPLICATE_WARNING,
        code: "DUPLICATE_WARNING",
        detail: { duplicateFields: result.duplicateFields },
      });
      return;
    }

    const accountDetail = await buildCreatedAccountResponse(result.account);
    res.status(201).json({ account: accountDetail });
  } catch (err) {
    if (err instanceof GameNotFoundError) {
      next(new HttpError(404, PERSIAN.GAME_NOT_FOUND, "GAME_NOT_FOUND"));
      return;
    }
    if (err instanceof InactiveGameError) {
      next(new HttpError(409, PERSIAN.GAME_INACTIVE, "GAME_INACTIVE"));
      return;
    }
    if (err instanceof IdentifierConflictError) {
      next(
        new HttpError(
          409,
          PERSIAN.ACCOUNT_IDENTIFIER_CONFLICT,
          "ACCOUNT_IDENTIFIER_CONFLICT",
        ),
      );
      return;
    }
    if (err instanceof EncryptionError) {
      logger.error(err, "Encryption configuration error during account creation");
      next(new HttpError(500, PERSIAN.INTERNAL_ERROR, "INTERNAL_ERROR"));
      return;
    }
    next(err);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

/** GET /games/:gameId/accounts — list non-secret Account summaries for a Game. */
router.get(
  "/games/:gameId/accounts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gameId = p(req.params["gameId"]);
      await requireGame(gameId);

      const accounts = await db
        .select()
        .from(accountsTable)
        .where(
          and(
            eq(accountsTable.gameId, gameId),
            isNull(accountsTable.deletedAt),
          ),
        )
        .orderBy(asc(accountsTable.accountNumberSeq));

      const accountIds = accounts.map((a) => a.id);
      const capacities = await loadCapacities(accountIds);
      const capacityIds = capacities.map((c) => c.id);
      const activeCustomerCapacityIds =
        await loadActiveCustomerCapacityIds(capacityIds);
      const capacitiesByAccount = groupCapacitiesByAccount(capacities);

      const accountsWithStatus = accounts.map((account) => {
        const accountCapacities = capacitiesByAccount.get(account.id) ?? [];
        const status = deriveAccountStatus(
          account.statusOverride,
          toStatusInput(accountCapacities),
          activeCustomerCapacityIds,
        );
        return { ...toSafeAccount(account), status };
      });

      res.json({ accounts: accountsWithStatus });
    } catch (err) {
      logger.error(err, "GET /games/:gameId/accounts failed");
      next(err);
    }
  },
);

/** GET /accounts/:id — return safe Account metadata including Capacities. */
router.get(
  "/accounts/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = p(req.params["id"]);
      const account = await requireAccount(accountId);
      const capacities = await loadCapacities([account.id]);
      const capacityIds = capacities.map((c) => c.id);
      const activeCustomerCapacityIds =
        await loadActiveCustomerCapacityIds(capacityIds);
      const status = deriveAccountStatus(
        account.statusOverride,
        toStatusInput(capacities),
        activeCustomerCapacityIds,
      );

      res.json({
        account: {
          ...toSafeAccount(account),
          status,
          capacities: capacities.map(toSafeAccountCapacity),
        },
      });
    } catch (err) {
      logger.error(err, "GET /accounts/:id failed");
      next(err);
    }
  },
);

/** GET /accounts/:id/capacities — return safe Capacity rows and derived status. */
router.get(
  "/accounts/:id/capacities",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = p(req.params["id"]);
      const account = await requireAccount(accountId);
      const capacities = await loadCapacities([account.id]);
      const capacityIds = capacities.map((c) => c.id);
      const activeCustomerCapacityIds =
        await loadActiveCustomerCapacityIds(capacityIds);
      const status = deriveAccountStatus(
        account.statusOverride,
        toStatusInput(capacities),
        activeCustomerCapacityIds,
      );

      res.json({
        capacities: capacities.map(toSafeAccountCapacity),
        status,
      });
    } catch (err) {
      logger.error(err, "GET /accounts/:id/capacities failed");
      next(err);
    }
  },
);

/** POST /games/:gameId/accounts — disabled; account creation is not authorized. */
router.post("/games/:gameId/accounts", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED, code: "ACCOUNT_OPS_DISABLED" });
});

/** PATCH /accounts/:id — disabled; account editing is not authorized. */
router.patch("/accounts/:id", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
});

/** DELETE /accounts/:id — disabled; account deletion is not authorized. */
router.delete("/accounts/:id", async (_req: Request, res: Response) => {
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
});

export default router;
