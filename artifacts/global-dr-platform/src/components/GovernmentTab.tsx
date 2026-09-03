import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  User,
  Calendar,
  Mail,
  Phone,
  Edit2,
  Trash2,
  Building,
} from "lucide-react";
import {
  useListMinistries,
  useCreateMinistry,
  useUpdateMinistry,
  useDeleteMinistry,
  useListPositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
  useListOfficeTerms,
  useCreateOfficeTerm,
  useUpdateOfficeTerm,
  useDeleteOfficeTerm,
  getListMinistriesQueryKey,
  getListPositionsQueryKey,
  getListOfficeTermsQueryKey,
} from "@workspace/api-client-react";
import type { Ministry, MinistryInput, Position, PositionInput, OfficeTerm, OfficeTermInput } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query";
import { PrimaryButton, SecondaryButton, AddDialog, FormField, Select, inputClass, selectClass } from "@/App";

type ExpandedState = {
  ministries: Record<number, boolean>;
  positions: Record<number, boolean>;
};

function TermItem({ term, onEdit, onDelete }: { term: any; onEdit: (term: any) => void; onDelete: (id: number) => void }) {
  return (
    <div key={term.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="text-[hsl(var(--primary))]" size={20} />
          <div>
            <p className="font-bold">{term.personName}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
              <Calendar size={12} /> {term.startDate}{term.endDate ? ` — ${term.endDate}` : " — Present"}
              {term.personEmail && <span className="flex items-center gap-1"><Mail size={12} /> {term.personEmail}</span>}
              {term.personPhone && <span className="flex items-center gap-1"><Phone size={12} /> {term.personPhone}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {term.isCurrent && <span className="rounded-full bg-[hsl(157_38%_39%)] text-[hsl(157_50%_30%)] text-[10px] font-bold px-2 py-0.5">Current</span>}
          <button onClick={() => onEdit(term)} className="p-1 rounded hover:bg-[hsl(var(--muted))]" aria-label="Edit term"><Edit2 size={12} /></button>
          <button onClick={() => onDelete(term.id)} className="p-1 rounded hover:bg-[hsl(var(--destructive)/.15)] text-red-500" aria-label="Delete term"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function TermList({ positionId, onAdd, onEdit, onDelete }: { positionId: number; onAdd: () => void; onEdit: (term: any) => void; onDelete: (id: number) => void }) {
  const termsQuery = useListOfficeTerms(positionId);

  return (
    <div>
      {termsQuery.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="animate-pulse h-14 rounded-xl bg-[hsl(var(--muted))]" />)}</div>
      ) : termsQuery.data?.length === 0 ? (
        <div className="text-center py-3 text-[hsl(var(--muted-foreground))] text-sm">No terms yet. Add the first office holder.</div>
      ) : (
        <div className="space-y-2">
          {termsQuery.data!.map((term) => (
            <TermItem key={term.id} term={term} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionItem({ position, ministryId, onEdit, onDelete, onAddTerm }: { position: any; ministryId: number; onEdit: (position: any) => void; onDelete: (id: number) => void; onAddTerm: (positionId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const termsQuery = useListOfficeTerms(position.id);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <button onClick={() => setExpanded((prev) => !prev)} className="w-full text-left hover:bg-[hsl(var(--muted)/.38)] rounded-xl p-2">
        <div className="flex items-center gap-3">
          <User className="text-[hsl(var(--muted-foreground))]" size={20} />
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{position.title}</p>
            {position.description && <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{position.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); onAddTerm(position.id); }} className="text-[hsl(var(--primary))] text-sm font-bold">+ Add Term</button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(position); }} className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]">Edit</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(position.id); }} className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--destructive)/.15)] text-red-500">Delete</button>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 ml-8 border-l-2 border-[hsl(var(--border))] pl-4 space-y-3">
          <div className="flex items-center justify-between">
            <h5 className="font-bold text-sm">Office Terms</h5>
            <button onClick={() => onAddTerm(position.id)} className="px-2 py-1 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">+ Add Term</button>
          </div>
          <TermList positionId={position.id} onAdd={() => {}} onEdit={() => {}} onDelete={() => {}} />
        </div>
      )}
    </div>
  );
}

function PositionList({ ministry, onEdit, onDelete, onAddTerm }: { ministry: any; onEdit: (position: any) => void; onDelete: (id: number) => void; onAddTerm: (positionId: number) => void }) {
  const positionsQuery = useListPositions(ministry.id);

  return (
    <div>
      {positionsQuery.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="animate-pulse h-16 rounded-xl bg-[hsl(var(--muted))]" />)}</div>
      ) : positionsQuery.data?.length === 0 ? (
        <div className="p-4 text-center text-[hsl(var(--muted-foreground))] text-sm">No positions yet. Add a position to this ministry.</div>
      ) : (
        <div className="space-y-2 p-4">
          {positionsQuery.data!.map((position) => (
            <PositionItem key={position.id} position={position} ministryId={ministry.id} onEdit={onEdit} onDelete={onDelete} onAddTerm={onAddTerm} />
          ))}
        </div>
      )}
    </div>
  );
}

