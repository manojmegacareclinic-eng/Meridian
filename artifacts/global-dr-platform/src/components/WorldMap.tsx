import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CountryLayer } from "./CountryLayer";
import { FilterSidebar } from "./FilterSidebar";
import { useState, useEffect, useRef, useCallback } from "react";
import { useListCountries } from "@workspace/api-client-react";
import type { Country } from "@workspace/api-client-react";
import { Filter, X, MapPin } from "lucide-react";
import { PrimaryButton, SecondaryButton, selectClass } from "@/App";

interface WorldMapProps {
  countries: Country[];
  filters: any;
  onFilterChange: (filters: Partial<any>) => void;
  onColorByChange: (colorBy: string) => void;
  onCountryClick: (countryId: number) => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export function WorldMap({
  countries,
  filters,
  onFilterChange,
  onColorByChange,
  onCountryClick,
  isSidebarOpen,
  setSidebarOpen,
}: WorldMapProps) {
  const mapRef = useRef<any>(null);
  const [geojson, setGeojson] = useState<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Load GeoJSON once
  useEffect(() => {
    fetch("/world-countries.geojson")
      .then((res) => res.json())
      .then((data) => {
        setGeojson(data);
      })
      .catch((err) => console.error("Failed to load GeoJSON:", err));
  }, []);

  // Fit map to bounds when countries load
  const handleMapLoad = useCallback((e: any) => {
    setMapLoaded(true);
    const map = e.target;
    mapRef.current = map;
    // Fit bounds to show all countries
    if (mapRef.current) {
      mapRef.current.fitBounds([
        [-90, -180],
        [90, 180],
      ]);
    }
  }, []);

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 lg:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg text-sm font-medium"
        >
          <Filter className="w-5 h-5" />
          Filters
        </button>
      </div>

      <div className="absolute top-4 left-4 z-20 lg:hidden">
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg"
          aria-label="Close filters"
        >
          <X size={20} />
        </button>
      </div>

      <div className="absolute top-4 left-4 right-4 z-10 lg:top-6 lg:left-6 lg:right-auto lg:w-64">
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold">Map Controls</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))] mb-1">
                Color By
              </label>
              <select
                value={filters.colorBy}
                onChange={(e) => onColorByChange(e.target.value)}
                className={selectClass}
              >
                <option value="status">Status</option>
                <option value="riskLevel">Risk Level</option>
                <option value="priority">Priority</option>
                <option value="meetingCount">Meeting Count</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <span className="text-sm text-[hsl(var(--muted-foreground))]">Click country to view details</span>
            </div>
          </div>
        </div>
      </div>

      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={1.5}
        maxZoom={6}
        className="h-full w-full"
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geojson && (
          <CountryLayer
            geojson={geojson}
            countries={countries}
            colorBy={filters.colorBy}
            onCountryClick={onCountryClick}
          />
        )}
      </MapContainer>

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
        onClose={() => {}}
        isOpen={false}
      />
    </div>
  );
}