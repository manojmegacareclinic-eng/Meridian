import { createFileRoute } from '@tanstack/react-router';
import { MeetingsPage } from '@/App';

export const Route = createFileRoute('/meetings')({
  component: MeetingsPage,
});