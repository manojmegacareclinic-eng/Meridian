import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, meetingAgendaTable, meetingsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateMeetingAgendaBody,
  CreateMeetingAgendaParams,
  DeleteMeetingAgendaParams,
  DeleteMeetingAgendaResponse,
  ListMeetingAgendaParams,
  ListMeetingAgendaResponseItem,
  UpdateMeetingAgendaBody,
  UpdateMeetingAgendaParams,
  UpdateMeetingAgendaResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/meetings/:id/agenda", async (req, res): Promise<void> => {
  const params = CreateMeetingAgendaParams.safeParse(req.params);
  const parsed = ListMeetingAgendaParams.safeParse(req.query);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  const rows = await db
    .select()
    .from(meetingAgendaTable)
    .where(eq(meetingAgendaTable.meetingId, params.data.id))
    .orderBy(asc(meetingAgendaTable.order));
  res.json(ListMeetingAgendaResponseItem.array().parse(rows));
});

router.post("/meetings/:id/agenda", async (req, res): Promise<void> => {
  const params = CreateMeetingAgendaParams.safeParse(req.params);
  const parsed = CreateMeetingAgendaBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid agenda item creation." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  const maxOrder = await db.select({ max: sql<number>`max(${meetingAgendaTable.order})` }).from(meetingAgendaTable).where(eq(meetingAgendaTable.meetingId, params.data.id));
  const nextOrder = (maxOrder[0]?.max ?? 0) + 1;
  const [row] = await db.insert(meetingAgendaTable).values({ ...parsed.data, meetingId: params.data.id, order: nextOrder }).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "meeting_agenda",
    entityId: String(row.id),
    kind: "meeting_agenda",
    title: "Agenda item created",
    description: `Agenda item "${row.title}" added to meeting.`,
    countryId: null,
    after: { id: row.id, title: row.title, order: row.order },
  });
  res.status(201).json(row);
});

router.patch("/meetings/:id/agenda/:itemId", async (req, res): Promise<void> => {
  const params = UpdateMeetingAgendaParams.safeParse({ ...req.params });
  const parsed = UpdateMeetingAgendaBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid agenda item update." });
    return;
  }
  const [existing] = await db.select().from(meetingAgendaTable).where(eq(meetingAgendaTable.id, params.data.itemId));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Agenda item not found." });
    return;
  }
  const [row] = await db.update(meetingAgendaTable).set(parsed.data).where(eq(meetingAgendaTable.id, params.data.itemId)).returning();
  const diff = diffFields(existing, row, ["title", "description", "durationMinutes", "presenter", "status", "order"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "meeting_agenda",
    entityId: String(row.id),
    kind: "meeting_agenda",
    title: "Agenda item updated",
    description: `Agenda item "${row.title}" was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/meetings/:id/agenda/:itemId", async (req, res): Promise<void> => {
  const params = DeleteMeetingAgendaParams.safeParse({ ...req.params });
  if (!params.success) {
    res.status(400).json({ error: "Invalid agenda item id." });
    return;
  }
  const [existing] = await db.select().from(meetingAgendaTable).where(eq(meetingAgendaTable.id, params.data.itemId));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Agenda item not found." });
    return;
  }
  await db.delete(meetingAgendaTable).where(eq(meetingAgendaTable.id, params.data.itemId));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "meeting_agenda",
    entityId: String(params.data.itemId),
    kind: "meeting_agenda",
    title: "Agenda item deleted",
    description: `Agenda item "${existing.title}" was removed.`,
    countryId: null,
  });
  res.json(DeleteMeetingAgendaResponse.parse({ id: params.data.itemId }));
});

export default router;