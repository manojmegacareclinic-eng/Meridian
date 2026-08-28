import { createFileRoute } from '@tanstack/react-router';
import { AgreementsPage } from '@/App';

export const Route = createFileRoute('/agreements')({
  component: AgreementsPage,
});