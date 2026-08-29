import { useListOfficeTerms } from "@workspace/api-client-react";
import type { OfficeTerm } from "@workspace/api-client-react";
import { TermItem } from "./TermItem";

interface TermListProps {
  positionId: number;
  onAdd: () => void;
  onEdit: (term: OfficeTerm) => void;
  onDelete: (id: number) => void;
}

export function TermList({ positionId, onAdd, onEdit, onDelete }: TermListProps) {
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