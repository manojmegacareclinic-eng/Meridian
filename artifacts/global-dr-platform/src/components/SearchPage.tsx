import { useState, useMemo, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useSearchAll } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function SearchField({ value, onChange, placeholder, testId, className }: { value: string; onChange: (value: string) => void; placeholder: string; testId: string; className?: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className={cn("h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 text-sm outline-none focus:border-[hsl(var(--accent-foreground))] focus:ring-2 focus:ring-[hsl(var(--accent)/.3)]", className)}
    />
  );
}

const SEARCH_TYPES = [
  { value: "all", label: "All" },
  { value: "countries", label: "Countries" },
  { value: "contacts", label: "Contacts" },
  { value: "organizations", label: "Organizations" },
  { value: "agreements", label: "Agreements" },
  { value: "meetings", label: "Meetings" },
] as const;

type SearchTypeValue = (typeof SEARCH_TYPES)[number]["value"];

function typeColor(type: string) {
  switch (type) {
    case "countries":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "contacts":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "organizations":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "agreements":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "meetings":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeType, setActiveType] = useState<SearchTypeValue>("all");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const { data, isLoading, isError, error } = useSearchAll({
    search: debouncedQuery || undefined,
    type: activeType === "all" ? undefined : activeType,
    limit: 20,
  });

  const results = data?.results ?? [];
  const total = data?.total ?? 0;

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    const timer = setTimeout(() => setDebouncedQuery(value), 250);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading && !debouncedQuery) {
    return <LoadingState />;
  }

  return (
    <div className="animate-rise-in space-y-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Universal Search</h1>
        <p className="mt-1 text-muted-foreground">
          Search across countries, contacts, organizations, agreements, and meetings
        </p>
      </div>

      <div className="space-y-4">
        <SearchField
          value={query}
          onChange={handleSearch}
          placeholder="Search by name, title, institution, region, code…"
          testId="input-search-universal"
          className="max-w-2xl"
        />

        <Tabs value={activeType} onValueChange={(v) => setActiveType(v as SearchTypeValue)} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            {SEARCH_TYPES.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          Search failed: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {debouncedQuery && (
        <div className="text-sm text-muted-foreground">
          {total} result{total === 1 ? "" : "s"}{isLoading ? " (searching…)" : ""}
        </div>
      )}

      {debouncedQuery && !isLoading && results.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No results for "{debouncedQuery}"</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search term or select a different category
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result, index) => (
            <ResultCard key={`${result.type}-${result.id}`} result={result} index={index} />
          ))}
        </div>
      )}

      {debouncedQuery && !isLoading && total > 20 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing 20 of {total} results. Refine your search to see more.
        </p>
      )}
    </div>
  );
}

function ResultCard({ result, index }: { result: { type: string; id: number; title: string; subtitle: string; url: string }; index: number }) {
  return (
    <Link to={result.url} className="group">
      <Card className="animate-rise-in delay-1 hover:border-primary/50 hover:shadow-lg transition-all duration-200">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={cn("text-[10px]", typeColor(result.type))}>
                  {result.type.charAt(0).toUpperCase() + result.type.slice(1).replace(/s$/, "")}
                </Badge>
              </div>
              <h3 className="font-serif text-lg font-medium truncate group-hover:text-primary transition-colors">
                {result.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground truncate">{result.subtitle}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-5">
            <div className="h-4 bg-muted rounded w-3/4 mb-3" />
            <div className="h-3 bg-muted rounded w-1/2" />
            <div className="h-3 bg-muted rounded w-1/4 mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}