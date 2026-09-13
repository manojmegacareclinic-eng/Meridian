import { createFileRoute } from "@tanstack/react-router";
import { AiWorkflowsPage } from "@/components/AiWorkflowsPage";

export const Route = createFileRoute("/ai-workflows")({
  component: AiWorkflowsPage,
});