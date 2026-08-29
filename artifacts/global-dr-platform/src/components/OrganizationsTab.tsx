import { useState } from "react";
import {
  Plus,
  Building2,
  Mail,
  Globe,
  MapPin,
  Users,
  GraduationCap,
  Heart,
  Landmark,
  PartyPopper,
  Church,
  Edit2,
  Trash2,
  Search,
  Filter,
  X,
} from "lucide-react";
import {
  useListOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import type { Organization, OrganizationInput, OrganizationType } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query";
import { PrimaryButton, SecondaryButton, AddDialog, FormField, Select, Textarea, inputClass, selectClass } from "@/App";

const ORG_TYPES: { value: OrganizationType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: "ministry", label: "Ministry", icon: Landmark },
  { value: "embassy", label: "Embassy", icon: Building2 },
  { value: "city", label: "City", icon: MapPin },
  { value: "university", label: "University", icon: GraduationCap },
  { value: "ngo", label: "NGO", icon: Heart },
  { value: "party", label: "Political Party", icon: PartyPopper },
  { value: "religious", label: "Religious Institution", icon: Church },
];

const typeIcons: Record<OrganizationType, React.ComponentType<{ size?: number }>> = {
  ministry: Landmark,
  embassy: Building2,
  city: MapPin,
  university: GraduationCap,
  ngo: Heart,
  party: PartyPopper,
  religious: Church,
};

function TypeIcon({ type }: { type: OrganizationType }) {
  const Icon = typeIcons[type];
  return <Icon size={18} />;
}

const typeMetadataFields: Record<OrganizationType, { label: string; key: string; placeholder: string; type?: "text" | "number" | "email" | "url" }[]> = {
  ministry: [
    { label: "Portfolio", key: "portfolio", placeholder: "e.g. Foreign Affairs" },
    { label: "Minister Position ID", key: "ministerPositionId", placeholder: "Link to position ID", type: "number" },
  ],
  embassy: [
    { label: "Diplomatic Rank", key: "diplomaticRank", placeholder: "e.g. Ambassador" },
    { label: "Sending Country", key: "sendingCountry", placeholder: "e.g. United States" },
  ],
  city: [
    { label: "Population", key: "population", placeholder: "e.g. 500000", type: "number" },
    { label: "Is Capital?", key: "isCapital", placeholder: "true/false", type: "text" },
  ],
  university: [
    { label: "Accreditation", key: "accreditation", placeholder: "e.g. Regional" },
    { label: "Student Count", key: "studentCount", placeholder: "e.g. 25000", type: "number" },
  ],
  ngo: [
    { label: "Focus Areas (comma-separated)", key: "focusAreas", placeholder: "humanitarian, health, education" },
    { label: "Registration Number", key: "registrationNumber", placeholder: "NGO-12345" },
  ],
  party: [
    { label: "Ideology", key: "ideology", placeholder: "e.g. Center-right" },
    { label: "Seats in Parliament", key: "seatsInParliament", placeholder: "e.g. 45", type: "number" },
  ],
  religious: [
    { label: "Denomination", key: "denomination", placeholder: "e.g. Catholic" },
    { label: "Adherents Estimate", key: "adherentsEstimate", placeholder: "e.g. 1200000", type: "number" },
  ],
};

