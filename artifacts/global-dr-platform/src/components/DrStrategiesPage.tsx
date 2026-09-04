import { useState } from "react";
import { Layers } from "lucide-react";
import { useListCountries } from "@workspace/api-client-react";
import { PageIntro, EmptyState, LoadingRows, ErrorState, selectClass } from "@/App";
import { StrategyPipeline } from "@/components/StrategyPipeline";

export function DrStrategiesPage() {
  const countriesQuery = useListCountries();
  const countries = countriesQuery.data ?? [];
  const [countryId, setCountryId] = useState<number | "">("");

  return (
    <div className="animate-rise-in space-y-5">
      <PageIntro
        eyebrow="Diplomacy / Engagement workflows"
        title="Relationship strategies, marching in step."
        description="Map each country relationship as a pipeline — from first scoping to signing and beyond."
      />
      {countriesQuery.isLoading ? (
        <LoadingRows count={4} />
      ) : countriesQuery.isError ? (
        <ErrorState onRetry={() => void countriesQuery.refetch()} />
      ) : countries.length === 0 ? (
        <EmptyState icon={Layers} title="No country workspaces yet" description="Create a country workspace before defining its DR strategy pipeline." />
      ) : (
        <div className="space-y-5">
          <div className="max-w-sm">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Country workspace</label>
            <select value={countryId} onChange={(e) => setCountryId(e.target.value === "" ? "" : Number(e.target.value))} className={selectClass} data-testid="select-dr-strategy-country">
              <option value="" disabled>
                Select a country
              </option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
          {countryId !== "" ? (
            <StrategyPipeline countryId={countryId as number} />
          ) : (
            <EmptyState icon={Layers} title="Choose a country workspace" description="Pick a country above to view its relationship pipeline and strategies." />
          )}
        </div>
      )}
    </div>
  );
}
