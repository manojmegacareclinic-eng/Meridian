import { createFileRoute } from '@tanstack/react-router';
import { CountryDetailPage } from '@/App';

export const Route = createFileRoute('/country/$countryId')({
  component: CountryDetailPage,
});