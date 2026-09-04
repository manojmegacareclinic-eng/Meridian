import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import adminRouter from "./admin";
import auditRouter from "./audit";
import documentsRouter from "./documents";
import newsRouter from "./news";
import ministriesRouter from "./ministries";
import positionsRouter from "./positions";
import officeTermsRouter from "./office_terms";
import organizationsRouter from "./organizations";
import drStrategiesRouter from "./drStrategies";
import meetingAgendaRouter from "./meetingAgenda";
import meetingParticipantsRouter from "./meetingParticipants";
import meetingTranscriptsRouter from "./meetingTranscripts";
import actionItemsRouter from "./actionItems";
import agreementLifecycleRouter from "./agreementLifecycle";
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
// Resource routers define their full absolute paths, so they are mounted at
// the root (no prefix) — mounting them with a prefix would strip it and cause
// every route to 404.
router.use(ministriesRouter);
router.use(positionsRouter);
router.use(officeTermsRouter);
router.use(organizationsRouter);
router.use(drStrategiesRouter);
router.use(meetingAgendaRouter);
router.use(meetingParticipantsRouter);
router.use(meetingTranscriptsRouter);
router.use(actionItemsRouter);
router.use(agreementLifecycleRouter);

export default router;