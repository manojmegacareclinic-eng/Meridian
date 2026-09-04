import { useEffect, useState } from "react";
import { Check, ChevronRight, Clock, Flag, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useListDrStrategies,
  useCreateDrStrategy,
  useUpdateDrStrategy,
  useDeleteDrStrategy,
  getListDrStrategiesQueryKey,
} from "@workspace/api-client-react";
import type { DrStrategy, DrStrategyStage, DrStrategyInput } from "@workspace/api-client-react";

type StrategyWithStages = DrStrategy & { stages?: DrStrategyStage[] };
import { queryClient } from "@/lib/query";
import { PrimaryButton, SecondaryButton, AddDialog, FormField, StatusPill, EmptyState, LoadingRows, ErrorState, inputClass, selectClass } from "@/App";

export const STRATEGY_TYPES: { value: DrStrategyInput["type"]; label: string; stages: string[] }[] = [
  { value: "uskdr", label: "USKDR", stages: ["Scoping", "Negotiation", "Approval", "Implementation", "Monitoring"] },
  { value: "hq_agreement", label: "HQ Agreement", stages: ["Drafting", "Negotiation", "Legal Review", "Signature", "Ratification"] },
  { value: "host_country", label: "Host Country Agreement", stages: ["Negotiation", "Legal Review", "Approval", "Signature", "Implementation"] },
  { value: "sister_city", label: "Sister City", stages: ["Proposal", "Agreement", "Exchange Programs", "Review"] },
  { value: "proclamation", label: "Proclamation", stages: ["Drafting", "Review", "Approval", "Publication"] },
  { value: "ngo_partnership", label: "NGO Partnership", stages: ["Scoping", "MOA Drafting", "Review", "Signing", "Implementation"] },
  { value: "refugee_partnership", label: "Refugee Partnership", stages: ["Assessment", "Agreement", "Implementation", "Monitoring"] },
  { value: "university_partnership", label: "University Partnership", stages: ["Proposal", "MOU", "Program Design", "Launch", "Evaluation"] },
  { value: "custom", label: "Custom", stages: [] },
];

const STRATEGY_LABEL: Record<string, string> = Object.fromEntries(STRATEGY_TYPES.map((t) => [t.value, t.label]));

export function StrategyPipeline({ countryId }: { countryId: number }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const strategiesQuery = useListDrStrategies({ countryId });
  const strategies = strategiesQuery.data ?? [];

  useEffect(() => {
    if (selectedId === null && strategies.length) setSelectedId(strategies[0].id);
    if (selectedId !== null && !strategies.some((s) => s.id === selectedId)) setSelectedId(strategies[0]?.id ?? null);
  }, [strategies, selectedId]);

  const selected = strategies.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              onClick={() => setSelectedId(strategy.id)}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
                selectedId === strategy.id
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]"
              }`}
              data-testid={`strategy-chip-${strategy.id}`}
            >
              {strategy.name}
            </button>
          ))}
        </div>
        <CreateStrategy countryId={countryId} />
      </div>

      {strategiesQuery.isLoading ? (
        <LoadingRows count={4} />
      ) : strategiesQuery.isError ? (
        <ErrorState onRetry={() => void strategiesQuery.refetch()} />
      ) : strategies.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No DR strategies yet"
          description="Create the first diplomatic relationship strategy to map its pipeline stages."
          action={<CreateStrategy countryId={countryId} />}
        />
      ) : selected ? (
        <PipelineView key={selected.id} strategy={selected} onChanged={() => void queryClient.invalidateQueries({ queryKey: getListDrStrategiesQueryKey({ countryId }) })} />
      ) : null}
    </div>
  );
}

function CreateStrategy({ countryId }: { countryId: number }) {
  const [open, setOpen] = useState(false);
  const createStrategy = useCreateDrStrategy();
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const type = String(form.get("type")) as DrStrategyInput["type"];
    const input: DrStrategyInput = { countryId, name: String(form.get("name")), type };
    createStrategy.mutate({ data: input }, {
      onSuccess: () => {
        setOpen(false);
        void queryClient.invalidateQueries({ queryKey: getListDrStrategiesQueryKey({ countryId }) });
      },
    });
  };
  return (
    <>
      <PrimaryButton testId="button-add-strategy" onClick={() => setOpen(true)}>
        <Plus size={16} /> New strategy
      </PrimaryButton>
      <AddDialog open={open} title="Create DR strategy" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Strategy name">
            <input name="name" required placeholder="US–KAILASA diplomatic relationship" className={inputClass} data-testid="input-strategy-name" />
          </FormField>
          <FormField label="Strategy type">
            <select name="type" required defaultValue="" className={selectClass} data-testid="select-strategy-type">
              <option value="" disabled>
                Select type
              </option>
              {STRATEGY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-strategy">
              Cancel
            </button>
            <PrimaryButton type="submit" testId="button-submit-strategy">
              {createStrategy.isPending ? "Saving…" : "Create strategy"}
            </PrimaryButton>
          </div>
        </form>
      </AddDialog>
    </>
  );
}

function PipelineView({ strategy, onChanged }: { strategy: DrStrategy; onChanged: () => void }) {
  const stages = (strategy as StrategyWithStages).stages ?? [];
  const [activeStage, setActiveStage] = useState<number>(stages.find((_, i) => i === 0)?.position ?? 0);
  const [editing, setEditing] = useState(false);
  const deleteStrategy = useDeleteDrStrategy();

  useEffect(() => {
    if (stages.length && !stages.some((s) => s.position === activeStage)) {
      setActiveStage(stages[0].position);
    }
  }, [stages, activeStage]);

  if (stages.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-14 text-center">
        <p className="font-semibold">No pipeline stages configured</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">Custom strategies need stage definitions before the pipeline can be visualised.</p>
      </div>
    );
  }

  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const activeIndex = sorted.findIndex((s) => s.position === activeStage);
  const currentStage = sorted[activeIndex];
  const isCurrent = currentStage !== undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="gold">{STRATEGY_LABEL[strategy.type] ?? strategy.type.replace("_", " ")}</StatusPill>
            <StatusPill tone={strategy.isActive ? "green" : "neutral"}>{strategy.isActive ? "Active" : "Archived"}</StatusPill>
          </div>
          <h3 className="mt-2 font-serif text-xl">{strategy.name}</h3>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {sorted.length} stages · {sorted.filter((s) => s.position <= activeStage).length} reached
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton testId="button-edit-strategy" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </SecondaryButton>
          <SecondaryButton variant="destructive" size="sm" testId="button-delete-strategy" onClick={() => deleteStrategy.mutate({ id: strategy.id }, { onSuccess: onChanged })}>
            <Trash2 size={14} /> Delete
          </SecondaryButton>
        </div>
      </div>

      <EditStrategy open={editing} onClose={() => setEditing(false)} strategy={strategy} onSaved={onChanged} />

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {sorted.map((stage, index) => {
            const reached = index <= activeIndex;
            const active = stage.position === activeStage;
            return (
              <div key={stage.position} className="w-52 shrink-0">
                <button
                  onClick={() => setActiveStage(stage.position)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3.5 py-3 text-left text-xs font-bold transition-colors ${
                    active
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : reached
                        ? "border-[hsl(var(--accent-foreground)/.4)] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]"
                        : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                  }`}
                  data-testid={`pipeline-stage-${stage.position}`}
                >
                  {reached ? <Check size={14} /> : <span className="text-[10px]">{index + 1}</span>}
                  <span className="truncate">{stage.label}</span>
                </button>
                {index < sorted.length - 1 && (
                  <div className="mx-auto h-px w-4 bg-[hsl(var(--border))]">
                    <ChevronRight size={12} className="-mt-1 translate-x-2 text-[hsl(var(--muted-foreground))]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <StageDetail stage={currentStage} isCurrent={isCurrent} index={activeIndex} />
    </div>
  );
}

