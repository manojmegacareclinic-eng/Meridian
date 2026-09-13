import { useState, useCallback } from "react";
import { useListAiWorkflows, useCreateAiWorkflow, useExecuteAiWorkflow, useListAiAgents } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Play, Zap, Sparkles, ChevronRight, X, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

const AGENT_TYPES = [
  { value: "research", label: "Research", description: "Structured research with citations" },
  { value: "contact_discovery", label: "Contact Discovery", description: "Discover diplomatic contacts" },
  { value: "verification", label: "Verification", description: "Verify contacts & affiliations" },
  { value: "meeting_assistant", label: "Meeting Assistant", description: "Briefings, agendas, follow-ups" },
  { value: "report_writer", label: "Report Writer", description: "Structured reports with citations" },
  { value: "news", label: "News Monitor", description: "Monitor & summarize news" },
  { value: "translation", label: "Translation", description: "Diplomatic document translation" },
  { value: "relationship_scoring", label: "Relationship Scoring", description: "Score diplomatic relationships" },
  { value: "document_generation", label: "Document Generation", description: "Generate docs from templates" },
] as const;

type AgentType = (typeof AGENT_TYPES)[number]["value"];

export function AiWorkflowsPage() {
  const [activeTab, setActiveTab] = useState<"browse" | "execute" | "history">("browse");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
  const [inputData, setInputData] = useState("");

  const { data: workflowsData, isLoading, refetch } = useListAiWorkflows({ limit: 50 });
  const createWorkflow = useCreateAiWorkflow();
  const executeWorkflow = useExecuteAiWorkflow();
  const { data: agentsData } = useListAiAgents();

  const workflows = workflowsData?.workflows ?? [];
  const agents = agentsData?.agents ?? [];

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await createWorkflow.mutateAsync({
      data: {
        name: form.get("name") as string,
        description: form.get("description") as string,
        agentType: form.get("agentType") as "research" | "contact_discovery" | "verification" | "meeting_assistant" | "report_writer" | "news" | "translation" | "relationship_scoring" | "document_generation",
        promptTemplate: form.get("promptTemplate") as string,
      },
    });
    setShowCreate(false);
    refetch();
  };

  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight flex items-center gap-2">
            <Brain className="h-8 w-8" /> AI Workflows
          </h1>
          <p className="mt-1 text-muted-foreground">Manage AI prompt workflows and execute agents with human review</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus size={16} /> New Workflow
        </Button>
      </div>

      {showCreate && (
        <WorkflowForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} createWorkflow={createWorkflow} />
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "browse" | "execute" | "history")} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="browse">Workflows</TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="browse">
          <WorkflowList workflows={workflows} isLoading={isLoading} refetch={refetch} onCreate={() => setShowCreate(true)} onSelect={setSelectedWorkflow} />
        </TabsContent>

        <TabsContent value="execute">
          <ExecuteWorkflow workflows={workflows} />
        </TabsContent>

        <TabsContent value="history">
          <ExecutionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkflowList({ workflows, isLoading, refetch, onCreate, onSelect }: { workflows: any[]; isLoading: boolean; refetch: () => void; onCreate: () => void; onSelect: (w: any) => void }) {
  if (isLoading) return <LoadingGrid />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workflows.length === 0 ? (
        <div className="col-span-full rounded-2xl border border-border bg-card p-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground" />
          <h3 className="mt-4 font-semibold">No workflows yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create your first AI workflow to get started</p>
          <Button className="mt-4" onClick={onCreate}><Plus size={16} /> Create Workflow</Button>
        </div>
      ) : (
        workflows.map((w) => (
          <WorkflowCard key={w.id} workflow={w} onClick={() => onSelect(w)} />
        ))
      )}
    </div>
  );
}

