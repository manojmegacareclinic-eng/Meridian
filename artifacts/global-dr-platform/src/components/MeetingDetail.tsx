import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  ListChecks,
  Mic,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  useListMeetings,
  useListMeetingAgenda,
  useListMeetingParticipants,
  useListMeetingTranscripts,
  useListActionItems,
  useListDeliverables,
  useCreateMeetingAgenda,
  useUpdateMeetingAgenda,
  useDeleteMeetingAgenda,
  useCreateMeetingParticipant,
  useDeleteMeetingParticipant,
  useCreateMeetingTranscript,
  useCreateActionItem,
  useCreateDeliverable,
  getListMeetingAgendaQueryKey,
  getListMeetingParticipantsQueryKey,
  getListMeetingTranscriptsQueryKey,
  getListActionItemsQueryKey,
  getListDeliverablesQueryKey,
} from "@workspace/api-client-react";
import type {
  Meeting,
  MeetingAgenda,
  MeetingParticipant,
  MeetingTranscript,
  ActionItem,
  Deliverable,
} from "@workspace/api-client-react";
import { Link, useParams } from "@tanstack/react-router";
import { queryClient } from "@/lib/query";
import { PrimaryButton, AddDialog, FormField, StatusPill, EmptyState, LoadingRows, ErrorState, inputClass, selectClass } from "@/App";

const DETAIL_TABS = ["overview", "agenda", "participants", "transcripts", "actions", "deliverables"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const detailTabLabel: Record<DetailTab, string> = {
  overview: "Details",
  agenda: "Agenda",
  participants: "Participants",
  transcripts: "Transcripts",
  actions: "Action Items",
  deliverables: "Deliverables",
};

const formatDate = (value?: string | null, withYear = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(date);
};

const formatTime = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
};

export function MeetingDetailPage() {
  const params = useParams({ from: "/meeting/$meetingId", strict: true });
  const meetingId = Number(params.meetingId);
  const meetingsQuery = useListMeetings();
  const meeting = (meetingsQuery.data ?? []).find((m) => m.id === meetingId);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  if (meetingsQuery.isLoading) return <LoadingRows count={6} />;
  if (meetingsQuery.isError) return <ErrorState onRetry={() => void meetingsQuery.refetch()} />;
  if (!meeting) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState icon={CalendarDays} title="Meeting not found" description="This meeting could not be located in the current workspace." />
      </div>
    );
  }

  return (
    <div className="animate-rise-in space-y-5">
      <BackLink />
      <header className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusPill tone={toneForStatus(meeting.status)}>{meeting.status.replace("_", " ")}</StatusPill>
          <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{meeting.countryName}</span>
        </div>
        <h1 className="font-serif text-2xl">{meeting.title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
          <span>
            {formatDate(meeting.date, true)} · {formatTime(meeting.date)}
          </span>
          <span>{meeting.actionArea}</span>
          <span>{meeting.participants} participants</span>
          {meeting.owner && <span>Owner: {meeting.owner}</span>}
        </div>
      </header>

      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {DETAIL_TABS.map((tab) => (
          <DetailTabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>
            {detailTabLabel[tab]}
          </DetailTabButton>
        ))}
      </div>

      <div>
        {activeTab === "overview" && <OverviewTab meeting={meeting} />}
        {activeTab === "agenda" && <AgendaTab meetingId={meetingId} />}
        {activeTab === "participants" && <ParticipantsTab meetingId={meetingId} />}
        {activeTab === "transcripts" && <TranscriptsTab meetingId={meetingId} />}
        {activeTab === "actions" && <ActionItemsTab meetingId={meetingId} />}
        {activeTab === "deliverables" && <DeliverablesTab meetingId={meetingId} />}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/meetings" className="inline-flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" data-testid="link-back-to-meetings">
      <ArrowLeft size={14} /> Back to meetings
    </Link>
  );
}

