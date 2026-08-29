import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Building2, Edit2, Trash2 } from "lucide-react";
import { useListPositions } from "@workspace/api-client-react";
import type { Ministry } from "@workspace/api-client-react";
import { PrimaryButton, SecondaryButton } from "@/App";

interface MinistryItemProps {
  ministry: any;
  onEdit: (ministry: any) => void;
  onDelete: (id: number) => void;
  onAddPosition: (ministryId: number) => void;
}

export function MinistryItem({ ministry, onEdit, onDelete, onAddPosition }: any) {
  const [expanded, setExpanded] = useState(false);
  const positionsQuery = useListPositions(ministry.id);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
      <button onClick={() => setExpanded((prev) => !prev)} className="w-full flex items-center justify-between p-4 hover:bg-[hsl(var(--muted)/.38)]">
        <div className="flex items-center gap-3">
          <div style={{ width: 22, height: 22, background: "hsl(var(--primary))", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>🏛️</div>
          <div>
            <p className="font-bold">{ministry.name}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] capitalize">{ministry.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--muted))]">Edit</button>
          <button className="px-2 py-1 text-xs font-bold rounded hover:bg-[hsl(var(--destructive)/.15)] text-red-500">Delete</button>
          <span>{expanded ? "▼" : "▶"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[hsl(var(--border))] pl-8">
          <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
            <h4 className="font-bold">Positions</h4>
            <button className="px-2 py-1 text-xs font-bold rounded bg-[hsl(var(--primary))] text-white">+ Add Position</button>
          </div>
          <div className="p-4 text-[hsl(var(--muted-foreground))] text-center">Positions loaded separately</div>
        </div>
      )}
    </div>
  );
}

export function MinistryList({ countryId, onEdit, onDelete, onAddPosition }: any) {
  return (
    <div>
      <div className="space-y-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))] text-center py-12">Ministries loaded separately</p>
      </div>
    </div>
  );
}