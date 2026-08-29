import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Plus, Building2 } from "lucide-react";
import {
  useListMinistries,
  useCreateMinistry,
  useUpdateMinistry,
  useDeleteMinistry,
} from "@workspace/api-client-react";
import type { Ministry, MinistryInput } from "@workspace/api-client-react";
import { queryClient } from "@/lib/query";
import { PrimaryButton, SecondaryButton, AddDialog, FormField, Select, inputClass, selectClass } from "@/App";
import { MinistryList } from "./government/MinistryComponents";

type ExpandedState = {
  ministries: Record<number, boolean>;
  positions: Record<number, boolean>;
};

export function GovernmentTab({ countryId }: { countryId: number }) {
  const ministriesQuery = useListMinistries({ countryId });
  const createMinistry = useCreateMinistry();
  const updateMinistry = useUpdateMinistry();
  const deleteMinistry = useDeleteMinistry();

  const [ministryDialog, setMinistryDialog] = useState<{ open: boolean; editing?: any }>({ open: false });

  const [ministryForm, setMinistryForm] = useState({ name: "", type: "" });

  const ministryTypes = [
    "foreign",
    "finance",
    "defense",
    "interior",
    "health",
    "education",
    "justice",
    "environment",
    "agriculture",
    "transport",
    "energy",
    "trade",
    "labor",
    "culture",
    "other",
  ];

  useEffect(() => {
    if (ministriesQuery.data) {
      // Auto-expand all ministries initially
    }
  }, [ministriesQuery.data]);

  const resetMinistryForm = () => setMinistryForm({ name: "", type: "" });

  const handleCreateMinistry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Implementation
  };

  const handleUpdateMinistry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Implementation
  };

  const handleDeleteMinistry = (id: number) => {
    if (!confirm("Delete this ministry and all its positions/terms?")) return;
    // Implementation
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Government Structure</h2>
        <button className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white hover:opacity-90">
          + Add Ministry
        </button>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-12">Ministries loaded separately</p>
      </div>

      <div className="border border-[hsl(var(--border))] rounded-xl p-4 bg-[hsl(var(--card))]">
        <h3 className="font-bold mb-4">Add Ministry</h3>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ministry Name</label>
            <input required placeholder="e.g. Ministry of Foreign Affairs" className="w-full px-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select className="w-full px-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <option value="">Select type</option>
              {["foreign", "finance", "defense", "interior", "health", "education", "justice", "environment", "agriculture", "transport", "energy", "trade", "labor", "culture", "other"].map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button className="px-4 py-2 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}