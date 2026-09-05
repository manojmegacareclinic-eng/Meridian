import { useState } from "react";
import { Calendar, CheckCircle2, Edit2, Plus, Trash2, User } from "lucide-react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import type { Task, TaskInput, TaskUpdate } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query";
import { EmptyPlaceholder, ErrorState, LoadingRows, PrimaryButton, AddDialog, FormField, StatusPill, inputClass, selectClass } from "@/App";
import { ACTION_AREAS, TASK_CADENCES, TASK_STATUSES, CADENCE_LABEL, STATUS_LABEL } from "@/lib/tasks";

const EMPTY_FORM = {
  title: "",
  description: "",
  actionArea: "",
  cadence: "weekly",
  owner: "",
  status: "active",
  dueDate: "",
  lastDoneAt: "",
};

const toDateInput = (d?: string | null) => (d ? String(d).slice(0, 10) : "");

const shortDate = (d?: string | null) => (d ? String(d).slice(0, 10) : "");

export function TasksTab({ countryId }: { countryId: number }) {
  const tasksQuery = useListTasks({ countryId });
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const tasks = tasksQuery.data ?? [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: getListTasksQueryKey({ countryId }) });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      actionArea: task.actionArea,
      cadence: task.cadence,
      owner: task.owner ?? "",
      status: task.status,
      dueDate: toDateInput(task.dueDate),
      lastDoneAt: toDateInput(task.lastDoneAt),
    });
    setOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editing) {
      const data: TaskUpdate = {
        title: form.title,
        actionArea: form.actionArea as TaskUpdate["actionArea"],
        cadence: form.cadence as TaskUpdate["cadence"],
        description: form.description === "" ? null : form.description,
        owner: form.owner === "" ? null : form.owner,
        status: form.status as TaskUpdate["status"],
        dueDate: form.dueDate === "" ? null : form.dueDate,
        lastDoneAt: form.lastDoneAt === "" ? null : form.lastDoneAt,
      };
      updateTask.mutate({ id: editing.id, data }, { onSuccess: () => { setOpen(false); invalidate(); } });
    } else {
      const data: TaskInput = {
        countryId,
        title: form.title,
        actionArea: form.actionArea as TaskInput["actionArea"],
        cadence: form.cadence as TaskInput["cadence"],
        description: form.description === "" ? undefined : form.description,
        owner: form.owner === "" ? undefined : form.owner,
        status: form.status as TaskInput["status"],
        dueDate: form.dueDate === "" ? undefined : form.dueDate,
        lastDoneAt: form.lastDoneAt === "" ? undefined : form.lastDoneAt,
      };
      createTask.mutate({ data }, { onSuccess: () => { setOpen(false); invalidate(); } });
    }
  };

  const handleDelete = (task: Task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    deleteTask.mutate({ id: task.id }, { onSuccess: invalidate });
  };

  const statusTone: Record<string, "neutral" | "gold" | "green" | "red" | "blue"> = {
    active: "green",
    paused: "gold",
    done: "blue",
  };

  const grouped = ACTION_AREAS.map((area) => ({
    area,
    items: tasks.filter((t) => t.actionArea === area),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Recurring tasks</h2>
        <PrimaryButton testId="button-add-task" onClick={openAdd}><Plus size={16} /> Add task</PrimaryButton>
      </div>

      <AddDialog open={open} title={editing ? "Edit task" : "Add task"} onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Title">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="e.g. Weekly security briefing" className={inputClass} data-testid="input-task-title" />
          </FormField>
          <FormField label="Description">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What must be delivered, and to whom" className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]" data-testid="textarea-task-description" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Action area">
              <select value={form.actionArea} onChange={(e) => setForm((f) => ({ ...f, actionArea: e.target.value }))} required className={selectClass} data-testid="select-task-action-area">
                {ACTION_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </FormField>
            <FormField label="Cadence">
              <select value={form.cadence} onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))} className={selectClass} data-testid="select-task-cadence">
                {TASK_CADENCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </FormField>
            <FormField label="Owner">
              <input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} placeholder="Team member" className={inputClass} data-testid="input-task-owner" />
            </FormField>
            <FormField label="Status">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={selectClass} data-testid="select-task-status">
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormField>
            <FormField label="Next due">
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputClass} data-testid="input-task-due" />
            </FormField>
            <FormField label="Last completed">
              <input type="date" value={form.lastDoneAt} onChange={(e) => setForm((f) => ({ ...f, lastDoneAt: e.target.value }))} className={inputClass} data-testid="input-task-last-done" />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-task">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-task">{createTask.isPending || updateTask.isPending ? "Saving…" : editing ? "Save changes" : "Create task"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>

      {tasksQuery.isLoading ? (
        <LoadingRows count={3} />
      ) : tasksQuery.isError ? (
        <ErrorState onRetry={() => void tasksQuery.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyPlaceholder
          icon={CheckCircle2}
          title="No tasks yet"
          description="Add your first recurring daily or weekly deliverable for this country."
          action={<PrimaryButton testId="button-empty-add-task" onClick={openAdd}><Plus size={15} /> Add task</PrimaryButton>}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ area, items }) => (
            <section key={area} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid={`tasks-section-${area}`}>
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-3">
                <h3 className="text-sm font-bold">{area}</h3>
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{items.length}</span>
              </div>
              <div className="divide-y divide-[hsl(var(--border))]">
                {items.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-4 px-5 py-4" data-testid={`row-task-${task.id}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{task.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                        <span className="rounded-full bg-[hsl(var(--secondary)/.55)] px-2 py-0.5 font-bold">{CADENCE_LABEL[task.cadence]}</span>
                        {task.owner && <span className="flex items-center gap-1"><User size={11} /> {task.owner}</span>}
                        {(task.dueDate || task.lastDoneAt) && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {task.dueDate ? `Due ${shortDate(task.dueDate)}` : ""}
                            {task.dueDate && task.lastDoneAt ? " · " : ""}
                            {task.lastDoneAt ? `Last ${shortDate(task.lastDoneAt)}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={statusTone[task.status] ?? "neutral"}>{STATUS_LABEL[task.status] ?? task.status}</StatusPill>
                      <button onClick={() => openEdit(task)} className="rounded p-1 hover:bg-[hsl(var(--muted))]" aria-label="Edit task" data-testid={`button-task-edit-${task.id}`}><Edit2 size={12} /></button>
                      <button onClick={() => handleDelete(task)} className="rounded p-1 text-red-500 hover:bg-[hsl(var(--destructive)/.15)]" aria-label="Delete task" data-testid={`button-task-delete-${task.id}`}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}