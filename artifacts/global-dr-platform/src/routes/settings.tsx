import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/App';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});