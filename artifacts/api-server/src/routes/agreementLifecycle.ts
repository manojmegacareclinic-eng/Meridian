import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agreementsTable, countriesTable } from "@workspace/db";
import { diffFields, writeAudit } from "../lib/audit";
import { getActor } from "../middlewares/guards";
import {
  UpdateAgreementLifecycleBody,
  UpdateAgreementLifecycleParams,
  UpdateAgreementLifecycleResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.patch("/agreements/:id/lifecycle", async (req, res): Promise<void> => {
  const params = UpdateAgreementLifecycleParams.safeParse(req.params);
  const parsed = UpdateAgreementLifecycleBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid lifecycle transition." });
    return;
  }

  const [existing] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Agreement not found." });
    return;
  }

  const validTransitions: Record<string, string[]> = {
    draft: ["review"],
    review: ["approved", "draft"],
    approved: ["signed", "review"],
    signed: ["archived"],
    archived: [],
  };

  const currentState = existing.lifecycleState;
  const newState = parsed.data.lifecycleState;

  if (!validTransitions[currentState]?.includes(newState)) {
    res.status(400).json({ error: `Invalid transition from ${currentState} to ${newState}` });
    return;
  }

  const updateData: Partial<typeof agreementsTable.$inferSelect> = { lifecycleState: newState };
  const now = new Date();

  if (newState === "review") {
    updateData.reviewedAt = now;
    updateData.reviewedBy = getActor(req).name;
  } else if (newState === "approved") {
    updateData.approvedAt = now;
    updateData.approvedBy = getActor(req).name;
  } else if (newState === "signed") {
    updateData.signedAt = now;
    updateData.signedBy = getActor(req).name;
  } else if (newState === "archived") {
    // archived state, no additional timestamp
  }

  const [row] = await db.update(agreementsTable).set(updateData).where(eq(agreementsTable.id, params.data.id)).returning();
  const [country] = await db.select({ name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, row.countryId));
  
  const diff = diffFields(existing, row, ["lifecycleState", "reviewedAt", "reviewedBy", "approvedAt", "approvedBy", "signedAt", "signedBy"]);
  await writeAudit({
    actor: getActor(req),
    action: "update",
    entityType: "agreement",
    entityId: String(row.id),
    kind: "agreement",
    title: "Agreement lifecycle updated",
    description: `Agreement lifecycle transitioned from ${currentState} to ${newState}.`,
    countryId: row.countryId,
    before: diff?.before ?? null,
    after: diff?.after ?? null,
  });
  res.json(UpdateAgreementLifecycleResponse.parse({ ...row, countryName: country?.name ?? "Unknown" }));
});

export default router;