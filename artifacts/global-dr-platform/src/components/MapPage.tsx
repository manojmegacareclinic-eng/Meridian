import { useState, useEffect } from "react";
import { useListCountries } from "@workspace/api-client-react";
import type { Country } from "@workspace/api-client-react";
import { WorldMap } from "./WorldMap";
import { FilterSidebar } from "./FilterSidebar";
import { useNavigate } from "@tanstack/react-router";
import { PrimaryButton, SecondaryButton, selectClass } from "@/App";
import { Filter, X } from "lucide-react";

interface MapFilters {
  regions: string[];
  languages: string[];
  governmentTypes: string[];
  electionYearRange: [number, number];
  teams: string[];
  priorities: string[];
  strategies: string;
  meetingStatuses: string[];
  colorBy: "status" | "riskLevel" | "priority" | "meetingCount";
}

export function MapPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<MapFilters>({
    regions: [],
    languages: [],
    governmentTypes: [],
    electionYearRange: [1900, new Date().getFullYear()],
    teams: [],
    priorities: [],
    strategies: "",
    meetingStatuses: [],
    colorBy: "status",
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);

  const countriesQuery = useListCountries({
    search: undefined,
    region: filters.regions.length > 0 ? filters.regions[0] : undefined,
  });

  const handleCountryClick = (countryId: number) => {
    setSelectedCountryId(countryId);
    navigate({ to: `/country/${countryId}` });
  };

  const handleFilterChange = (newFilters: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleColorByChange = (colorBy: "status" | "riskLevel" | "priority" | "meetingCount") => {
    setFilters((prev) => ({ ...prev, colorBy }));
  };

  const applyFilters = () => {
    // For now, just update the query - in a full implementation, this would filter the GeoJSON
    // The actual filtering is done client-side in CountryLayer
  };

  useEffect(() => {
    applyFilters();
  }, [filters]);

  const countries = countriesQuery.data ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
        <h1 className="text-xl font-bold">Global Diplomatic Map</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center gap-2 px-3 py-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg text-sm font-medium"
          >
            Filters
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {countries.length} countries
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative">
        <WorldMap
          countries={countries}
          filters={{}}
          onFilterChange={() => {}}
          onColorByChange={() => {}}
          onCountryClick={(id) => navigate({ to: `/country/${id}` })}
          isSidebarOpen={false}
          setSidebarOpen={() => {}}
        />

        <FilterSidebar
          filters={{
            regions: [],
            languages: [],
            governmentTypes: [],
            electionYearRange: [1900, new Date().getFullYear()],
            teams: [],
            priorities: [],
            strategies: "",
            meetingStatuses: [],
            colorBy: "status",
          }}
          onFilterChange={() => {}}
          onClose={() => setSidebarOpen(false)}
          isOpen={false}
        />
      </div>
    </div>
  );
}