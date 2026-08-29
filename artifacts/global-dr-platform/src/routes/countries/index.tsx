import { createFileRoute } from '@tanstack/react-router';
import { CountryPage } from '@/App';

export const Route = createFileRoute('/countries/')({
  component: CountryPage,
});