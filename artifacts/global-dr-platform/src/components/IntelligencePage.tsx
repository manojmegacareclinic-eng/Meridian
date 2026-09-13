import { useState } from 'react';
import { CheckCircle2, ExternalLink, Radar, ShieldAlert, X } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  getListChangeEventsQueryKey,
  getListIntelligenceFindingsQueryKey,
  getListNotificationsQueryKey,
  useApproveIntelligenceFinding,
  useListChangeEvents,
  useListIntelligenceFindings,
  useListIntelligenceSources,
  useRejectIntelligenceFinding,
} from '@workspace/api-client-react';
import type { ChangeEvent, IntelligenceFinding } from '@workspace/api-client-react';
import { queryClient } from '@/lib/query';
import { useSessionInfo } from '@/lib/auth';
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageIntro,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
} from '@/App';

const TOPIC_LABELS: Record<string, string> = {
  government_change: 'Government change',
  election: 'Election',
  diplomatic_news: 'Diplomatic news',
  religious_affairs: 'Religious affairs',
  ngo_news: 'NGO news',
  university_news: 'University news',
  other: 'Other',
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  government_site: 'Government site',
  parliament_directory: 'Parliament directory',
  embassy_site: 'Embassy site',
  government_gazette: 'Government gazette',
  linkedin: 'LinkedIn',
  facebook_x: 'Facebook / X',
  other: 'Other',
};

const STAGE_LABELS: Record<string, string> = {
  open: 'Open',
  approved: 'Approved',
  rejected: 'Rejected',
};

type StageTab = 'all' | 'open' | 'approved' | 'rejected';

const confidenceColor = (confidence: number) =>
  confidence >= 70 ? 'hsl(157_38%_39%)' : confidence >= 50 ? 'hsl(28_73%_48%)' : 'hsl(190_54%_46%)';

