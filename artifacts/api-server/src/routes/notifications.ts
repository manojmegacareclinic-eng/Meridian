import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { getActor } from "../middlewares/guards";
import { listNotifications, markAllNotificationsRead, markNotificationRead, reconcileNotifications } from "../lib/notifications";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  await reconcileNotifications(db);
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  const limit = parsed.success ? parsed.data.limit : 50;
  const unreadOnly = parsed.success ? parsed.data.unread === "only" : false;
  const feed = await listNotifications(db, getActor(req).id, { limit, unreadOnly });
  res.json(ListNotificationsResponse.parse(feed));
});

router.patch("/:id/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid notification id." });
    return;
  }
  const ok = await markNotificationRead(db, getActor(req).id, params.data.id);
  if (!ok) {
    res.status(404).json({ error: "Notification not found." });
    return;
  }
  res.json(MarkNotificationReadResponse.parse({ ok: true }));
});

router.post("/read-all", async (req, res): Promise<void> => {
  const updated = await markAllNotificationsRead(db, getActor(req).id);
  res.json(MarkAllNotificationsReadResponse.parse({ ok: true, updated }));
});

export default router;