import { createFileRoute } from '@tanstack/react-router';
import { AuditPage } from '@/App';

export const Route = createFileRoute('/audit')({
  component: AuditPage,
});