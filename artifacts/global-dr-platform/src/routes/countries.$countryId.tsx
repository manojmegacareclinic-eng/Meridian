import { createFileRoute } from '@tanstack/react-router';
import { CountryDetailPage } from '@/App';

export const Route = createFileRoute('/countries/$countryId')({
  component: CountryDetailPage,
});