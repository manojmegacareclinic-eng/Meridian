import { createFileRoute } from '@tanstack/react-router';
import { DrStrategiesPage } from '@/components/DrStrategiesPage';

export const Route = createFileRoute('/dr-strategies')({
  component: DrStrategiesPage,
});
