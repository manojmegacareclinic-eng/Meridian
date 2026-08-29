import { createFileRoute } from '@tanstack/react-router';
import { MapPage } from '@/components/MapPage';

export const Route = createFileRoute('/map')({
  component: MapPage,
});