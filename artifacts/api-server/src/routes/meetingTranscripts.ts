import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, meetingTranscriptsTable, meetingsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateMeetingTranscriptBody,
  CreateMeetingTranscriptParams,
  DeleteMeetingTranscriptParams,
  DeleteMeetingTranscriptResponse,
  ListMeetingTranscriptsParams,
  ListMeetingTranscriptsResponseItem,
  UpdateMeetingTranscriptBody,
  UpdateMeetingTranscriptParams,
  UpdateMeetingTranscriptResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/meetings/:id/transcripts", async (req, res): Promise<void> => {
  const params = CreateMeetingTranscriptParams.safeParse(req.params);
  const parsed = ListMeetingTranscriptsParams.safeParse(req.query);
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
    .from(meetingTranscriptsTable)
    .where(eq(meetingTranscriptsTable.meetingId, params.data.id))
    .orderBy(desc(meetingTranscriptsTable.createdAt));
  res.json(ListMeetingTranscriptsResponseItem.array().parse(rows));
});

router.post("/meetings/:id/transcripts", async (req, res): Promise<void> => {
  const params = CreateMeetingTranscriptParams.safeParse(req.params);
  const parsed = CreateMeetingTranscriptBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid transcript creation." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  const [row] = await db.insert(meetingTranscriptsTable).values({ ...parsed.data, meetingId: params.data.id }).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "meeting_transcript",
    entityId: String(row.id),
    kind: "meeting_transcript",
    title: "Transcript added",
    description: `${row.type} added to meeting.`,
    countryId: null,
    after: { id: row.id, type: row.type, authorName: row.authorName },
  });
  res.status(201).json(row);
});

router.patch("/meetings/:id/transcripts/:tid", async (req, res): Promise<void> => {
  const params = UpdateMeetingTranscriptParams.safeParse({ ...req.params });
  const parsed = UpdateMeetingTranscriptBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid transcript update." });
    return;
  }
  const [existing] = await db.select().from(meetingTranscriptsTable).where(eq(meetingTranscriptsTable.id, params.data.tid));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Transcript not found." });
    return;
  }
  const [row] = await db.update(meetingTranscriptsTable).set(parsed.data).where(eq(meetingTranscriptsTable.id, params.data.tid)).returning();
  const diff = diffFields(existing, row, ["content", "type"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "meeting_transcript",
    entityId: String(row.id),
    kind: "meeting_transcript",
    title: "Transcript updated",
    description: `Transcript for meeting was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/meetings/:id/transcripts/:tid", async (req, res): Promise<void> => {
  const params = DeleteMeetingTranscriptParams.safeParse({ ...req.params });
  if (!params.success) {
    res.status(400).json({ error: "Invalid transcript id." });
    return;
  }
  const [existing] = await db.select().from(meetingTranscriptsTable).where(eq(meetingTranscriptsTable.id, params.data.tid));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Transcript not found." });
    return;
  }
  await db.delete(meetingTranscriptsTable).where(eq(meetingTranscriptsTable.id, params.data.tid));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "meeting_transcript",
    entityId: String(params.data.tid),
    kind: "meeting_transcript",
    title: "Transcript deleted",
    description: `Transcript was removed.`,
    countryId: null,
  });
  res.json(DeleteMeetingTranscriptResponse.parse({ id: params.data.tid }));
});

export default router;