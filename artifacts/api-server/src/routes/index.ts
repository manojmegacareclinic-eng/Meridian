import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import adminRouter from "./admin";
import auditRouter from "./audit";
import documentsRouter from "./documents";
import newsRouter from "./news";
import { requireSession, requireWriteRole } from "../middlewares/guards";

const router: IRouter = Router();

// Health probe stays public and untouched; it exposes no confidential data.
router.use(healthRouter);

// Admin router is guarded by role inside the router (global_admin only) but
// needs the session guard first. It is mounted before the write-role guard so
// its read endpoints are also admin-only.
router.use(requireSession());
router.use("/admin", adminRouter);
router.use("/audit", auditRouter);
router.use(requireWriteRole());
router.use(platformRouter);
router.use("/documents", documentsRouter);
router.use("/news", newsRouter);

export default router;