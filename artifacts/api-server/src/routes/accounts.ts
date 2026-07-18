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
import { logger } from "../lib/logger";
import { p } from "../lib/req-param";
import { toSafeAccount, toSafeAccountCapacity } from "../lib/dto";
import { requireUuidParam } from "../lib/validate-uuid";
import { HttpError } from "../middlewares/error-handler";
import {
  deriveAccountStatus,
  type StatusCapacity,
} from "../lib/account-status";

const router: IRouter = Router();

// Malformed UUID route params fail fast with HTTP 400 instead of reaching the DB.
router.param("gameId", requireUuidParam("gameId"));
router.param("id", requireUuidParam("id"));

const ACCOUNT_OPS_DISABLED = "Account operations are not authorized";

const PERSIAN = {
  GAME_NOT_FOUND: "بازی یافت نشد",
  ACCOUNT_NOT_FOUND: "اکانت یافت نشد",
  INTERNAL_ERROR: "خطای داخلی رخ داد",
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
  res.status(403).json({ error: ACCOUNT_OPS_DISABLED });
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
