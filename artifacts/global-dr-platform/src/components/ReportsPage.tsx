import { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, ChevronRight } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { downloadReportPDF } from "@/components/ReportPDF";

const REPORT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "funnel", label: "DR Funnel" },
  { value: "meetings", label: "Meetings" },
  { value: "conversion", label: "Lead Conversion" },
  { value: "contacts", label: "Contact Coverage" },
  { value: "positions", label: "Position Changes" },
  { value: "health", label: "Engagement Health" },
  { value: "heatmap", label: "Heat Maps" },
] as const;

type ReportTabValue = (typeof REPORT_TABS)[number]["value"];

interface CountryPerformanceData {
  countries: Array<{
    id: number;
    name: string;
    code: string;
    region: string;
    status: string;
    riskLevel: string;
    contactsCount: number;
    meetingsCount: number;
    agreementsCount: number;
  }>;
  meetings: Array<{
    countryId: number;
    status: string;
    actionArea: string;
  }>;
  tasks: Array<{
    countryId: number;
    status: string;
    actionArea: string;
    cadence: string | null;
  }>;
  actionItems: Array<{
    countryId: number;
    status: string;
  }>;
}

interface DrFunnelData {
  pipeline: Array<{ status: string; count: number }>;
  meetingsByArea: Array<{ actionArea: string; status: string; count: number }>;
  agreements: Array<{ lifecycleState: string; count: number }>;
  tasksByCadence: Array<{ cadence: string | null; status: string; count: number }>;
}

interface MeetingsAnalyticsData {
  meetings: Array<{
    id: number;
    title: string;
    date: string;
    status: string;
    actionArea: string;
    countryId: number;
    countryName: string;
    countryCode: string;
  }>;
  monthly: Array<{ month: string; count: number }>;
  byActionArea: Array<{ actionArea: string; count: number }>;
}

interface LeadConversionData {
  statusTransitions: Array<{ fromStatus: string; count: number }>;
  meetingToAgreement: Array<{
    meetingId: number;
    meetingTitle: string;
    meetingDate: string;
    agreementCount: number;
  }>;
  tasksCreated: Array<{ month: string; count: number }>;
  tasksCompleted: Array<{ month: string; count: number }>;
}

interface ContactCoverageData {
  contacts: Array<{
    id: number;
    name: string;
    title: string;
    institution: string;
    email: string;
    phone: string | null;
    verificationStatus: string;
    relationship: string;
    countryId: number;
    countryName: string;
    countryCode: string;
    lastVerified: string;
  }>;
  byCountry: Array<{ countryId: number; countryName: string; countryCode: string; count: number }>;
  byVerification: Array<{ verificationStatus: string; count: number }>;
  byRelationship: Array<{ relationship: string; count: number }>;
  withPhone: number;
  withEmail: number;
}

interface PositionChangesData {
  positions: Array<{
    id: number;
    title: string;
    type: string;
    countryId: number;
    countryName: string;
    countryCode: string;
  }>;
  terms: Array<{
    id: number;
    personName: string;
    startDate: string;
    endDate: string | null;
    isCurrent: number;
    positionId: number;
    positionTitle: string;
    countryId: number;
    countryName: string;
  }>;
  byType: Array<{ type: string; count: number }>;
  currentHolders: number;
}

interface EngagementHealthData {
  health: Array<{
    countryId: number;
    countryName: string;
    countryCode: string;
    score: number | null;
    completionPct: number | null;
    slaRate: number | null;
    failureRate: number | null;
    riskLevel: string;
    status: string;
    poolCount: number;
    completedCount: number;
  }>;
}

interface HeatMapData {
  activity: Array<{ region: string; actionArea: string; count: number }>;
  agreements: Array<{ region: string; lifecycleState: string; count: number }>;
  contacts: Array<{ region: string; count: number }>;
}

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function LoadingCard() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="h-6 bg-muted rounded w-1/4" />
      </CardHeader>
      <CardContent>
        <div className="h-64 bg-muted rounded" />
      </CardContent>
    </Card>
  );
}

