import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { CountryDetailPage } from '@/App';

const countrySearchSchema = z.object({
  tab: z.string().optional(),
});

export const Route = createFileRoute('/country/$countryId')({
  validateSearch: countrySearchSchema,
  component: CountryDetailPage,
});