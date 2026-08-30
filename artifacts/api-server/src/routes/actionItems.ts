import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, actionItemsTable, deliverablesTable, meetingsTable, contactsTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateActionItemBody,
  CreateActionItemParams,
  CreateActionItemQueryParams,
  CreateActionItemResponse,
  DeleteActionItemParams,
  DeleteActionItemResponse,
  GetActionItemParams,
  GetActionItemResponse,
  ListActionItemsQueryParams,
  ListActionItemsResponseItem,
  ActionItem,
  ActionItemInput,
  ActionItemUpdate,
  UpdateActionItemBody,
  UpdateActionItemParams,
  UpdateActionItemResponse,
  CreateDeliverableBody,
  DeleteDeliverableParams,
  DeleteDeliverableResponse,
  GetDeliverableParams,
  GetDeliverableResponse,
  ListDeliverablesQueryParams,
  ListDeliverablesResponseItem,
  Deliverable,
  DeliverableInput,
  DeliverableUpdate,
  UpdateDeliverableBody,
  UpdateDeliverableParams,
  UpdateDeliverableResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/meetings/:id/action-items", async (req, res): Promise<void> => {
  const params = CreateActionItemParams.safeParse(req.params);
  const parsed = ListActionItemsQueryParams.safeParse(req.query);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  const filters = [eq(actionItemsTable.meetingId, params.data.id)];
  if (parsed.data.status) filters.push(eq(actionItemsTable.status, parsed.data.status));
  const rows = await db
    .select()
    .from(actionItemsTable)
    .where(and(...filters))
    .orderBy(desc(actionItemsTable.createdAt));
  res.json(rows);
});

router.post("/meetings/:id/action-items", async (req, res): Promise<void> => {
  const params = CreateActionItemParams.safeParse(req.params);
  const parsed = CreateActionItemBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid action item creation." });
    return;
  }
  const [existingMeeting] = await db.select({ id: meetingsTable.id }).from(meetingsTable).where(eq(meetingsTable.id, params.data.id));
  if (!existingMeeting) {
    res.status(404).json({ error: "Meeting not found." });
    return;
  }
  if (parsed.data.assigneeContactId) {
    const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, parsed.data.assigneeContactId));
    if (!contact) {
      res.status(400).json({ error: "Assignee contact not found." });
      return;
    }
  }
  if (parsed.data.deliverableId) {
    const [deliverable] = await db.select({ id: deliverablesTable.id }).from(deliverablesTable).where(eq(deliverablesTable.id, parsed.data.deliverableId));
    if (!deliverable) {
      res.status(400).json({ error: "Deliverable not found." });
      return;
    }
  }
  const insertData = {
    ...parsed.data,
    meetingId: params.data.id,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
};
const [row] = await db.insert(actionItemsTable).values(insertData).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "action_item",
    entityId: String(row.id),
    kind: "action_item",
    title: "Action item created",
    description: `Action item "${row.description}" created.`,
    countryId: null,
    after: { id: row.id, description: row.description, status: row.status },
  });
  res.status(201).json(row);
});

router.get("/action-items/:id", async (req, res): Promise<void> => {
  const params = GetActionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid action item id." });
    return;
  }
  const [row] = await db.select().from(actionItemsTable).where(eq(actionItemsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Action item not found." });
    return;
  }
  res.json(row);
});

