import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, meetingParticipantsTable, meetingsTable, contactsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateMeetingParticipantBody,
  CreateMeetingParticipantParams,
  DeleteMeetingParticipantParams,
  DeleteMeetingParticipantResponse,
  ListMeetingParticipantsParams,
  ListMeetingParticipantsResponseItem,
  UpdateMeetingParticipantBody,
  UpdateMeetingParticipantParams,
  UpdateMeetingParticipantResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/meetings/:id/participants", async (req, res): Promise<void> => {
  const params = CreateMeetingParticipantParams.safeParse(req.params);
  const parsed = ListMeetingParticipantsParams.safeParse(req.query);
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
    .select({
      id: meetingParticipantsTable.id,
      meetingId: meetingParticipantsTable.meetingId,
      contactId: meetingParticipantsTable.contactId,
      name: meetingParticipantsTable.name,
      role: meetingParticipantsTable.role,
      organization: meetingParticipantsTable.organization,
      attended: meetingParticipantsTable.attended,
      createdAt: meetingParticipantsTable.createdAt,
      contactName: contactsTable.name,
      contactEmail: contactsTable.email,
    })
    .from(meetingParticipantsTable)
    .leftJoin(contactsTable, eq(meetingParticipantsTable.contactId, contactsTable.id))
    .where(eq(meetingParticipantsTable.meetingId, params.data.id))
    .orderBy(asc(meetingParticipantsTable.createdAt));
  res.json(ListMeetingParticipantsResponseItem.array().parse(rows));
});

router.post("/meetings/:id/participants", async (req, res): Promise<void> => {
  const params = CreateMeetingParticipantParams.safeParse(req.params);
  const parsed = CreateMeetingParticipantBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid participant creation." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  if (parsed.data.contactId) {
    const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, parsed.data.contactId));
    if (!contact) {
      res.status(400).json({ error: "Contact not found." });
      return;
    }
  }
  const [row] = await db.insert(meetingParticipantsTable).values({ ...parsed.data, meetingId: params.data.id }).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "meeting_participant",
    entityId: String(row.id),
    kind: "meeting_participant",
    title: "Meeting participant added",
    description: `${row.name} added as participant.`,
    countryId: null,
    after: { id: row.id, name: row.name, role: row.role },
  });
  res.status(201).json(row);
});

router.patch("/meetings/:id/participants/:pid", async (req, res): Promise<void> => {
  const params = UpdateMeetingParticipantParams.safeParse({ ...req.params });
  const parsed = UpdateMeetingParticipantBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid participant update." });
    return;
  }
  const [existing] = await db.select().from(meetingParticipantsTable).where(eq(meetingParticipantsTable.id, params.data.pid));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Participant not found." });
    return;
  }
  if (parsed.data.contactId) {
    const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, parsed.data.contactId));
    if (!contact) {
      res.status(400).json({ error: "Contact not found." });
      return;
    }
  }
  const [row] = await db.update(meetingParticipantsTable).set(parsed.data).where(eq(meetingParticipantsTable.id, params.data.pid)).returning();
  const diff = diffFields(existing, row, ["name", "role", "organization", "attended", "contactId"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "meeting_participant",
    entityId: String(row.id),
    kind: "meeting_participant",
    title: "Participant updated",
    description: `Participant ${row.name} was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/meetings/:id/participants/:pid", async (req, res): Promise<void> => {
  const params = DeleteMeetingParticipantParams.safeParse({ ...req.params });
  if (!params.success) {
    res.status(400).json({ error: "Invalid participant id." });
    return;
  }
  const [existing] = await db.select().from(meetingParticipantsTable).where(eq(meetingParticipantsTable.id, params.data.pid));
  if (!existing || existing.meetingId !== params.data.id) {
    res.status(404).json({ error: "Participant not found." });
    return;
  }
  await db.delete(meetingParticipantsTable).where(eq(meetingParticipantsTable.id, params.data.pid));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "meeting_participant",
    entityId: String(params.data.pid),
    kind: "meeting_participant",
    title: "Participant removed",
    description: `${existing.name} was removed from the meeting.`,
    countryId: null,
  });
  res.json(DeleteMeetingParticipantResponse.parse({ id: params.data.pid }));
});

export default router;