function DetailTabButton({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
        active ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
      }`}
    >
      {children}
    </button>
  );
}

function OverviewTab({ meeting }: { meeting: Meeting }) {
  const rows = [
    ["Status", meeting.status.replace("_", " ")],
    ["Action area", meeting.actionArea],
    ["Owner", meeting.owner || "Unassigned"],
    ["Scheduled", `${formatDate(meeting.date, true)} · ${formatTime(meeting.date)}`],
    ["Recorded participants", String(meeting.participants)],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-lg"><ClipboardList size={16} /> Engagement brief</h3>
        <dl className="divide-y divide-[hsl(var(--border))]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-[hsl(var(--muted-foreground))]">{label}</dt>
              <dd className="text-right font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <h3 className="mb-3 flex items-center gap-2 font-serif text-lg"><FileText size={16} /> Context</h3>
        <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
          Use the Agenda, Participants, Transcripts, and Action Items tabs to capture the full record of this engagement — from the items discussed to the commitments that carry it forward.
        </p>
      </div>
    </div>
  );
}

function AgendaTab({ meetingId }: { meetingId: number }) {
  const agendaQuery = useListMeetingAgenda(meetingId);
  const createAgenda = useCreateMeetingAgenda();
  const updateAgenda = useUpdateMeetingAgenda();
  const deleteAgenda = useDeleteMeetingAgenda();
  const [open, setOpen] = useState(false);
  const items = agendaQuery.data ?? [];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListMeetingAgendaQueryKey(meetingId) });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createAgenda.mutate(
      {
        id: meetingId,
        data: {
          meetingId,
          title: String(form.get("title")),
          description: String(form.get("description") || ""),
          presenter: String(form.get("presenter") || ""),
          durationMinutes: Number(form.get("durationMinutes")) || undefined,
        },
      },
      { onSuccess: () => { setOpen(false); invalidate(); } }
    );
  };

  const setStatus = (item: MeetingAgenda, status: "pending" | "in_progress" | "completed") =>
    updateAgenda.mutate({ id: meetingId, itemId: item.id, data: { status } }, { onSuccess: invalidate });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrimaryButton testId="button-add-agenda" onClick={() => setOpen(true)}><Plus size={16} /> Add agenda item</PrimaryButton>
      </div>
      <AddDialog open={open} title="Add agenda item" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Title"><input name="title" required className={inputClass} data-testid="input-agenda-title" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Presenter"><input name="presenter" className={inputClass} data-testid="input-agenda-presenter" /></FormField>
            <FormField label="Duration (minutes)"><input name="durationMinutes" type="number" min="1" className={inputClass} data-testid="input-agenda-duration" /></FormField>
          </div>
          <FormField label="Description"><textarea name="description" rows={3} className={inputClass} data-testid="textarea-agenda-description" /></FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-agenda">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-agenda">{createAgenda.isPending ? "Saving…" : "Add item"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      {agendaQuery.isLoading ? <LoadingRows count={4} /> : agendaQuery.isError ? <ErrorState onRetry={() => void agendaQuery.refetch()} /> : items.length ? (
        <div className="space-y-2">
          {[...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" data-testid={`row-agenda-${item.id}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--primary))]">{(item.order ?? 0) + 1}</span>
                  <p className="text-sm font-bold">{item.title}</p>
                  {item.status !== "pending" && <StatusPill tone={item.status === "completed" ? "green" : "gold"}>{item.status.replace("_", " ")}</StatusPill>}
                </div>
                {item.description && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{item.description}</p>}
                <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{item.presenter && `${item.presenter} · `}{item.durationMinutes ? `${item.durationMinutes} min` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={item.status} onChange={(e) => setStatus(item, e.target.value as "pending" | "in_progress" | "completed")} className="h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-[11px] font-bold" data-testid={`select-agenda-status-${item.id}`}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                <button onClick={() => deleteAgenda.mutate({ id: meetingId, itemId: item.id }, { onSuccess: invalidate })} className="h-8 w-8 rounded-lg text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.15)]" aria-label={`Delete ${item.title}`} data-testid={`button-delete-agenda-${item.id}`}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={ListChecks} title="No agenda items yet" description="Break this meeting into an ordered list of items to discuss." />}
    </div>
  );
}