function WorkflowCard({ workflow, onClick }: { workflow: any; onClick: () => void }) {
  const onExecute = () => onClick();
  return (
    <Card className="group hover:border-primary/50 hover:shadow-lg transition-all">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{workflow.name}</CardTitle>
            <CardDescription>{workflow.description ?? "No description"}</CardDescription>
          </div>
          <Badge variant="outline" className={cn("text-[10px]", agentColor(workflow.agentType))}>
            {workflow.agentType.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          <strong>Prompt:</strong> {workflow.promptTemplate.slice(0, 120)}...
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="gap-1">
            <Zap size={10} /> {workflow.isActive ? "Active" : "Inactive"}
          </Badge>
          <span>Updated {new Date(workflow.updatedAt).toLocaleDateString()}</span>
        </div>
        <Button variant="outline" className="w-full justify-between" onClick={onExecute}>
          <Play size={14} /> Execute
          <ChevronRight size={14} />
        </Button>
      </CardContent>
    </Card>
  );
}

function ExecuteWorkflow({ workflows }: { workflows: any[] }) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
  const [inputData, setInputData] = useState("");
  const executeWorkflow = useExecuteAiWorkflow();

  if (!selectedWorkflow) {
    return (
      <div className="space-y-4">
        <h3 className="font-medium">Select a workflow to execute</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w) => (
            <Card key={w.id} className="cursor-pointer hover:border-primary/50" onClick={() => setSelectedWorkflow(w)}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={agentColor(w.agentType)}>
                    {w.agentType.replace("_", " ")}
                  </Badge>
                </div>
                <h4 className="font-medium">{w.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">{w.description ?? "No description"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{selectedWorkflow.name}</h3>
          <p className="text-sm text-muted-foreground">{selectedWorkflow.description}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSelectedWorkflow(null)}>
          <ChevronRight size={14} /> Change
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Input Data (JSON)</CardTitle>
          <CardDescription>Provide the input parameters for this workflow</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={inputData}
            onChange={(e) => setInputData(e.target.value)}
            placeholder='{"key": "value"}'
            className="min-h-[200px] font-mono text-sm"
            rows={10}
          />
        </CardContent>
      </Card>

      <Button
        onClick={async () => {
          try {
            const data = JSON.parse(inputData);
            await executeWorkflow.mutateAsync({ data: { workflowId: selectedWorkflow.id, inputData: data } });
            alert("Execution started! Check History tab for results.");
            setSelectedWorkflow(null);
            setInputData("");
          } catch {
            alert("Invalid JSON");
          }
        }}
        disabled={executeWorkflow.isPending}
        className="w-full"
      >
        {executeWorkflow.isPending ? "Executing..." : "Execute Workflow"}
      </Button>

      <Button variant="ghost" onClick={() => setSelectedWorkflow(null)}>Cancel</Button>
    </div>
  );
}

function ExecutionHistory() {
  return (
    <div className="rounded-2xl border border-border bg-card p-12 text-center">
      <Loader2 className="h-12 w-12 mx-auto text-muted-foreground animate-spin" />
      <h3 className="mt-4 font-semibold">Execution History</h3>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon - view past executions, review outputs, and manage approvals</p>
    </div>
  );
}

function WorkflowForm({ onSubmit, onCancel, createWorkflow }: { onSubmit: (e: React.FormEvent) => void; onCancel: () => void; createWorkflow: ReturnType<typeof useCreateAiWorkflow> }) {
  return (
    <Card className="animate-rise-in">
      <CardHeader>
        <CardTitle>Create New Workflow</CardTitle>
        <CardDescription>Define a reusable AI prompt workflow</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input name="name" required placeholder="e.g. Country Research Brief" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Agent Type</label>
              <Select name="agentType" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent type" />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Textarea name="description" placeholder="What does this workflow do?" rows={2} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Prompt Template</label>
            <Textarea
              name="promptTemplate"
              required
              placeholder="Enter the prompt template with {{variables}} for dynamic input"
              rows={6}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={createWorkflow.isPending}>
              {createWorkflow.isPending ? "Creating..." : "Create Workflow"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i} className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-1/4 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="h-4 bg-muted rounded mb-2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function agentColor(type: string) {
  switch (type) {
    case "research":
    case "contact_discovery":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "verification":
    case "meeting_assistant":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "report_writer":
    case "news":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "translation":
    case "relationship_scoring":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "document_generation":
      return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
}