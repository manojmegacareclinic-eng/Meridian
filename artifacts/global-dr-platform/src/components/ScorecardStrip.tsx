import { Link } from "@tanstack/react-router";
import { useListScorecards } from "@workspace/api-client-react";
import type { ScorecardSummary } from "@workspace/api-client-react";
import { ErrorState, LoadingRows } from "@/App";

const GREEN = "hsl(157 38% 39%)";
const AMBER = "hsl(28 73% 48%)";
const RED = "hsl(4 64% 48%)";

const pct = (value?: number | null) => (value == null ? "—" : `${value}%`);

function MiniRing({ score }: { score: number | null | undefined }) {
  const size = 42;
  const thickness = 5;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const filled = score == null ? 0 : (Math.min(Math.max(score, 0), 100) / 100) * c;
  const color = score == null ? "hsl(215 14% 60%)" : score >= 70 ? GREEN : score >= 40 ? AMBER : RED;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {filled > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round" strokeDasharray={`${filled} ${c - filled}`} />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-serif text-[12px] font-bold">{score == null ? "—" : score}</span>
      </div>
    </div>
  );
}

function ScorecardCard({ summary }: { summary: ScorecardSummary }) {
  return (
    <Link
      to="/country/$countryId"
      params={{ countryId: String(summary.countryId) }}
      search={{ tab: "analytics" }}
      className="group block min-w-[230px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_4px_16px_hsl(190_20%_20%/.03)] hover:-translate-y-0.5 hover:border-[hsl(var(--accent-foreground)/.45)] hover:shadow-[0_12px_25px_hsl(190_20%_20%/.08)]"
      data-testid={`scorecard-card-${summary.countryId}`}
    >
      <p className="truncate text-sm font-bold">{summary.countryName}</p>
      <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{summary.poolCount ?? 0} pool items</p>
      {summary.score == null ? (
        <p className="mt-3.5 text-[13px] text-[hsl(var(--muted-foreground))]" data-testid="scorecard-no-data">— No data</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <MiniRing score={summary.score} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">comp {pct(summary.completionPct)} · sla {pct(summary.slaRate)}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(summary.completionPct ?? 0, 0), 100)}%`, background: GREEN }} />
            </div>
          </div>
        </div>
      )}
    </Link>
  );
}

export function ScorecardStrip() {
  const query = useListScorecards();
  if (query.isLoading) return <LoadingRows count={4} />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section className="mb-8" data-testid="overview-scorecard-strip">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Health snapshot</h3>
        <span className="h-px flex-1 bg-[hsl(var(--border))]" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((summary) => <ScorecardCard key={summary.countryId} summary={summary} />)}
      </div>
    </section>
  );
}