function CountryPerformanceTab({ data, isLoading }: { data: CountryPerformanceData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  const countries = data?.countries ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Countries" value={countries.length} />
        <StatCard
          title="Total Contacts"
          value={countries.reduce((sum, c) => sum + c.contactsCount, 0)}
        />
        <StatCard
          title="Total Meetings"
          value={countries.reduce((sum, c) => sum + c.meetingsCount, 0)}
        />
        <StatCard
          title="Total Agreements"
          value={countries.reduce((sum, c) => sum + c.agreementsCount, 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Country Performance Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium">Country</th>
                  <th className="text-left p-3 font-medium">Region</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Risk</th>
                  <th className="text-right p-3 font-medium">Contacts</th>
                  <th className="text-right p-3 font-medium">Meetings</th>
                  <th className="text-right p-3 font-medium">Agreements</th>
                </tr>
              </thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="p-3 font-medium">{c.name} <span className="text-muted-foreground ml-2 text-xs">({c.code})</span></td>
                    <td className="p-3 text-muted-foreground">{c.region}</td>
                    <td className="p-3"><Badge variant={statusVariant(c.status)}>{c.status}</Badge></td>
                    <td className="p-3"><Badge variant={riskVariant(c.riskLevel)}>{c.riskLevel}</Badge></td>
                    <td className="p-3 text-right font-mono">{c.contactsCount}</td>
                    <td className="p-3 text-right font-mono">{c.meetingsCount}</td>
                    <td className="p-3 text-right font-mono">{c.agreementsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DRFunnelTab({ data, isLoading }: { data: DrFunnelData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  const pipeline = data?.pipeline ?? [];
  const meetingsByArea = data?.meetingsByArea ?? [];
  const agreements = data?.agreements ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Pipeline Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pipeline.map((p, i) => (
                <div key={p.status} className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {((p.count / (pipeline.reduce((s, x) => s + x.count, 0) || 1)) * 100).toFixed(0)}%
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{p.status}</span>
                      <span className="text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full" style={{ width: `${((p.count / (pipeline.reduce((s, x) => s + x.count, 0) || 1)) * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Agreements by Lifecycle</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agreements.map((a, i) => (
                <div key={a.lifecycleState} className="flex items-center justify-between">
                  <span className="font-medium">{a.lifecycleState}</span>
                  <Badge variant="outline">{a.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Meetings by Action Area & Status</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={meetingsByArea} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis type="number" />
              <YAxis dataKey="actionArea" type="category" width={120} />
              <Tooltip />
              <Legend />
              {meetingsByArea.map((_, i) => (
                <Bar key={i} dataKey="count" stackId="a" fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function MeetingsTab({ data, isLoading }: { data: MeetingsAnalyticsData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  const monthly = data?.monthly ?? [];
  const byActionArea = data?.byActionArea ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Meetings Over Time</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Meetings by Action Area</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byActionArea}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="count"
                  nameKey="actionArea"
                  label={({ actionArea, count }) => `${actionArea}: ${count}`}
                >
                  {byActionArea.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadConversionTab({ data, isLoading }: { data: LeadConversionData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  const tasksCreated = data?.tasksCreated ?? [];
  const tasksCompleted = data?.tasksCompleted ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Tasks Created vs Completed</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={tasksCreated.map((c, i) => ({
              month: c.month,
              created: c.count,
              completed: tasksCompleted[i]?.count ?? 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#0ea5e9" strokeWidth={2} name="Created" dot={false} />
              <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} name="Completed" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status Transitions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.statusTransitions?.map((s) => (
                <div key={s.fromStatus} className="flex justify-between">
                  <span>{s.fromStatus}</span>
                  <Badge>{s.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Meetings → Agreements</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data?.meetingToAgreement?.slice(0, 10).map((m) => (
                <div key={m.meetingId} className="flex justify-between text-sm">
                  <span className="truncate max-w-[200px]">{m.meetingTitle}</span>
                  <Badge>{m.agreementCount} agreement{m.agreementCount !== 1 ? "s" : ""}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ContactCoverageTab({ data, isLoading }: { data: ContactCoverageData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard title="Total Contacts" value={data?.contacts?.length ?? 0} />
        <StatCard title="With Phone" value={data?.withPhone ?? 0} />
        <StatCard title="With Email" value={data?.withEmail ?? 0} />
        <StatCard title="Countries Covered" value={data?.byCountry?.length ?? 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By Verification Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.byVerification?.map((v, i) => (
                <div key={v.verificationStatus} className="flex items-center justify-between">
                  <span className="capitalize">{v.verificationStatus}</span>
                  <Badge variant="outline">{v.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>By Relationship</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.byRelationship?.map((r, i) => (
                <div key={r.relationship} className="flex justify-between">
                  <span className="capitalize">{r.relationship}</span>
                  <Badge variant="outline">{r.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Contacts by Country</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium">Country</th>
                  <th className="text-right p-3 font-medium">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {data?.byCountry?.map((c) => (
                  <tr key={c.countryId} className="border-b border-border/50">
                    <td className="p-3 font-medium">{c.countryName} <span className="text-muted-foreground ml-2 text-xs">({c.countryCode})</span></td>
                    <td className="p-3 text-right font-mono">{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PositionChangesTab({ data, isLoading }: { data: PositionChangesData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard title="Total Positions" value={data?.positions?.length ?? 0} />
        <StatCard title="Current Holders" value={data?.currentHolders ?? 0} />
        <StatCard title="Recent Changes" value={data?.terms?.length ?? 0} />
        <StatCard title="Types" value={data?.byType?.length ?? 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Position Types</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data?.byType ?? []}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="count"
                  nameKey="type"
                  label={({ type, count }) => `${type}: ${count}`}
                >
                  {(data?.byType ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Position Changes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data?.terms?.slice(0, 15).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{t.positionTitle}</p>
                    <p className="text-muted-foreground text-xs">{t.personName} · {t.countryName}</p>
                  </div>
                  <Badge variant={t.isCurrent ? "default" : "outline"}>
                    {t.isCurrent ? "Current" : "Ended"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EngagementHealthTab({ data, isLoading }: { data: EngagementHealthData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  const health = data?.health ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Engagement Health Scores</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium">Country</th>
                  <th className="text-center p-3 font-medium">Score</th>
                  <th className="text-center p-3 font-medium">Completion %</th>
                  <th className="text-center p-3 font-medium">SLA Rate</th>
                  <th className="text-center p-3 font-medium">Failure Rate</th>
                  <th className="text-left p-3 font-medium">Risk</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Pool</th>
                  <th className="text-right p-3 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.countryId} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="p-3 font-medium">{h.countryName} <span className="text-muted-foreground ml-2 text-xs">({h.countryCode})</span></td>
                    <td className="p-3 text-center font-mono font-bold text-lg">{h.score ?? "—"}</td>
                    <td className="p-3 text-center font-mono">{h.completionPct ?? "—"}%</td>
                    <td className="p-3 text-center font-mono">{h.slaRate ?? "—"}%</td>
                    <td className="p-3 text-center font-mono">{h.failureRate ?? "—"}%</td>
                    <td className="p-3"><Badge variant={riskVariant(h.riskLevel)}>{h.riskLevel}</Badge></td>
                    <td className="p-3"><Badge variant={statusVariant(h.status)}>{h.status}</Badge></td>
                    <td className="p-3 text-right font-mono">{h.poolCount}</td>
                    <td className="p-3 text-right font-mono">{h.completedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HeatMapTab({ data, isLoading }: { data: HeatMapData | undefined; isLoading: boolean }) {
  if (isLoading) return <LoadingCard />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Activity by Region</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.activity?.map((a) => (
                <div key={`${a.region}-${a.actionArea}`} className="flex justify-between text-sm">
                  <span>{a.region} / {a.actionArea}</span>
                  <Badge>{a.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Agreements by Region</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.agreements?.map((a) => (
                <div key={`${a.region}-${a.lifecycleState}`} className="flex justify-between text-sm">
                  <span>{a.region} / {a.lifecycleState}</span>
                  <Badge variant="outline">{a.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contacts by Region</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.contacts?.map((c) => (
                <div key={c.region} className="flex justify-between">
                  <span>{c.region}</span>
                  <Badge>{c.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">{title}</p>
        <p className="mt-1 text-3xl font-bold font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["active", "signed", "verified", "completed"].includes(status)) return "default";
  if (["review", "scheduled", "agreement", "follow_up"].includes(status)) return "secondary";
  if (["outdated", "inactive", "archived"].includes(status)) return "destructive";
  return "outline";
}

function riskVariant(risk: string): "default" | "secondary" | "destructive" | "outline" {
  if (risk === "high") return "destructive";
  if (risk === "medium") return "secondary";
  return "default";
}

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTabValue>("overview");
  const [fromDate, setFromDate] = useState(() => format(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Fetch all report data
  const countryPerf = useCountryPerformance({ from: fromDate, to: toDate });
  const drFunnel = useDrFunnel({ from: fromDate, to: toDate });
  const meetings = useMeetingsAnalytics({ from: fromDate, to: toDate });
  const conversion = useLeadConversion({ from: fromDate, to: toDate });
  const contacts = useContactCoverage({});
  const positions = usePositionChanges({ from: fromDate, to: toDate });
  const health = useEngagementHealth({ from: fromDate, to: toDate });
  const heatmap = useHeatMap({});

  const isLoading = countryPerf.isLoading || drFunnel.isLoading || meetings.isLoading ||
    conversion.isLoading || contacts.isLoading || positions.isLoading || health.isLoading || heatmap.isLoading;

  const getReportData = useCallback((tab: ReportTabValue) => {
    switch (tab) {
      case "overview":
        return countryPerf.data;
      case "funnel":
        return drFunnel.data;
      case "meetings":
        return meetings.data;
      case "conversion":
        return conversion.data;
      case "contacts":
        return contacts.data;
      case "positions":
        return positions.data;
      case "health":
        return health.data;
      case "heatmap":
        return heatmap.data;
      default:
        return null;
    }
  }, [countryPerf.data, drFunnel.data, meetings.data, conversion.data, contacts.data, positions.data, health.data, heatmap.data]);

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <CountryPerformanceTab data={countryPerf.data} isLoading={countryPerf.isLoading} />;
      case "funnel":
        return <DRFunnelTab data={drFunnel.data} isLoading={drFunnel.isLoading} />;
      case "meetings":
        return <MeetingsTab data={meetings.data} isLoading={meetings.isLoading} />;
      case "conversion":
        return <LeadConversionTab data={conversion.data} isLoading={conversion.isLoading} />;
      case "contacts":
        return <ContactCoverageTab data={contacts.data} isLoading={contacts.isLoading} />;
      case "positions":
        return <PositionChangesTab data={positions.data} isLoading={positions.isLoading} />;
      case "health":
        return <EngagementHealthTab data={health.data} isLoading={health.isLoading} />;
      case "heatmap":
        return <HeatMapTab data={heatmap.data} isLoading={heatmap.isLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Executive Reports</h1>
          <p className="mt-1 text-muted-foreground">Analytics and insights across the diplomatic portfolio</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-[.08em] text-muted-foreground">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
            />
          </div>
          <button
            onClick={() => downloadReportPDF(activeTab, getReportData(activeTab), { from: fromDate, to: toDate })}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))]"
          >
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTabValue)} className="w-full">
        <TabsList className="grid w-full grid-cols-8">
          {REPORT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <LoadingCard key={i} />)}
          </div>
        ) : (
          renderTab()
        )}
      </Tabs>
    </div>
  );
}

// Hook stubs - will be replaced with actual hooks after codegen
function useCountryPerformance(params: { from: string; to: string }) {
  return { data: undefined as CountryPerformanceData | undefined, isLoading: true, error: null };
}
function useDrFunnel(params: { from: string; to: string }) {
  return { data: undefined as DrFunnelData | undefined, isLoading: true, error: null };
}
function useMeetingsAnalytics(params: { from: string; to: string }) {
  return { data: undefined as MeetingsAnalyticsData | undefined, isLoading: true, error: null };
}
function useLeadConversion(params: { from: string; to: string }) {
  return { data: undefined as LeadConversionData | undefined, isLoading: true, error: null };
}
function useContactCoverage(params: { countryId?: number }) {
  return { data: undefined as ContactCoverageData | undefined, isLoading: true, error: null };
}
function usePositionChanges(params: { from: string; to: string; countryId?: number }) {
  return { data: undefined as PositionChangesData | undefined, isLoading: true, error: null };
}
function useEngagementHealth(params: { from: string; to: string }) {
  return { data: undefined as EngagementHealthData | undefined, isLoading: true, error: null };
}
function useHeatMap(params: {}) {
  return { data: undefined as HeatMapData | undefined, isLoading: true, error: null };
}