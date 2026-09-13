import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { IntelligencePage } from '@/components/IntelligencePage';

const intelligenceSearchSchema = z.object({
  focus: z.number().optional(),
});

export const Route = createFileRoute('/intelligence')({
  validateSearch: intelligenceSearchSchema,
  component: IntelligencePage,
});