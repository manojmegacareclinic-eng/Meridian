import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center py-10">
      <div className="workspace-grid w-full max-w-xl rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.25)] px-8 py-16 text-center">
        <Compass className="mx-auto mb-5 text-[hsl(var(--accent-foreground))]" size={34} />
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Signal not found · 404</p>
        <h1 className="font-serif text-4xl">This room does not exist.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">The address may have changed, or this part of the workspace is outside your current access.</p>
        <Link href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:-translate-y-0.5" data-testid="link-return-overview">
          <ArrowLeft size={15} /> Return to overview
        </Link>
      </div>
    </div>
  );
}
