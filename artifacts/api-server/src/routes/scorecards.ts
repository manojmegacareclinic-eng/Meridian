import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { countriesTable, db } from "@workspace/db";
import { loadScorecardRows, computeSummary, computeBreakdown, today } from "../lib/scorecard";
import { GetCountryScorecardParams, GetCountryScorecardResponse, ListScorecardsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/scorecards", async (_req, res): Promise<void> => {
  const [rows, countries] = await Promise.all([
    loadScorecardRows(db),
    db.select({ id: countriesTable.id, name: countriesTable.name }).from(countriesTable),
  ]);
  const items = countries
    .map((country) => ({ countryId: country.id, countryName: country.name ?? "", ...computeSummary(country.id, rows, today) }))
    .sort((a, b) => {
      if (a.score == null && b.score == null) return a.countryName.localeCompare(b.countryName);
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score || a.countryName.localeCompare(b.countryName);
    });
  res.json(ListScorecardsResponse.parse({ items }));
});

router.get("/countries/:id/scorecard", async (req, res): Promise<void> => {
  const params = GetCountryScorecardParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Country not found." }); return; }
  const [rows, [country]] = await Promise.all([
    loadScorecardRows(db),
    db.select({ id: countriesTable.id, name: countriesTable.name }).from(countriesTable).where(eq(countriesTable.id, params.data.id)),
  ]);
  if (!country) { res.status(404).json({ error: "Country not found." }); return; }
  const summary = { countryId: country.id, countryName: country.name ?? "", ...computeSummary(params.data.id, rows, today) };
  const breakdown = computeBreakdown(params.data.id, rows, today);
  res.json(GetCountryScorecardResponse.parse({ summary, ...breakdown }));
});

export default router;