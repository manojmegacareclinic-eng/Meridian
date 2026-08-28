import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/App';

export const Route = createFileRoute('/admin')({
  component: AdminPage,
});