function MinistryItem({ ministry, onEdit, onDelete, onAddPosition }: { ministry: any; onEdit: (ministry: any) => void; onDelete: (id: number) => void; onAddPosition: (ministryId: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const positionsQuery = useListPositions(ministry.id);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <button onClick={() => setExpanded((prev) => !prev)} className="w-full text-left p-4 hover:bg-[hsl(var(--muted)/.38)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building className="text-[hsl(var(--primary))]" size={22} />
            <div>
              <p className="font-bold">{ministry.name}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] capitalize">{ministry.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); onEdit(ministry); }} className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]">Edit</button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(ministry.id); }} className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--destructive)/.15)] text-red-500">Delete</button>
            <span>{expanded ? "▼" : "▶"}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[hsl(var(--border))] pl-8">
          <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
            <h4 className="font-bold">Positions</h4>
            <button onClick={() => onAddPosition(ministry.id)} className="px-2 py-1 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">+ Add Position</button>
          </div>
          <PositionList ministry={ministry} onEdit={() => {}} onDelete={() => {}} onAddTerm={() => {}} />
        </div>
      )}
    </div>
  );
}

function MinistryList({ countryId, onEdit, onDelete, onAddPosition }: { countryId: number; onEdit: (ministry: any) => void; onDelete: (id: number) => void; onAddPosition: (ministryId: number) => void }) {
  const ministriesQuery = useListMinistries({ countryId });

  return (
    <div>
      {ministriesQuery.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="animate-pulse h-20 rounded-xl bg-[hsl(var(--muted))]" />)}</div>
      ) : ministriesQuery.data?.length === 0 ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <Building className="mx-auto mb-3 text-4xl" />
          <p className="text-sm">No ministries yet. Add the first ministry to start building the government structure.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ministriesQuery.data!.map((ministry) => (
            <MinistryItem key={ministry.id} ministry={ministry} onEdit={onEdit} onDelete={onDelete} onAddPosition={onAddPosition} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GovernmentTab({ countryId }: { countryId: number }) {
  const ministriesQuery = useListMinistries({ countryId });
  const createMinistry = useCreateMinistry();
  const updateMinistry = useUpdateMinistry();
  const deleteMinistry = useDeleteMinistry();

  const [expanded, setExpanded] = useState<ExpandedState>({ ministries: {}, positions: {} });

  const [ministryDialog, setMinistryDialog] = useState<{ open: boolean; editing?: any }>({ open: false });
  const [positionDialog, setPositionDialog] = useState<{ open: boolean; ministryId?: number; editing?: any }>({ open: false });
  const [termDialog, setTermDialog] = useState<{ open: boolean; positionId?: number; editing?: any }>({ open: false });

  const [ministryForm, setMinistryForm] = useState({ name: "", type: "" });
  const [positionForm, setPositionForm] = useState({ title: "", description: "", sortOrder: 0 });
  const [termForm, setTermForm] = useState({
    personName: "",
    personEmail: "",
    personPhone: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  });

  const ministryTypes = [
    "foreign", "finance", "defense", "interior", "health", "education",
    "justice", "environment", "agriculture", "transport", "energy",
    "trade", "labor", "culture", "other",
  ];

  useEffect(() => {
    if (ministriesQuery.data) {
      setExpanded((prev) => ({
        ...prev,
        ministries: ministriesQuery.data!.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}),
      }));
    }
  }, [ministriesQuery.data]);

  const resetMinistryForm = () => setMinistryForm({ name: "", type: "" });
  const resetPositionForm = () => setPositionForm({ title: "", description: "", sortOrder: 0 });
  const resetTermForm = () => setTermForm({ personName: "", personEmail: "", personPhone: "", startDate: new Date().toISOString().slice(0, 10), endDate: "" });

  const handleCreateMinistry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleUpdateMinistry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleDeleteMinistry = (id: number) => {
    if (!confirm("Delete this ministry and all its positions/terms?")) return;
  };

  const openEditMinistry = (m: any) => {
    setMinistryForm({ name: m.name, type: m.type });
    setMinistryDialog({ open: true, editing: m });
  };

  const openAddPosition = (ministryId: number) => {
    resetPositionForm();
    setPositionDialog({ open: true, ministryId });
  };

  const openEditPosition = (p: any) => {
    setPositionForm({ title: p.title, description: p.description ?? "", sortOrder: p.sortOrder });
    setPositionDialog({ open: true, ministryId: p.ministryId, editing: p });
  };

  const handleCreatePosition = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!positionDialog.ministryId) return;
  };

  const handleDeletePosition = (id: number) => {
    if (!confirm("Delete this position and all its terms?")) return;
  };

  const openAddTerm = (positionId: number) => {
    resetTermForm();
    setTermDialog({ open: true, positionId });
  };

  const openEditTerm = (t: any) => {
    setTermForm({
      personName: t.personName,
      personEmail: t.personEmail ?? "",
      personPhone: t.personPhone ?? "",
      startDate: t.startDate,
      endDate: t.endDate ?? "",
    });
    setTermDialog({ open: true, positionId: t.positionId, editing: t });
  };

  const handleCreateTerm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!termDialog.positionId) return;
  };

  const handleDeleteTerm = (id: number) => {
    if (!confirm("Delete this office term?")) return;
  };

  const ministries = ministriesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Government Structure</h2>
        <button className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white hover:opacity-90 flex items-center gap-2" onClick={() => { resetMinistryForm(); setMinistryDialog({ open: true }); }}>
          <Plus size={16} /> Add Ministry
        </button>
      </div>

      <MinistryList
        countryId={countryId}
        onEdit={openEditMinistry}
        onDelete={handleDeleteMinistry}
        onAddPosition={openAddPosition}
      />

      <AddDialog open={ministryDialog.open} title={ministryDialog.editing ? "Edit Ministry" : "Add Ministry"} onClose={() => { setMinistryDialog({ open: false }); resetMinistryForm(); }}>
        <form onSubmit={ministryDialog.editing ? handleUpdateMinistry : handleCreateMinistry} className="space-y-4">
          <FormField label="Ministry Name">
            <input required value={ministryForm.name} onChange={(e) => setMinistryForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ministry of Foreign Affairs" className={inputClass} />
          </FormField>
          <FormField label="Type">
            <select value={ministryForm.type} onChange={(e) => setMinistryForm((f) => ({ ...f, type: e.target.value }))} className={selectClass}>
              <option value="">Select type</option>
              {ministryTypes.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" className="px-4 py-2 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]" onClick={() => { setMinistryDialog({ open: false }); resetMinistryForm(); }}>Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">{ministryDialog.editing ? "Save" : "Create"}</button>
          </div>
        </form>
      </AddDialog>

      <AddDialog open={positionDialog.open} title={positionDialog.editing ? "Edit Position" : "Add Position"} onClose={() => { setPositionDialog({ open: false }); resetPositionForm(); }}>
        <form onSubmit={handleCreatePosition} className="space-y-4">
          <FormField label="Position Title">
            <input required value={positionForm.title} onChange={(e) => setPositionForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Ambassador to the United Nations" className={inputClass} />
          </FormField>
          <FormField label="Description">
            <input value={positionForm.description} onChange={(e) => setPositionForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" className={inputClass} />
          </FormField>
          <FormField label="Sort Order">
            <input type="number" value={positionForm.sortOrder} onChange={(e) => setPositionForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className={inputClass} />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" className="px-4 py-2 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]" onClick={() => { setPositionDialog({ open: false }); resetPositionForm(); }}>Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">{positionDialog.editing ? "Save" : "Create"}</button>
          </div>
        </form>
      </AddDialog>

      <AddDialog open={termDialog.open} title={termDialog.editing ? "Edit Office Term" : "Add Office Term"} onClose={() => { setTermDialog({ open: false }); resetTermForm(); }}>
        <form onSubmit={handleCreateTerm} className="space-y-4">
          <FormField label="Person Name">
            <input required value={termForm.personName} onChange={(e) => setTermForm((f) => ({ ...f, personName: e.target.value }))} placeholder="Full name" className={inputClass} />
          </FormField>
          <FormField label="Email">
            <input type="email" value={termForm.personEmail} onChange={(e) => setTermForm((f) => ({ ...f, personEmail: e.target.value }))} placeholder="email@example.com" className={inputClass} />
          </FormField>
          <FormField label="Phone">
            <input value={termForm.personPhone} onChange={(e) => setTermForm((f) => ({ ...f, personPhone: e.target.value }))} placeholder="+1-555-000-0000" className={inputClass} />
          </FormField>
          <FormField label="Start Date">
            <input type="date" required value={termForm.startDate} onChange={(e) => setTermForm((f) => ({ ...f, startDate: e.target.value }))} className={inputClass} />
          </FormField>
          <FormField label="End Date">
            <input type="date" value={termForm.endDate} onChange={(e) => setTermForm((f) => ({ ...f, endDate: e.target.value }))} className={inputClass} />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" className="px-4 py-2 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]" onClick={() => { setTermDialog({ open: false }); resetTermForm(); }}>Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">{termDialog.editing ? "Save" : "Create"}</button>
          </div>
        </form>
      </AddDialog>
    </div>
  );
}
