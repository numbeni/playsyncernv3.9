import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import readyzRouter from "./readyz.ts";
import gamesRouter from "./games.ts";
import accountsRouter from "./accounts.ts";
import ordersRouter from "./orders.ts";
import capacityCustomersRouter from "./capacity-customers.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(readyzRouter);
router.use(gamesRouter);
router.use(accountsRouter);
router.use(ordersRouter);
router.use(capacityCustomersRouter);

export default router;
