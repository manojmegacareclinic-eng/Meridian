import { GeoJSON } from "react-leaflet";
import { useMemo } from "react";
import type { Country } from "@workspace/api-client-react";

interface CountryLayerProps {
  geojson: any;
  countries: Country[];
  colorBy: "status" | "riskLevel" | "priority" | "meetingCount";
  onCountryClick: (countryId: number) => void;
}

export function CountryLayer({ geojson, countries, colorBy, onCountryClick }: CountryLayerProps) {
  const countryMap = useMemo(() => {
    const map = new Map<string, Country>();
    countries.forEach((c) => map.set(c.code.toUpperCase(), c));
    return map;
  }, [countries]);

  const getColor = (country: Country | undefined): string => {
    if (!country) return "#9ca3af"; // gray for no data

    switch (colorBy) {
      case "status": {
        const statusColors: Record<string, string> = {
          leads: "#3b82f6",
          scheduled: "#22c55e",
          active: "#f97316",
          agreement: "#a855f7",
          inactive: "#9ca3af",
        };
        return statusColors[country.status] ?? "#9ca3af";
      }
      case "riskLevel": {
        const riskColors: Record<string, string> = {
          low: "#22c55e",
          medium: "#eab308",
          high: "#ef4444",
        };
        return riskColors[country.riskLevel] ?? "#9ca3af";
      }
      case "priority": {
        const priorityColors: Record<string, string> = {
          low: "#22c55e",
          medium: "#eab308",
          high: "#ef4444",
        };
        return priorityColors[country.priority ?? ""] ?? "#9ca3af";
      }
      case "meetingCount": {
        const count = country.meetingsCount ?? 0;
        if (count === 0) return "#d1d5db";
        if (count <= 2) return "#60a5fa";
        if (count <= 5) return "#3b82f6";
        if (count <= 10) return "#2563eb";
        return "#1d4ed8";
      }
      default:
        return "#9ca3af";
    }
  };

  const style = (feature: any) => {
    const countryCode = feature.properties?.iso_a2 ?? feature.id;
    const country = countryCode ? countryMap.get(countryCode.toUpperCase()) : undefined;
    const color = getColor(country);

    return {
      fillColor: color,
      weight: 1,
      opacity: 1,
      color: "#ffffff",
      fillOpacity: 0.8,
    };
  };

  const highlightStyle = {
    weight: 2,
    color: "#ffffff",
    fillOpacity: 0.9,
  };

  const onEachFeature = (feature: any, layer: any) => {
    const countryCode = feature.properties?.iso_a2 ?? feature.id;
    const country = countryMap.get(countryCode?.toUpperCase());

    const popupContent = country
      ? `
        <div class="p-2 min-w-[200px]">
          <h4 class="font-bold text-lg">${country.name}</h4>
          <p class="text-sm text-gray-600">${country.code} • ${country.region}</p>
          <p class="text-sm text-gray-600 mt-1">Status: <span class="font-bold capitalize">${country.status}</span></p>
          <p class="text-sm text-gray-600">Risk: <span class="font-bold capitalize">${country.riskLevel}</span></p>
          <p class="text-sm text-gray-600">Priority: <span class="font-bold capitalize">${country.priority}</span></p>
          <p class="text-sm text-gray-600">Meetings: <span class="font-bold">${country.meetingsCount}</span> | Contacts: <span class="font-bold">${country.contactsCount}</span></p>
        </div>
      `
      : `
        <div class="p-2 min-w-[200px]">
          <h4 class="font-bold text-lg">${feature.properties?.name ?? countryCode}</h4>
          <p class="text-sm text-gray-600">No data available</p>
        </div>
      `;

    layer.bindPopup(popupContent, { maxWidth: 300 });
    layer.on({
      click: () => {
        if (country) onCountryClick(country.id);
      },
    });
  };

  return (
    <GeoJSON
      data={geojson}
      style={style}
      onEachFeature={onEachFeature}
    />
  );
}