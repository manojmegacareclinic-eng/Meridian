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
router.use("/ministries", ministriesRouter);
router.use("/positions", positionsRouter);
router.use("/terms", officeTermsRouter);
router.use("/organizations", organizationsRouter);
router.use("/dr-strategies", drStrategiesRouter);
router.use("/meetings", meetingAgendaRouter);
router.use("/meetings", meetingParticipantsRouter);
router.use("/meetings", meetingTranscriptsRouter);
router.use("/action-items", actionItemsRouter);
router.use("/agreements", agreementLifecycleRouter);

export default router;