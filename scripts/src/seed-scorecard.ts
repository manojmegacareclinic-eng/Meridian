import { eq } from "drizzle-orm";
import { db, countriesTable, meetingsTable, tasksTable, actionItemsTable } from "@workspace/db";
import { scorecardFixture } from "./scorecard-fixture";

const fixture = scorecardFixture(new Date().toISOString().split("T")[0]);

async function upsertCountry(code: string, name: string) {
  const existing = await db.select({ id: countriesTable.id }).from(countriesTable).where(eq(countriesTable.code, code));
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(countriesTable)
    .values({ name, code, region: "QA", status: "leads", riskLevel: "medium" })
    .returning({ id: countriesTable.id });
  if (!created) throw new Error(`failed to create country ${code}`);
  return created.id;
}

async function main() {
  const scorId = await upsertCountry("SCOR", "Scorecards Demo");
  const scerId = await upsertCountry("SCER", "Scorecards Empty");

  await db.delete(meetingsTable).where(eq(meetingsTable.countryId, scorId));
  await db.delete(tasksTable).where(eq(tasksTable.countryId, scorId));

  const meetingIds = await db
    .insert(meetingsTable)
    .values(fixture.meetings.map((m) => ({ ...m.payload, countryId: scorId })))
    .returning({ id: meetingsTable.id });
  const meetingIdByKey = new Map(fixture.meetings.map((m, i) => [m.key, meetingIds[i]?.id]));
  const hostMeetingId = meetingIdByKey.get(fixture.hostMeetingKey);

  if (hostMeetingId != null) {
    await db
      .insert(actionItemsTable)
      .values(fixture.actionItems.map((a) => ({ ...a.payload, meetingId: hostMeetingId })));
  }

  await db.insert(tasksTable).values(fixture.tasks.map((t) => ({ ...t.payload, countryId: scorId })));

  console.log(`SCOR (Scorecards Demo) id=${scorId}`);
  console.log(`SCER (Scorecards Empty) id=${scerId}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });