import { Calendar, Mail, Phone, Edit2, Trash2 } from "lucide-react";
import { SecondaryButton } from "@/App";
import type { OfficeTerm } from "@workspace/api-client-react";

interface TermItemProps {
  term: OfficeTerm;
  onEdit: (term: OfficeTerm) => void;
  onDelete: (id: number) => void;
}

export function TermItem({ term, onEdit, onDelete }: TermItemProps) {
  return (
    <div key={term.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-[hsl(var(--primary))]" style={{ width: 20, height: 20 }}>👤</div>
          <div>
            <p className="font-bold">{term.personName}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-2">
              📅 {term.startDate}{term.endDate ? ` — ${term.endDate}` : " — Present"}
              {term.personEmail && <span className="flex items-center gap-1">📧 {term.personEmail}</span>}
              {term.personPhone && <span className="flex items-center gap-1">📞 {term.personPhone}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {term.isCurrent && <span className="rounded-full bg-[hsl(157_38%_39%)] text-[hsl(157_50%_30%)] text-[10px] font-bold px-2 py-0.5">Current</span>}
        </div>
      </div>
    </div>
  );
}