export function OrganizationsTab({ countryId }: { countryId: number }) {
  const [selectedType, setSelectedType] = useState<OrganizationType | "all">("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "ministry" as OrganizationType,
    address: "",
    website: "",
    notes: "",
    metadata: {} as Record<string, unknown>,
  });

  const organizationsQuery = useListOrganizations({ countryId, type: selectedType === "all" ? undefined : selectedType });
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();

  const handleOpenCreate = (type?: OrganizationType) => {
    setForm({ name: "", type: type || "ministry", address: "", website: "", notes: "", metadata: {} });
    setEditingOrg(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (org: Organization) => {
    setForm({
      name: org.name,
      type: org.type,
      address: org.address ?? "",
      website: org.website ?? "",
      notes: org.notes ?? "",
      metadata: (org.metadata as Record<string, unknown>) ?? {},
    });
    setEditingOrg(org);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingOrg(null);
    setForm({ name: "", type: "ministry", address: "", website: "", notes: "", metadata: {} });
  };

  const handleTypeChange = (type: OrganizationType) => {
    setForm((prev) => ({ ...prev, type, metadata: {} }));
  };

  const handleMetadataChange = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, metadata: { ...prev.metadata, [key]: value } }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data: OrganizationInput = {
      countryId,
      name: form.name,
      type: form.type,
      address: form.address || undefined,
      website: form.website || undefined,
      notes: form.notes || undefined,
      metadata: Object.keys(form.metadata).length > 0 ? form.metadata : undefined,
    };

    if (editingOrg) {
      updateOrg.mutate(
        { id: editingOrg.id, data },
        {
          onSuccess: () => {
            handleClose();
            void queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey({ countryId, type: selectedType === "all" ? undefined : selectedType }) });
          },
        }
      );
    } else {
      createOrg.mutate(
        { data },
        {
          onSuccess: () => {
            handleClose();
            void queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey({ countryId, type: selectedType === "all" ? undefined : selectedType }) });
          },
        }
      );
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    deleteOrg.mutate({ id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey({ countryId }) }) });
  };

  const organizations = organizationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">Organizations</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PrimaryButton testId="button-add-org" onClick={() => handleOpenCreate()}>
            <Plus size={16} /> Add Organization
          </PrimaryButton>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={18} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, address, or notes..."
            className={`${inputClass} pl-10`}
            data-testid="input-search-organizations"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-[hsl(var(--muted-foreground))]" size={18} />
          <Select value={selectedType} onChange={(value) => setSelectedType(value as OrganizationType | "all")} className={selectClass}>
            <option value="all">All Types</option>
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {organizationsQuery.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="animate-pulse h-20 rounded-xl bg-[hsl(var(--muted))]" />)}</div>
      ) : organizations.length === 0 ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <Building2 className="mx-auto mb-3 text-4xl" />
          <p className="text-sm">{selectedType === "all" ? "No organizations yet." : `No ${ORG_TYPES.find((t) => t.value === selectedType)?.label.toLowerCase()}s yet.`}</p>
          <PrimaryButton testId="button-empty-add-org" onClick={() => handleOpenCreate(selectedType !== "all" ? selectedType : undefined)}>
            <Plus size={16} /> Add {selectedType === "all" ? "Organization" : ORG_TYPES.find((t) => t.value === selectedType)?.label}
          </PrimaryButton>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_100px_100px] gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-5 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))] md:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Address</span>
            <span>Website</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-[hsl(var(--border))]">
            {organizations.map((org) => (
              <div key={org.id} className="grid gap-3 p-4 last:border-0 hover:bg-[hsl(var(--muted)/.38)] md:grid-cols-[1.2fr_1fr_1fr_1fr_100px_100px] md:items-center md:gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
                    <TypeIcon type={org.type} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{org.name}</p>
                    <p className="truncate text-[11px] text-[hsl(var(--muted-foreground))] capitalize">{org.type}</p>
                  </div>
                </div>
                <div className="hidden text-sm md:block capitalize">{org.type}</div>
                <div className="flex justify-between text-sm md:block">
                  <span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Address</span>
                  <span className="truncate max-w-xs">{org.address ?? "—"}</span>
                </div>
                <div className="flex justify-between text-sm md:block">
                  <span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Website</span>
                  <a href={org.website ?? "#"} target="_blank" rel="noopener noreferrer" className="truncate max-w-xs text-[hsl(var(--primary))] hover:underline">{org.website ?? "—"}</a>
                </div>
                <div className="flex items-center justify-between gap-2 md:block">
                  <SecondaryButton testId={`button-edit-org-${org.id}`} size="sm" onClick={() => handleOpenEdit(org)}><Edit2 size={14} /></SecondaryButton>
                  <SecondaryButton testId={`button-delete-org-${org.id}`} size="sm" variant="destructive" onClick={() => handleDelete(org.id, org.name)}><Trash2 size={14} /></SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddDialog open={dialogOpen} title={editingOrg ? "Edit Organization" : "Add Organization"} onClose={handleClose}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Organization name" className={inputClass} /></FormField>
          <FormField label="Type">
            <Select value={form.type} onChange={(value) => handleTypeChange(value as OrganizationType)} className={selectClass}>
              {ORG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Physical address" className={inputClass} /></FormField>
          <FormField label="Website"><input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.org" className={inputClass} /></FormField>
          <FormField label="Notes">
            <Textarea testId="textarea-org-notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} className="h-24" />
          </FormField>
          <div className="border-t border-[hsl(var(--border))] pt-4">
            <h4 className="font-bold mb-3">Type-specific Fields ({ORG_TYPES.find((t) => t.value === form.type)?.label})</h4>
            <div className="space-y-3">
              {typeMetadataFields[form.type].map((field) => (
                <FormField key={field.key} label={field.label}>
                  <input
                    type={field.type || "text"}
                    value={(form.metadata[field.key] as string) ?? ""}
                    onChange={(e) => handleMetadataChange(field.key, field.type === "number" ? Number(e.target.value) || undefined : e.target.value)}
                    placeholder={field.placeholder}
                    className={inputClass}
                  />
                </FormField>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <SecondaryButton testId="button-cancel-org" type="button" onClick={handleClose}>Cancel</SecondaryButton>
            <PrimaryButton testId={editingOrg ? "button-save-org" : "button-create-org"} type="submit">{editingOrg ? "Save" : "Create"}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
    </div>
  );
}