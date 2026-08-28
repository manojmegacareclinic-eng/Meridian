import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import { requireSession, requireWriteRole } from "../middlewares/guards";
import adminRouter from "./admin";

const router: IRouter = Router();

// Health probe stays public and untouched; it exposes no confidential data.
router.use(healthRouter);

// Admin router is guarded by role inside the router (global_admin only) but
// needs the session guard first. It is mounted before the write-role guard so
// its read endpoints are also admin-only.
router.use(requireSession());
router.use(adminRouter);
router.use(requireWriteRole());
router.use(platformRouter);

export default router;