function ParticipantsTab({ meetingId }: { meetingId: number }) {
  const participantsQuery = useListMeetingParticipants(meetingId);
  const createParticipant = useCreateMeetingParticipant();
  const deleteParticipant = useDeleteMeetingParticipant();
  const [open, setOpen] = useState(false);
  const items = participantsQuery.data ?? [];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListMeetingParticipantsQueryKey(meetingId) });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createParticipant.mutate(
      { id: meetingId, data: { meetingId, name: String(form.get("name")), role: String(form.get("role") || ""), organization: String(form.get("organization") || "") } },
      { onSuccess: () => { setOpen(false); invalidate(); } }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrimaryButton testId="button-add-participant" onClick={() => setOpen(true)}><UserPlus size={16} /> Add participant</PrimaryButton>
      </div>
      <AddDialog open={open} title="Add participant" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Name"><input name="name" required className={inputClass} data-testid="input-participant-name" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Role"><input name="role" className={inputClass} data-testid="input-participant-role" /></FormField>
            <FormField label="Organization"><input name="organization" className={inputClass} data-testid="input-participant-organization" /></FormField>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-participant">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-participant">{createParticipant.isPending ? "Saving…" : "Add participant"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      {participantsQuery.isLoading ? <LoadingRows count={4} /> : participantsQuery.isError ? <ErrorState onRetry={() => void participantsQuery.refetch()} /> : items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" data-testid={`row-participant-${item.id}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--primary))]">{initials(item.name)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{item.name}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{[item.role, item.organization].filter(Boolean).join(" · ") || "Participant"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={item.attended ? "green" : "neutral"}>{item.attended ? "Attended" : "No-show"}</StatusPill>
                <button onClick={() => deleteParticipant.mutate({ id: meetingId, pid: item.id }, { onSuccess: invalidate })} className="h-8 w-8 rounded-lg text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.15)]" aria-label={`Remove ${item.name}`} data-testid={`button-delete-participant-${item.id}`}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={Users} title="No participants recorded" description="Add the attendees for this engagement." />}
    </div>
  );
}

function TranscriptsTab({ meetingId }: { meetingId: number }) {
  const transcriptsQuery = useListMeetingTranscripts(meetingId);
  const createTranscript = useCreateMeetingTranscript();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"transcript" | "notes" | "summary">("notes");
  const items = transcriptsQuery.data ?? [];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListMeetingTranscriptsQueryKey(meetingId) });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createTranscript.mutate(
      {
        id: meetingId,
        data: {
          meetingId,
          authorId: "current-user",
          authorName: String(form.get("authorName") || "Team member"),
          content: String(form.get("content")),
          type,
        },
      },
      { onSuccess: () => { setOpen(false); invalidate(); } }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrimaryButton testId="button-add-transcript" onClick={() => setOpen(true)}><Plus size={16} /> Add note</PrimaryButton>
      </div>
      <AddDialog open={open} title="Add transcript or note" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Type">
              <select value={type} onChange={(e) => setType(e.target.value as "transcript" | "notes" | "summary")} className={selectClass} data-testid="select-transcript-type">
                <option value="notes">Notes</option>
                <option value="summary">Summary</option>
                <option value="transcript">Transcript</option>
              </select>
            </FormField>
            <FormField label="Author"><input name="authorName" defaultValue="Team member" className={inputClass} data-testid="input-transcript-author" /></FormField>
          </div>
          <FormField label="Content"><textarea name="content" required rows={6} className={inputClass} data-testid="textarea-transcript-content" /></FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-transcript">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-transcript">{createTranscript.isPending ? "Saving…" : "Save note"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      {transcriptsQuery.isLoading ? <LoadingRows count={4} /> : transcriptsQuery.isError ? <ErrorState onRetry={() => void transcriptsQuery.refetch()} /> : items.length ? (
        <div className="space-y-2">
          {[...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((item) => (
            <article key={item.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" data-testid={`row-transcript-${item.id}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mic size={14} className="text-[hsl(var(--muted-foreground))]" />
                  <StatusPill tone={item.type === "summary" ? "green" : item.type === "transcript" ? "blue" : "neutral"}>{item.type}</StatusPill>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{item.authorName}</span>
                </div>
                <time className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{formatDate(item.createdAt, true)} {formatTime(item.createdAt)}</time>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
            </article>
          ))}
        </div>
      ) : <EmptyState icon={Mic} title="No notes recorded" description="Capture transcripts, notes, or a summary of this meeting." />}
    </div>
  );
}

function ActionItemsTab({ meetingId }: { meetingId: number }) {
  const actionItemsQuery = useListActionItems(meetingId);
  const createActionItem = useCreateActionItem();
  const [open, setOpen] = useState(false);
  const items = actionItemsQuery.data ?? [];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListActionItemsQueryKey(meetingId) });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createActionItem.mutate(
      {
        id: meetingId,
        data: {
          meetingId,
          description: String(form.get("description")),
          assignee: String(form.get("assignee")),
          dueDate: String(form.get("dueDate") || "") || null,
        },
      },
      { onSuccess: () => { setOpen(false); invalidate(); } }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrimaryButton testId="button-add-action-item" onClick={() => setOpen(true)}><Plus size={16} /> Add action item</PrimaryButton>
      </div>
      <AddDialog open={open} title="Add action item" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Description"><textarea name="description" required rows={3} className={inputClass} data-testid="textarea-action-description" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Assignee"><input name="assignee" required className={inputClass} data-testid="input-action-assignee" /></FormField>
            <FormField label="Due date"><input name="dueDate" type="date" className={inputClass} data-testid="input-action-due" /></FormField>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-action">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-action">{createActionItem.isPending ? "Saving…" : "Add action item"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      {actionItemsQuery.isLoading ? <LoadingRows count={4} /> : actionItemsQuery.isError ? <ErrorState onRetry={() => void actionItemsQuery.refetch()} /> : items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" data-testid={`row-action-${item.id}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{item.description}</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Assignee: {item.assignee}{item.dueDate ? ` · Due ${formatDate(item.dueDate, true)}` : ""}</p>
              </div>
              <StatusPill tone={toneForStatus(item.status)}>{item.status.replace("_", " ")}</StatusPill>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={CheckCircle2} title="No action items yet" description="Convert this meeting's commitments into tracked actions." />}
    </div>
  );
}

function DeliverablesTab({ meetingId }: { meetingId: number }) {
  const actionItemsQuery = useListActionItems(meetingId);
  const deliverablesQuery = useListDeliverables();
  const createDeliverable = useCreateDeliverable();
  const [open, setOpen] = useState(false);
  const [selectedActionItemId, setSelectedActionItemId] = useState<number | "">("");
  const actionItems = actionItemsQuery.data ?? [];
  const deliverables = deliverablesQuery.data ?? [];
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListActionItemsQueryKey(meetingId) });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createDeliverable.mutate(
      {
        data: {
          actionItemId: Number(selectedActionItemId),
          title: String(form.get("title")),
          description: String(form.get("description") || ""),
          dueDate: String(form.get("dueDate") || "") || null,
          url: String(form.get("url") || "") || undefined,
        },
      },
      { onSuccess: () => { setOpen(false); setSelectedActionItemId(""); invalidate(); } }
    );
  };

  const links = new Map<number, ActionItem>();
  actionItems.forEach((ai) => links.set(ai.id, ai));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PrimaryButton testId="button-add-deliverable" onClick={() => setOpen(true)}><Plus size={16} /> Add deliverable</PrimaryButton>
      </div>
      <AddDialog open={open} title="Add deliverable" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-4">
          <FormField label="Linked action item">
            <select value={selectedActionItemId} onChange={(e) => setSelectedActionItemId(e.target.value === "" ? "" : Number(e.target.value))} required className={selectClass} data-testid="select-deliverable-action">
              <option value="" disabled>Select action item</option>
              {actionItems.map((ai) => <option key={ai.id} value={ai.id}>{ai.description}</option>)}
            </select>
          </FormField>
          <FormField label="Deliverable title"><input name="title" required className={inputClass} data-testid="input-deliverable-title" /></FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Due date"><input name="dueDate" type="date" className={inputClass} data-testid="input-deliverable-due" /></FormField>
            <FormField label="URL (optional)"><input name="url" type="url" className={inputClass} data-testid="input-deliverable-url" /></FormField>
          </div>
          <FormField label="Description"><textarea name="description" rows={3} className={inputClass} data-testid="textarea-deliverable-description" /></FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-deliverable">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-deliverable">{createDeliverable.isPending ? "Saving…" : "Add deliverable"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      {deliverablesQuery.isLoading ? <LoadingRows count={4} /> : deliverablesQuery.isError ? <ErrorState onRetry={() => void deliverablesQuery.refetch()} /> : deliverables.length ? (
        <div className="space-y-2">
          {deliverables.map((item) => {
            const action = links.get(item.actionItemId);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" data-testid={`row-deliverable-${item.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{action ? `From: ${action.description}` : "Linked action item"}{item.dueDate ? ` · Due ${formatDate(item.dueDate, true)}` : ""}</p>
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-bold text-[hsl(var(--primary))] underline">{item.url}</a>}
                </div>
                <StatusPill tone={toneForStatus(item.status)}>{item.status.replace("_", " ")}</StatusPill>
              </div>
            );
          })}
        </div>
      ) : <EmptyState icon={FileText} title="No deliverables yet" description="Attach a concrete deliverable to an action item." />}
    </div>
  );
}

function toneForStatus(status: string): "neutral" | "gold" | "green" | "red" | "blue" {
  if (["active", "signed", "verified", "completed"].includes(status)) return "green";
  if (["review", "scheduled", "in_progress", "follow_up", "approved"].includes(status)) return "gold";
  if (["outdated", "inactive", "archived", "cancelled"].includes(status)) return "red";
  return "blue";
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}