const tierTone = (tier: number): 'gold' | 'blue' | 'neutral' =>
  tier <= 2 ? 'gold' : tier <= 4 ? 'blue' : 'neutral';

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const invalidateOnDecision = () => {
  void queryClient.invalidateQueries({ queryKey: getListIntelligenceFindingsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  void queryClient.invalidateQueries({ queryKey: getListChangeEventsQueryKey() });
};

function FindingCard({ finding, focused, isWriter }: { finding: IntelligenceFinding; focused: boolean; isWriter: boolean }) {
  const relevant = Boolean(finding.targetType && finding.field && finding.value);
  const hasTarget = finding.targetType === 'country' && finding.targetId != null;
  return (
    <article
      id={focused ? 'focused-finding' : undefined}
      data-testid={`finding-card-${finding.id}`}
      className={`rounded-2xl border bg-[hsl(var(--card))] p-5 shadow-[0_4px_16px_hsl(190_20%_20%/.03)] ${focused ? 'border-[hsl(var(--accent-foreground))] ring-2 ring-[hsl(var(--accent)/.45)]' : 'border-[hsl(var(--border))]'}`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill tone={tierTone(finding.sourceTier ?? 7)}>Tier {finding.sourceTier ?? '—'}</StatusPill>
        <StatusPill tone="neutral">{TOPIC_LABELS[finding.topic] ?? finding.topic}</StatusPill>
        {finding.stage !== 'open' && (
          <StatusPill tone={finding.stage === 'approved' ? 'green' : 'red'}>{STAGE_LABELS[finding.stage]}</StatusPill>
        )}
        {finding.applied && <StatusPill tone="green"><CheckCircle2 size={11} /> Applied</StatusPill>}
        {focused && <StatusPill tone="blue"><Radar size={11} /> Focused</StatusPill>}
      </div>
      <h3 className="font-serif text-[21px] leading-snug">{finding.headline}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
        <span className="font-bold">{finding.sourceName ?? 'Unknown source'}</span>
        {finding.url && (
          <a href={finding.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all italic underline decoration-dotted underline-offset-2 hover:text-[hsl(var(--foreground))]" data-testid={`finding-source-link-${finding.id}`}>
            {finding.url.split('/').slice(2).join('')} <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[hsl(var(--secondary))]">
          <div className="h-full rounded-full" style={{ width: `${finding.confidence}%`, backgroundColor: confidenceColor(finding.confidence) }} data-testid={`finding-confidence-${finding.id}`} />
        </div>
        <span className="font-mono text-[11px] font-bold" style={{ color: confidenceColor(finding.confidence) }}>{finding.confidence}%</span>
      </div>
      {finding.summary && <p className="mt-3 text-[13px] leading-6 text-[hsl(var(--muted-foreground))]">{finding.summary}</p>}
      {finding.reviewNote && <p className="mt-3 rounded-xl bg-[hsl(var(--muted)/.7)] px-3.5 py-2.5 text-xs italic leading-5 text-[hsl(var(--muted-foreground))]" data-testid={`finding-review-note-${finding.id}`}>Review note: {finding.reviewNote}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span>Raised {formatDate(finding.createdAt)}</span>
          {hasTarget && (
            <Link to="/country/$countryId" params={{ countryId: String(finding.targetId) }} search={{ tab: 'government' }} className="font-bold text-[hsl(var(--accent-foreground))] hover:underline" data-testid={`finding-target-link-${finding.id}`}>
              Open country record →
            </Link>
          )}
        </div>
        {finding.stage === 'open' && <OpenActions finding={finding} isWriter={isWriter} />}
      </div>
    </article>
  );
}

function OpenActions({ finding, isWriter }: { finding: IntelligenceFinding; isWriter: boolean }) {
  const approve = useApproveIntelligenceFinding();
  const reject = useRejectIntelligenceFinding();
  const relevant = Boolean(finding.targetType && finding.field && finding.value);
  const [apply, setApply] = useState(true);
  const [pending, setPending] = useState(false);
  if (!isWriter) {
    return <span className="text-[11px] text-[hsl(var(--muted-foreground))]">Awaiting a reviewer's decision</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {relevant && (
        <label className="mr-1 inline-flex items-center gap-2 text-[11px] font-bold text-[hsl(var(--muted-foreground))]">
          <input type="checkbox" checked={apply} onChange={(event) => setApply(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent-foreground))]" data-testid={`checkbox-apply-${finding.id}`} />
          Apply the proposed change to the official record
        </label>
      )}
      <SecondaryButton size="sm" variant="destructive" testId={`button-reject-${finding.id}`} onClick={() => reject.mutate({ id: finding.id }, { onSuccess: () => invalidateOnDecision() })}>Reject</SecondaryButton>
      <PrimaryButton testId={`button-approve-${finding.id}`} onClick={() => {
        setPending(true);
        approve.mutate({ id: finding.id, data: { apply: relevant && apply } }, {
          onSettled: () => { setPending(false); invalidateOnDecision(); },
        });
      }}>{pending ? 'Approving…' : 'Approve'}</PrimaryButton>
    </div>
  );
}

export function IntelligencePage() {
  const navigate = useNavigate();
  const { focus } = useSearch({ from: '/intelligence' });
  const [tab, setTab] = useState<StageTab>('all');
  const findingsQuery = useListIntelligenceFindings();
  const sourcesQuery = useListIntelligenceSources();
  const changeEventsQuery = useListChangeEvents();
  const { user } = useSessionInfo();
  const isWriter = (user?.role ?? '') !== 'viewer';

  const findings = findingsQuery.data?.items ?? [];
  const sources = sourcesQuery.data?.items ?? [];
  const changeEvents = changeEventsQuery.data?.items ?? [];

  const counts = {
    all: findings.length,
    open: findings.filter((f) => f.stage === 'open').length,
    approved: findings.filter((f) => f.stage === 'approved').length,
    rejected: findings.filter((f) => f.stage === 'rejected').length,
  };

  const visible = tab === 'all' ? findings : findings.filter((f) => f.stage === tab);
  const focusId = focus ? Number(focus) : undefined;

  return (
    <div className="animate-rise-in">
      <PageIntro
        eyebrow="Intelligence / Source verification"
        title="Know where the signal came from."
        description="Every finding is traced to a source, scored for confidence, and waits on a human decision before it can touch the official record."
      />

      {focusId != null && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.1)] px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--accent-foreground))]"><Radar size={14} /> Highlighting finding {focusId}</span>
          <button onClick={() => void navigate({ to: '/intelligence', search: { focus: undefined }, replace: true })} className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Clear finding highlight" data-testid="button-clear-focus"><X size={14} /></button>
        </div>
      )}

      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-5">
          <div>
            <h3 className="font-serif text-[22px]">Approval queue</h3>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Findings ranked open-first; only an authorised reviewer may decide.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([['all', 'All'], ['open', 'Open'], ['approved', 'Approved'], ['rejected', 'Rejected']] as [StageTab, string][]).map(([value, label]) => (
              <button key={value} onClick={() => setTab(value)} className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold ${tab === value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]'}`} data-testid={`button-tab-${value}`}>
                {label} <span className="ml-1 font-mono text-[10px] opacity-75">{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {findingsQuery.isLoading ? (
            <div className="p-6"><LoadingRows count={4} /></div>
          ) : findingsQuery.isError ? (
            <div className="p-6"><ErrorState onRetry={() => void findingsQuery.refetch()} /></div>
          ) : visible.length === 0 ? (
            <div className="p-6"><EmptyState icon={Radar} title="Nothing in this view" description={tab === 'open' ? 'No findings are awaiting a decision right now.' : 'No findings match this stage yet.'} /></div>
          ) : visible.map((finding) => (
            <div className="p-6" key={finding.id} ref={(el) => { if (el && finding.id === focusId) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}>
              <FindingCard finding={finding} focused={finding.id === focusId} isWriter={isWriter} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--border))] px-6 py-5">
          <h3 className="font-serif text-[22px]">Sources of record</h3>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Credibility tiers — tier 1 is the most authoritative; present findings cite the source.</p>
        </div>
        {sourcesQuery.isLoading ? (
          <div className="p-6"><LoadingRows count={3} /></div>
        ) : sourcesQuery.isError ? (
          <div className="p-6"><ErrorState onRetry={() => void sourcesQuery.refetch()} /></div>
        ) : sources.length === 0 ? (
          <div className="p-6"><EmptyState icon={ShieldAlert} title="No sources registered" description="Register the first source of record to begin verification." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="sources-table">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.4)] text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Source</th>
                  <th className="px-6 py-3">Kind</th>
                  <th className="px-6 py-3">Tier</th>
                  <th className="px-6 py-3">Base URL</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border))]">
                {sources.map((source) => (
                  <tr key={source.id} data-testid={`source-row-${source.id}`}>
                    <td className="px-6 py-3.5 font-bold">{source.name}</td>
                    <td className="px-6 py-3.5">{SOURCE_KIND_LABELS[source.kind] ?? source.kind}</td>
                    <td className="px-6 py-3.5"><StatusPill tone={tierTone(source.tier)}><span data-testid={`source-tier-${source.id}`}>Tier {source.tier}</span></StatusPill></td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{source.baseUrl}</td>
                    <td className="px-6 py-3.5"><StatusPill tone={source.status === 'active' ? 'green' : source.status === 'paused' ? 'gold' : 'red'}>{source.status}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--border))] px-6 py-5">
          <h3 className="font-serif text-[22px]">Applied changes</h3>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Official records changed on approved findings — a traceable, timestamped trail.</p>
        </div>
        {changeEventsQuery.isLoading ? (
          <div className="p-6"><LoadingRows count={3} /></div>
        ) : changeEventsQuery.isError ? (
          <div className="p-6"><ErrorState onRetry={() => void changeEventsQuery.refetch()} /></div>
        ) : changeEvents.length === 0 ? (
          <div className="p-6"><EmptyState icon={CheckCircle2} title="No applied changes yet" description="When a finding is approved with apply, its change to the official record appears here." /></div>
        ) : changeEvents.map((event) => <ChangeEventRow key={event.id} event={event} />)}
      </section>
    </div>
  );
}

function ChangeEventRow({ event }: { event: ChangeEvent }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-6 py-4 last:border-0" data-testid={`change-event-${event.id}`}>
      <div className="min-w-0">
        <p className="text-xs font-bold">{event.entityType} #{event.entityId} · <span className="font-mono">{event.field}</span></p>
        <p className="mt-1 font-mono text-[11px] text-[hsl(var(--muted-foreground))]"><span className="line-through opacity-70">{event.beforeValue || 'empty'}</span> → <span className="text-[hsl(157_38%_39%)]">{event.afterValue}</span></p>
      </div>
      <div className="shrink-0 text-right">
        <StatusPill tone="green">Applied</StatusPill>
        <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatDate(event.reviewedAt)}</p>
      </div>
    </div>
  );
}