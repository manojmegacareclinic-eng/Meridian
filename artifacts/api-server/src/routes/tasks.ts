import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, tasksTable, countriesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  DeleteTaskResponse,
  ListTasksQueryParams,
  ListTasksResponseItem,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const dayOnly = (value?: Date | string | null) => (value ? new Date(value).toISOString().split("T")[0] : null);

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const conds = [eq(tasksTable.countryId, parsed.data.countryId)];
  if (parsed.data.actionArea) conds.push(eq(tasksTable.actionArea, parsed.data.actionArea));
  if (parsed.data.status) conds.push(eq(tasksTable.status, parsed.data.status));
  if (parsed.data.cadence) conds.push(eq(tasksTable.cadence, parsed.data.cadence));
  const rows = await db
    .select({
      id: tasksTable.id,
      countryId: tasksTable.countryId,
      countryName: countriesTable.name,
      actionArea: tasksTable.actionArea,
      cadence: tasksTable.cadence,
      title: tasksTable.title,
      description: tasksTable.description,
      owner: tasksTable.owner,
      status: tasksTable.status,
      dueDate: tasksTable.dueDate,
      lastDoneAt: tasksTable.lastDoneAt,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .innerJoin(countriesTable, eq(countriesTable.id, tasksTable.countryId))
    .where(and(...conds))
    .orderBy(asc(tasksTable.actionArea), asc(tasksTable.title));
  res.json(ListTasksResponseItem.array().parse(rows));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [country] = await db
    .select({ name: countriesTable.name })
    .from(countriesTable)
    .where(eq(countriesTable.id, parsed.data.countryId));
  if (!country) {
    res.status(400).json({ error: "Country workspace not found." });
    return;
  }
  const [row] = await db
    .insert(tasksTable)
    .values({ ...parsed.data, dueDate: dayOnly(parsed.data.dueDate), lastDoneAt: dayOnly(parsed.data.lastDoneAt) })
    .returning();
  await writeAudit({
    actor: getActor(req),
    action: "create",
    entityType: "task",
    entityId: String(row.id),
    kind: "task",
    title: "Task created",
    description: `${row.title} (${row.actionArea}, ${row.cadence}) was added to the workspace.`,
    countryId: row.countryId,
    after: { id: row.id, title: row.title, actionArea: row.actionArea, cadence: row.cadence, status: row.status },
  });
  res.status(201).json(CreateTaskResponse.parse({ ...row, countryName: country.name }));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid task update." });
    return;
  }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  const [row] = await db
    .update(tasksTable)
    .set({ ...parsed.data, dueDate: dayOnly(parsed.data.dueDate), lastDoneAt: dayOnly(parsed.data.lastDoneAt) })
    .where(eq(tasksTable.id, params.data.id))
    .returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  const diff = diffFields(existing, row, ["title", "description", "actionArea", "cadence", "owner", "status", "dueDate", "lastDoneAt"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "task",
    entityId: String(row.id),
    kind: "task",
    title: "Task updated",
    description: `${row.title} (${row.actionArea}, ${row.cadence}) was updated.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateTaskResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid task id." });
    return;
  }
  const [existing] = await db.select().from(tasksTable).where(eq(tasksTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id));
  await writeAudit({
    actor: getActor(req),
    action: "delete",
    entityType: "task",
    entityId: String(params.data.id),
    kind: "task",
    title: "Task deleted",
    description: `${existing.title} (${existing.actionArea}, ${existing.cadence}) was removed.`,
    countryId: existing.countryId,
  });
  res.json(DeleteTaskResponse.parse({ id: params.data.id }));
});

export default router;