function StageDetail({ stage, isCurrent, index }: { stage: DrStrategyStage; isCurrent: boolean; index: number }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-xs font-bold text-[hsl(var(--primary))]">{index + 1}</span>
          <div>
            <h4 className="font-serif text-lg leading-none">{stage.label}</h4>
            <p className="mt-1 text-[11px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Pipeline stage</p>
          </div>
        </div>
        {isCurrent && <StatusPill tone="blue">Current stage</StatusPill>}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
          <p className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"><Flag size={13} /> SLA</p>
          <p className="mt-1 text-lg font-bold">{stage.slaDays ? `${stage.slaDays} days` : "No SLA"}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4 sm:col-span-2">
          <p className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--muted-foreground))]"><Clock size={13} /> Description</p>
          <p className="mt-1 text-sm">{stage.description || "No description set for this stage."}</p>
        </div>
      </div>
      {stage.requiredFields && Object.keys(stage.requiredFields as Record<string, unknown>).length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Required fields</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(stage.requiredFields as Record<string, unknown>).map(([key, value]) => (
              <span key={key} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-[11px] font-bold">
                {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                {value ? " *" : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EditStrategy({ open, onClose, strategy, onSaved }: { open: boolean; onClose: () => void; strategy: DrStrategy; onSaved: () => void }) {
  const [customStages, setCustomStages] = useState(() => (strategy.customStages as unknown as string[] | null)?.join("\n") ?? "");
  const updateStrategy = useUpdateDrStrategy();

  useEffect(() => {
    setCustomStages((strategy.customStages as unknown as string[] | null)?.join("\n") ?? "");
  }, [strategy, open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data: { name?: string; isActive?: boolean } = {
      name: String(form.get("name")),
      isActive: String(form.get("isActive")) === "true",
    };
    updateStrategy.mutate({ id: strategy.id, data }, { onSuccess: () => { onClose(); onSaved(); } });
  };

  return (
    <AddDialog open={open} title="Edit DR strategy" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Strategy name">
          <input name="name" required defaultValue={strategy.name} className={inputClass} data-testid="input-strategy-name-edit" />
        </FormField>
        <FormField label="Status">
          <select name="isActive" defaultValue={String(strategy.isActive)} className={selectClass} data-testid="select-strategy-active">
            <option value="true">Active</option>
            <option value="false">Archived</option>
          </select>
        </FormField>
        {STRATEGY_LABEL[strategy.type] === "Custom" && (
          <FormField label="Custom stages (one per line)">
            <textarea name="customStages" value={customStages} onChange={(e) => setCustomStages(e.target.value)} rows={5} className={inputClass} data-testid="textarea-strategy-stages" />
          </FormField>
        )}
        <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-strategy-edit">
            Cancel
          </button>
          <PrimaryButton type="submit" testId="button-submit-strategy-edit">
            {updateStrategy.isPending ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </div>
      </form>
    </AddDialog>
  );
}
