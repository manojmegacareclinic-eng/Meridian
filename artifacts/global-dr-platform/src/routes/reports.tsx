import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/ReportsPage";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});