import { createFileRoute } from '@tanstack/react-router';
import { MeetingDetailPage } from '@/components/MeetingDetail';

export const Route = createFileRoute('/meeting/$meetingId')({
  component: MeetingDetailPage,
});
