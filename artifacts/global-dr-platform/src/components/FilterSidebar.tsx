import { useState, useEffect, useRef } from "react";
import { X, MapPin, BarChart2, Landmark, Calendar, Users, Search } from "lucide-react";
import { useListCountries } from "@workspace/api-client-react";
import { PrimaryButton, SecondaryButton, inputClass, selectClass } from "@/App";

type FilterState = {
  regions: string[];
  languages: string[];
  governmentTypes: string[];
  electionYearRange: [number, number];
  teams: string[];
  priorities: string[];
  strategies: string;
  meetingStatuses: string[];
  colorBy: "status" | "riskLevel" | "priority" | "meetingCount";
};

const defaultFilters: FilterState = {
  regions: [],
  languages: [],
  governmentTypes: [],
  electionYearRange: [1900, new Date().getFullYear()],
  teams: [],
  priorities: [],
  strategies: "",
  meetingStatuses: [],
  colorBy: "status",
};

export function FilterSidebar({
  filters,
  onFilterChange,
  onClose,
  isOpen,
}: {
  filters: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onClose: () => void;
  isOpen: boolean;
}) {
  const countriesQuery = useListCountries({});
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Derive filter options from country data
  const regions = [...new Set(countriesQuery.data?.map((c) => c.region).filter(Boolean))].sort() as string[];
  const languages = [...new Set(countriesQuery.data?.map((c) => c.language).filter(Boolean))].sort() as string[];
  const governmentTypes = [...new Set(countriesQuery.data?.map((c) => c.governmentType).filter(Boolean))].sort() as string[];
  const teams = [...new Set(countriesQuery.data?.map((c) => c.team).filter(Boolean))].sort() as string[];
  const priorities = [...new Set(countriesQuery.data?.map((c) => c.priority).filter(Boolean))].sort() as string[];
  const electionYears = countriesQuery.data?.map((c) => c.electionYear).filter((y): y is number => typeof y === "number") ?? [];
  const minYear = electionYears.length > 0 ? Math.min(...electionYears) : 1900;
  const maxYear = electionYears.length > 0 ? Math.max(...electionYears) : new Date().getFullYear();

  const meetingStatuses = ["scheduled", "completed", "follow_up"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleMultiSelect = (key: keyof FilterState, value: string) => {
    const current = filters[key] as string[];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange({ [key]: updated } as Partial<FilterState>);
  };

  const handleRangeChange = (key: keyof FilterState, range: [number, number]) => {
    onFilterChange({ [key]: range } as Partial<FilterState>);
  };

  const handleStrategyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ strategies: e.target.value });
  };

  const handleColorByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ colorBy: e.target.value as FilterState["colorBy"] });
  };

  const handleReset = () => {
    onFilterChange(defaultFilters);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={sidebarRef}
        className="fixed top-0 left-0 h-full w-96 bg-[hsl(var(--card))] border-r border-[hsl(var(--border))] z-50 flex flex-col shadow-xl transform transition-transform duration-300 lg:relative lg:transform-none lg:z-auto lg:shadow-none lg:border-r"
        role="dialog"
        aria-label="Map filters"
      >
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))] lg:hidden">
          <h3 className="font-bold">Filters</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[hsl(var(--muted))]" aria-label="Close filters">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm">Filters</h4>
            <SecondaryButton testId="button-reset-filters" size="sm" variant="outline" onClick={handleReset}>
              Reset all
            </SecondaryButton>
          </div>

          <div className="space-y-4">
            <FilterSection title="Region" icon={MapPin}>
              <MultiSelect
                options={regions}
                selected={filters.regions}
                onChange={(v) => handleMultiSelect("regions", v)}
              />
            </FilterSection>

            <FilterSection title="Language" icon={MapPin}>
              <MultiSelect
                options={languages}
                selected={filters.languages}
                onChange={(v) => handleMultiSelect("languages", v)}
              />
            </FilterSection>

            <FilterSection title="Government Type" icon={Landmark}>
              <MultiSelect
                options={governmentTypes}
                selected={filters.governmentTypes}
                onChange={(v) => handleMultiSelect("governmentTypes", v)}
              />
            </FilterSection>

            <FilterSection title="Election Year" icon={Calendar}>
              <RangeSlider
                min={minYear}
                max={maxYear}
                value={filters.electionYearRange}
                onChange={(v) => handleRangeChange("electionYearRange", v)}
              />
            </FilterSection>

            <FilterSection title="Team" icon={Users}>
              <MultiSelect
                options={teams}
                selected={filters.teams}
                onChange={(v) => handleMultiSelect("teams", v)}
              />
            </FilterSection>

            <FilterSection title="Priority" icon={BarChart2}>
              <MultiSelect
                options={priorities}
                selected={filters.priorities}
                onChange={(v) => handleMultiSelect("priorities", v)}
              />
            </FilterSection>

            <FilterSection title="Strategy Keyword" icon={Search}>
              <input
                type="text"
                value={filters.strategies}
                onChange={handleStrategyChange}
                placeholder="Search strategy..."
                className={inputClass}
              />
            </FilterSection>

            <FilterSection title="Meeting Status" icon={Calendar}>
              <MultiSelect
                options={meetingStatuses}
                selected={filters.meetingStatuses}
                onChange={(v) => handleMultiSelect("meetingStatuses", v)}
              />
            </FilterSection>

            <FilterSection title="Color By" icon={BarChart2}>
              <select
                value={filters.colorBy}
                onChange={(e) => handleColorByChange(e)}
                className={selectClass}
              >
                <option value="status">Status</option>
                <option value="riskLevel">Risk Level</option>
                <option value="priority">Priority</option>
                <option value="meetingCount">Meeting Count</option>
              </select>
            </FilterSection>
          </div>
        </div>

        <div className="p-4 border-t border-[hsl(var(--border))] lg:hidden">
          <PrimaryButton testId="button-done-filters" onClick={onClose}>
            Done
          </PrimaryButton>
        </div>
      </aside>
    </>
  );
}

function FilterSection({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
        <Icon size={14} />
        {title}
      </div>
      {children}
    </div>
  );
}

function MultiSelect({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            selected.includes(opt)
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-[hsl(var(--primary))]"
              : "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function RangeSlider({ min, max, value, onChange }: { min: number; max: number; value: [number, number]; onChange: (v: [number, number]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
        <span>{value[0]}</span>
        <span>{value[1]}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="flex-1"
        />
        <span className="text-xs text-[hsl(var(--muted-foreground))] w-10 text-center">–</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="flex-1"
        />
      </div>
    </div>
  );
}