router.patch("/action-items/:id", async (req, res): Promise<void> => {
  const params = GetActionItemParams.safeParse(req.params);
  const parsed = UpdateActionItemBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid action item update." });
    return;
  }
  const [existing] = await db.select().from(actionItemsTable).where(eq(actionItemsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Action item not found." });
    return;
  }
  if (parsed.data.assigneeContactId) {
    const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(eq(contactsTable.id, parsed.data.assigneeContactId));
    if (!contact) {
      res.status(400).json({ error: "Assignee contact not found." });
      return;
    }
  }
  if (parsed.data.deliverableId) {
    const [deliverable] = await db.select({ id: deliverablesTable.id }).from(deliverablesTable).where(eq(deliverablesTable.id, parsed.data.deliverableId));
    if (!deliverable) {
      res.status(400).json({ error: "Deliverable not found." });
      return;
    }
  }
  const updateData = {
    ...parsed.data,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : parsed.data.dueDate,
};
const [row] = await db.update(actionItemsTable).set(updateData).where(eq(actionItemsTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["description", "assignee", "assigneeContactId", "dueDate", "status", "deliverableId"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "action_item",
    entityId: String(row.id),
    kind: "action_item",
    title: "Action item updated",
    description: `Action item was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/action-items/:id", async (req, res): Promise<void> => {
  const params = DeleteActionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid action item id." });
    return;
  }
  const [existing] = await db.select().from(actionItemsTable).where(eq(actionItemsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Action item not found." });
    return;
  }
  await db.delete(actionItemsTable).where(eq(actionItemsTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "action_item",
    entityId: String(params.data.id),
    kind: "action_item",
    title: "Action item deleted",
    description: `Action item was removed.`,
    countryId: null,
  });
  res.json(DeleteActionItemResponse.parse({ id: params.data.id }));
});

router.get("/deliverables", async (req, res): Promise<void> => {
  const parsed = ListDeliverablesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query." });
    return;
  }
  const filters = [];
  if (parsed.data.actionItemId) filters.push(eq(deliverablesTable.actionItemId, parsed.data.actionItemId));
  if (parsed.data.status) filters.push(eq(deliverablesTable.status, parsed.data.status));
  const rows = await db
    .select()
    .from(deliverablesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(deliverablesTable.createdAt));
  res.json(rows);
});

router.post("/deliverables", async (req, res): Promise<void> => {
  const parsed = CreateDeliverableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid deliverable creation." });
    return;
  }
  if (parsed.data.actionItemId) {
    const [actionItem] = await db.select({ id: actionItemsTable.id }).from(actionItemsTable).where(eq(actionItemsTable.id, parsed.data.actionItemId));
    if (!actionItem) {
      res.status(400).json({ error: "Action item not found." });
      return;
    }
  }
  const [row] = await db.insert(deliverablesTable).values(parsed.data).returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "deliverable",
    entityId: String(row.id),
    kind: "deliverable",
    title: "Deliverable created",
    description: `Deliverable "${row.title}" was created.`,
    countryId: null,
    after: { id: row.id, title: row.title, status: row.status },
  });
  res.status(201).json(row);
});

router.get("/deliverables/:id", async (req, res): Promise<void> => {
  const params = GetDeliverableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid deliverable id." });
    return;
  }
  const [row] = await db.select().from(deliverablesTable).where(eq(deliverablesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Deliverable not found." });
    return;
  }
  res.json(row);
});

router.patch("/deliverables/:id", async (req, res): Promise<void> => {
  const params = GetDeliverableParams.safeParse(req.params);
  const parsed = UpdateDeliverableBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid deliverable update." });
    return;
  }
  const [existing] = await db.select().from(deliverablesTable).where(eq(deliverablesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Deliverable not found." });
    return;
  }
  const [row] = await db.update(deliverablesTable).set(parsed.data).where(eq(deliverablesTable.id, params.data.id)).returning();
  const diff = diffFields(existing, row, ["title", "description", "dueDate", "status", "url"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "deliverable",
    entityId: String(row.id),
    kind: "deliverable",
    title: "Deliverable updated",
    description: `Deliverable "${row.title}" was updated.`,
    countryId: null,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(row);
});

router.delete("/deliverables/:id", async (req, res): Promise<void> => {
  const params = DeleteDeliverableParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid deliverable id." });
    return;
  }
  const [existing] = await db.select().from(deliverablesTable).where(eq(deliverablesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Deliverable not found." });
    return;
  }
  await db.delete(deliverablesTable).where(eq(deliverablesTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "deliverable",
    entityId: String(params.data.id),
    kind: "deliverable",
    title: "Deliverable deleted",
    description: `Deliverable "${existing.title}" was removed.`,
    countryId: null,
  });
  res.json(DeleteDeliverableResponse.parse({ id: params.data.id }));
});

export default router;