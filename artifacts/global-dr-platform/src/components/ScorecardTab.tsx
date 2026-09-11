import { Activity, AlertTriangle } from "lucide-react";
import { useGetCountryScorecard } from "@workspace/api-client-react";
import type { CountryScorecard } from "@workspace/api-client-react";
import { EmptyState, ErrorState, LoadingRows } from "@/App";

const GREEN = "hsl(157 38% 39%)";
const AMBER = "hsl(28 73% 48%)";
const RED = "hsl(4 64% 48%)";
const VIOLET = "hsl(263 60% 54%)";

const pct = (value?: number | null) => (value == null ? "—" : `${value}%`);

function scoreTone(score: number | null | undefined) {
  if (score == null) return { color: "hsl(215 14% 60%)", label: "No data" };
  if (score >= 70) return { color: GREEN, label: String(score) };
  if (score >= 40) return { color: AMBER, label: String(score) };
  return { color: RED, label: String(score) };
}

function ScoreRing({ score, size = 84 }: { score: number | null | undefined; size?: number }) {
  const thickness = Math.max(6, Math.round(size / 6.5));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (Math.min(Math.max(score, 0), 100) / 100) * c;
  const tone = scoreTone(score);
  return (
    <div className="relative shrink-0" data-testid="analytics-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone.color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" {...(score == null ? { "data-testid": "scorecard-no-data" } : {})}>
        <span className="font-serif font-bold" style={{ fontSize: Math.round(size * 0.26), color: score == null ? "hsl(var(--muted-foreground))" : undefined }}>
          {score == null ? "—" : tone.label}
        </span>
      </div>
    </div>
  );
}

type Metric = {
  label: string;
  value: string;
  barPct: number | null;
  caption: string;
  color: string;
  testId: string;
};

function MetricTile({ metric }: { metric: Metric }) {
  const barWidth = metric.barPct == null ? 0 : Math.min(Math.max(metric.barPct, 0), 100);
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_4px_16px_hsl(190_20%_20%/.03)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1 w-1.5 rounded-full" style={{ background: metric.color }} />
        <span className="text-[11px] font-bold uppercase tracking-[.09em] text-[hsl(var(--muted-foreground))]">{metric.label}</span>
      </div>
      <div className="font-serif text-[29px]" data-testid={metric.testId}>{metric.value}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, background: metric.color }} />
      </div>
      <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">{metric.caption}</div>
    </div>
  );
}

const TYPE_BADGE: Record<string, { label: string; tone: string }> = {
  task: { label: "TASK", tone: "bg-[hsl(190_54%_38%/.14)] text-[hsl(190_54%_38%)]" },
  actionItem: { label: "ACTION ITEM", tone: "bg-[hsl(var(--secondary)/.6)] text-[hsl(var(--muted-foreground))]" },
  meeting: { label: "MEETING", tone: "bg-[hsl(263_60%_54%/.12)] text-[hsl(263_60%_45%)]" },
};

function FailureLabel({ daysOver, completedAt }: { daysOver: number | null; completedAt?: string | null }) {
  if (daysOver == null) return <span className="shrink-0 text-[11px] font-bold text-[hsl(var(--destructive))]">late — no date recorded</span>;
  const late = completedAt != null;
  return (
    <span className={`shrink-0 text-[11px] font-bold ${late ? "text-[hsl(var(--destructive))]" : "text-[hsl(28_73%_48%)]"}`}>
      {daysOver}d {late ? "late" : "overdue"}
    </span>
  );
}

export function ScorecardTab({ countryId }: { countryId: number }) {
  const query = useGetCountryScorecard(countryId);
  const scorecard = query.data as CountryScorecard | undefined;
  if (query.isLoading) return <LoadingRows count={4} />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (!scorecard) return null;

  const { summary, completion, sla, failures } = scorecard;
  const metrics: Metric[] = [
    { label: "Completion", value: pct(completion.overallPct), barPct: completion.overallPct, caption: `${summary.completedCount ?? 0} / ${summary.poolCount ?? 0} done`, color: GREEN, testId: "analytics-completion-pct" },
    { label: "SLA on-time", value: pct(sla.overallRate), barPct: sla.overallRate, caption: `${summary.onTimeCount ?? 0} / ${summary.completedCount ?? 0} on time`, color: VIOLET, testId: "analytics-sla-rate" },
    { label: "Failure index", value: pct(failures.rate), barPct: failures.rate, caption: `${failures.count} overdue + late`, color: RED, testId: "analytics-failure-index" },
  ];

  const railSections: { title: string; rows: { key: string | null; count: number; rate: number }[] }[] = [
    { title: "Action area", rows: failures.byActionArea.map((c) => ({ key: c.actionArea, count: c.count, rate: c.rate })) },
    { title: "Cadence", rows: failures.byCadence.map((c) => ({ key: String(c.cadence), count: c.count, rate: c.rate })) },
    { title: "Type", rows: failures.byType.map((c) => ({ key: String(c.type), count: c.count, rate: c.rate })) },
  ].filter((s) => s.rows.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:flex-row sm:items-center">
        <ScoreRing score={summary.score} />
        <div className="min-w-0">
          <h3 className="font-serif text-[20px]">Engagement Health Score</h3>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">0.4·completion + 0.4·SLA + 0.2·failure-resistance</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
            <span>{summary.poolCount ?? 0} pool items</span>
            <span>{summary.failureCount ?? 0} failure{failures.count === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => <MetricTile key={metric.label} metric={metric} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_.6fr]">
        <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="border-b border-[hsl(var(--border))] px-5 py-4">
            <h3 className="font-serif text-[20px]">Failure board</h3>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Overdue and completed-late items</p>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {failures.rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={Activity} title="No failures — all clear" description="Nothing is overdue or late right now." /></div>
            ) : (
              failures.rows.map((row, index) => {
                const badge = TYPE_BADGE[row.type] ?? TYPE_BADGE.task;
                return (
                  <div key={`${row.type}-${row.id}`} className="flex items-center justify-between gap-4 px-5 py-4" data-testid={`analytics-failure-row-${index}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{row.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${badge.tone}`}>{badge.label}</span>
                        {row.actionArea && <span>{row.actionArea}</span>}
                        {row.type === "task" && row.cadence && <span>· {row.cadence}</span>}
                      </p>
                    </div>
                    <FailureLabel daysOver={row.daysOver} completedAt={row.completedAt} />
                  </div>
                );
              })
            )}
          </div>
        </section>

        {railSections.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="border-b border-[hsl(var(--border))] px-5 py-4">
              <h3 className="font-serif text-[20px]">Where they fail</h3>
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Clusters by area, cadence, type</p>
            </div>
            <div className="space-y-5 px-5 py-4">
              {railSections.map((section) => (
                <div key={section.title}>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]"><AlertTriangle size={11} /> {section.title}</p>
                  <div className="space-y-2.5">
                    {section.rows.map((row) => (
                      <div key={row.key ?? "none"} data-testid={`analytics-cluster-${row.key}`}>
                        <div className="flex items-baseline justify-between text-[12px]">
                          <span className="font-bold capitalize">{row.key}</span>
                          <span className="text-[hsl(var(--muted-foreground))]">{row.count} · {row.rate}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(row.rate, 0), 100)}%`, background: RED }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}