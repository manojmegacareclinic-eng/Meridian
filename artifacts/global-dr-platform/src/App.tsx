import { useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  ArrowLeft,
  BarChart2,
  Building2,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Compass,
  FileCheck2,
  FileText,
  Globe2,
  Landmark,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  MoreHorizontal,
  Newspaper,
  Plus,
  Search,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  getGetCountryQueryKey,
  getGetDashboardSummaryQueryKey,
  getListActivityQueryKey,
  getListAssignableUsersQueryKey,
  getListAdminMembersQueryKey,
  getListAdminUsersQueryKey,
  getListAgreementsQueryKey,
  getListContactsQueryKey,
  getListCountriesQueryKey,
  getListDocumentsQueryKey,
  getListMeetingsQueryKey,
  getListNewsQueryKey,
  getListMinistriesQueryKey,
  getListPositionsQueryKey,
  getListOfficeTermsQueryKey,
  getListOrganizationsQueryKey,
  useCreateAdminInvitation,
  useCreateAdminUser,
  useCreateAgreement,
  useCreateContact,
  useCreateCountry,
  useCreateDocument,
  useCreateMeeting,
  useCreateNews,
  useCreateMinistry,
  useCreatePosition,
  useCreateOfficeTerm,
  useCreateOrganization,
  useDeleteDocument,
  useDeleteNews,
  useDeleteMinistry,
  useDeletePosition,
  useDeleteOfficeTerm,
  useDeleteOrganization,
  useGetCountry,
  useListAdminMembers,
  useListAdminUsers,
  useListAgreements,
  useListAssignableUsers,
  useListAudit,
  useListContacts,
  useListCountries,
  useListDocuments,
  useListMeetings,
  useListMinistries,
  useListNews,
  useListOfficeTerms,
  useListOrganizations,
  useListPositions,
  useListActivity,
  useListActionItems,
  useUpdateAdminUserRole,
  useUpdateAgreement,
  useUpdateAgreementLifecycle,
  useUpdateCountry,
  useUpdateMeeting,
  useUpdateMinistry,
  useUpdatePosition,
  useUpdateOfficeTerm,
  useUpdateOrganization,
  useGetDashboardSummary,
  useHealthCheck,
} from '@workspace/api-client-react';
import type {
  AdminUser,
  AdminUserInput,
  Agreement,
  AgreementInput,
  AgreementLifecycleState,
  AuditEntry,
  Contact,
  ContactInput,
  Country,
  CountryInput,
  CountryUpdate,
  Document,
  DocumentInput,
  Meeting,
  MeetingInput,
  Ministry,
  MinistryInput,
  OfficeTerm,
  OfficeTermInput,
  Organization,
  OrganizationInput,
  OrganizationType,
  Position,
  PositionInput,
  News,
  NewsInput,
} from '@workspace/api-client-react';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { queryClient } from '@/lib/query';
import { authDemoEnabled, roleLabel, useSessionInfo } from '@/lib/auth';
import {
  authClient,
  sendVerificationEmail,
  verifyEmailToken,
} from '@/lib/auth-client';
import { OrganizationsTab } from '@/components/OrganizationsTab';
import { GovernmentTab } from '@/components/GovernmentTab';
import { StrategyPipeline } from '@/components/StrategyPipeline';
import { MeetingDetailPage } from '@/components/MeetingDetail';
import './index.css';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/countries', label: 'Countries', icon: Globe2 },
  { href: '/map', label: 'Global Map', icon: MapPin },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/meetings', label: 'Meetings', icon: CalendarDays },
  { href: '/agreements', label: 'Agreements', icon: FileCheck2 },
  { href: '/dr-strategies', label: 'Strategies', icon: Layers },
  { href: '/audit', label: 'Audit', icon: ScrollText },
];

const adminItem = { href: '/admin', label: 'Administration', icon: SlidersHorizontal };

const formatDate = (value?: string | null, withYear = false) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(date);
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
};

const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

export function StatusPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'gold' | 'green' | 'red' | 'blue' }) {
  const tones = {
    neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    gold: 'bg-[hsl(42_76%_68%/.24)] text-[hsl(28_55%_28%)]',
    green: 'bg-[hsl(157_38%_39%/.14)] text-[hsl(157_38%_30%)]',
    red: 'bg-[hsl(4_64%_48%/.12)] text-[hsl(4_64%_40%)]',
    blue: 'bg-[hsl(190_54%_46%/.13)] text-[hsl(190_54%_31%)]',
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[.04em] uppercase ${tones[tone]}`}>{children}</span>;
}

function toneForStatus(status: string): 'neutral' | 'gold' | 'green' | 'red' | 'blue' {
  if (['active', 'signed', 'verified', 'completed'].includes(status)) return 'green';
  if (['review', 'scheduled', 'agreement', 'follow_up'].includes(status)) return 'gold';
  if (['outdated', 'inactive', 'archived'].includes(status)) return 'red';
  return 'blue';
}

export function LoadingRows({ count = 4 }: { count?: number }) {
  return <div className="space-y-3" data-testid="loading-state">{Array.from({ length: count }).map((_, index) => <div className="h-14 animate-pulse rounded-xl bg-[hsl(var(--muted))]" key={index} />)}</div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center" data-testid="error-state">
    <CircleAlert className="mb-3 text-[hsl(var(--destructive))]" size={28} />
    <h3 className="font-semibold text-[hsl(var(--foreground))]">The brief is temporarily unavailable</h3>
    <p className="mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">We could not retrieve this workspace. Try again, or come back in a moment.</p>
    <button onClick={onRetry} className="mt-5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90" data-testid="button-retry">Retry connection</button>
  </div>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Globe2; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-16 text-center" data-testid="empty-state">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><Icon size={22} /></div>
    <h3 className="font-semibold">{title}</h3>
    <p className="mt-1 max-w-xs text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

function OverviewTab({ country, countryId }: { country: Country; countryId: number }) {
  const contactsQuery = useListContacts({ countryId });
  const meetingsQuery = useListMeetings({ countryId });
  const agreementsQuery = useListAgreements({ countryId });
  const documentsQuery = useListDocuments({ countryId });
  const activityQuery = useListActivity({ countryId });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Contacts" value={contactsQuery.data?.length ?? 0} icon={Users} />
        <KpiCard label="Meetings" value={meetingsQuery.data?.length ?? 0} icon={CalendarDays} />
        <KpiCard label="Agreements" value={agreementsQuery.data?.length ?? 0} icon={FileCheck2} />
        <KpiCard label="Documents" value={documentsQuery.data?.length ?? 0} icon={FileText} />
      </div>
      <AssignmentsBlock country={country} />
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="border-b border-[hsl(var(--border))] px-6 py-5">
          <h3 className="font-serif text-[22px]">Recent activity</h3>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Latest engagements, changes, and updates.</p>
        </div>
        {activityQuery.isLoading ? (
          <LoadingRows count={5} />
        ) : activityQuery.isError ? (
          <ErrorState onRetry={() => void activityQuery.refetch()} />
        ) : (activityQuery.data ?? []).length ? (
          <div className="divide-y divide-[hsl(var(--border))]">
            {(activityQuery.data ?? []).slice(0, 10).map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </div>
        ) : (
          <EmptyPlaceholder icon={ActivityIcon} title="No activity yet" description="Activity will appear here as you work." />
        )}
      </section>
    </>
  );
}

const ASSIGNMENT_ROLES = [
  { key: 'primaryOwner', label: 'Primary owner', testId: 'primary-owner' },
  { key: 'secondaryOwner', label: 'Secondary owner', testId: 'secondary-owner' },
  { key: 'reviewer', label: 'Reviewer', testId: 'reviewer' },
  { key: 'regionalCoordinator', label: 'Regional coordinator', testId: 'regional-coordinator' },
] as const;

function AssignmentsBlock({ country }: { country: Country }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid="assignments-block">
      <div className="border-b border-[hsl(var(--border))] px-6 py-5">
        <h3 className="font-serif text-[22px]">Assignments</h3>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Who owns, reviews, and coordinates this relationship.</p>
      </div>
      <div className="divide-y divide-[hsl(var(--border))]">
        {ASSIGNMENT_ROLES.map(({ key, label, testId }) => {
          const assignee = country[key];
          return (
            <div key={key} className="flex items-center justify-between px-6 py-4" data-testid={`assignment-role-${testId}`}>
              <span className="text-xs font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">{label}</span>
              <span className="text-xs" data-testid={`assignment-assignee-${testId}`}>
                {assignee ? (
                  <StatusPill tone="neutral">{assignee.name}</StatusPill>
                ) : (
                  <span className="text-[hsl(var(--muted-foreground))]">Unassigned</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useLocation().pathname;
  const { user } = useSessionInfo();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'global_admin' && !authDemoEnabled();
  const allNavItems = isAdmin ? [...navItems, adminItem] : navItems;
  const pageName = pathname === '/' ? 'Overview' : allNavItems.find((item) => item.href === pathname)?.label ?? 'Workspace';
  return <div className="min-h-[100dvh] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] shadow-xl transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-10 flex items-center justify-between px-2">
        <Link to="/" className="flex items-center gap-3" data-testid="link-brand">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-[13px] bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]">
            <Landmark size={20} strokeWidth={2.2} /><span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(157_50%_62%)] ring-2 ring-[hsl(var(--sidebar))]" />
          </span>
          <span><span className="block font-serif text-[20px] leading-none text-[hsl(var(--sidebar-foreground))]">Meridian</span><span className="mt-1 block text-[9px] font-bold uppercase tracking-[.23em] text-[hsl(42_35%_69%)]">Diplomatic affairs</span></span>
        </Link>
        <button className="text-[hsl(var(--sidebar-foreground))] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation"><X size={18} /></button>
      </div>
      <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(190_19%_58%)]">Workspace</div>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return <Link key={href} to={href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${active ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))]' : 'text-[hsl(190_19%_72%)] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]'}`} data-testid={`link-nav-${label.toLowerCase()}`}>
            <Icon size={17} strokeWidth={active ? 2.3 : 1.8} /><span>{label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--sidebar-primary))]" />}
          </Link>;
        })}
      </nav>
      <div className="mt-9 mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(190_19%_58%)]">Governance</div>
      {isAdmin && <Link to="/admin" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${pathname === '/admin' ? 'bg-[hsl(var(--sidebar-accent))]' : 'text-[hsl(190_19%_72%)] hover:bg-[hsl(var(--sidebar-accent))]'}`} data-testid="link-nav-admin"><SlidersHorizontal size={17} /><span>Administration</span></Link>}
      <Link to="/settings" className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold ${pathname === '/settings' ? 'bg-[hsl(var(--sidebar-accent))]' : 'text-[hsl(190_19%_72%)] hover:bg-[hsl(var(--sidebar-accent))]'}`} data-testid="link-nav-settings"><Settings size={17} /><span>Settings</span></Link>
      <div className="mt-auto rounded-2xl border border-[hsl(var(--sidebar-border))] bg-[hsl(190_31%_19%)] p-4">
        <div className="mb-3 flex items-center gap-2 text-[hsl(42_30%_88%)]"><ShieldCheck size={15} className="text-[hsl(var(--sidebar-primary))]" /><span className="text-xs font-bold">Workspace secured</span></div>
        <p className="text-[11px] leading-5 text-[hsl(190_19%_66%)]">Data is encrypted at rest and in transit.</p>
        <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.12em] text-[hsl(190_19%_52%)]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(157_50%_62%)]" /> All systems operational</div>
      </div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-[hsl(190_37%_15%/.48)] lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu" data-testid="button-close-menu-overlay" />}
    <main className="lg:pl-[260px]">
      <header className="sticky top-0 z-20 flex h-[74px] items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.9)] px-5 backdrop-blur-md sm:px-8 lg:px-10">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 hover:bg-[hsl(var(--muted))] lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={20} /></button><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Meridian workspace</p><h1 className="mt-0.5 font-serif text-[21px]">{pageName}</h1></div></div>
        <div className="flex items-center gap-2 sm:gap-4"><button className="relative rounded-xl p-2.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]" aria-label="Notifications" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[hsl(4_64%_48%)] ring-2 ring-[hsl(var(--background))]" /></button><div className="hidden h-7 w-px bg-[hsl(var(--border))] sm:block" /><div className="flex items-center gap-2.5">
          {user?.imageUrl ? <img src={user.imageUrl} alt="" className="flex h-9 w-9 items-center justify-center rounded-full object-cover" data-testid="current-user-avatar" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(190_37%_24%)] text-xs font-bold text-[hsl(42_76%_74%)]" data-testid="current-user-avatar">{user?.initials ?? '—'}</span>}
          <div className="hidden sm:block">
            <p className="text-xs font-bold" data-testid="current-user-name">{user?.name ?? '—'}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]" data-testid="current-user-role">{user?.roleLabel ?? ''}</p>
          </div>
        </div></div>
      </header>
      <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">{children}</div>
    </main>
  </div>;
}

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-[hsl(var(--muted-foreground))]"><span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent-foreground))]" />{eyebrow}</div><h2 className="font-serif text-[32px] leading-tight tracking-[-.025em] sm:text-[40px]">{title}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[hsl(var(--muted-foreground))]">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</div>;
}

export function PrimaryButton({ children, onClick, type = 'button', testId }: { children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; testId: string }) {
  return <button type={type} onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow-[0_6px_14px_hsl(190_37%_15%/.12)] hover:-translate-y-0.5 hover:shadow-[0_9px_18px_hsl(190_37%_15%/.18)] disabled:cursor-not-allowed disabled:opacity-50" data-testid={testId}>{children}</button>;
}

export function SecondaryButton({ children, onClick, type = 'button', testId, variant = 'default', size = 'default', className = '' }: { children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'; testId: string; variant?: 'default' | 'destructive' | 'outline'; size?: 'default' | 'sm'; className?: string }) {
  const baseClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variantClass = variant === 'destructive' ? 'bg-[hsl(var(--destructive)/.15)] text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.25)]' : variant === 'outline' ? 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]' : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]';
  const sizeClass = size === 'sm' ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs';
  return <button type={type} onClick={onClick} className={`${baseClass} ${variantClass} ${sizeClass} ${className}`} data-testid={testId}>{children}</button>;
}

export function Select({ value, onChange, children, className = '', testId }: { value: string; onChange: (value: string) => void; children: React.ReactNode; className?: string; testId?: string }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className={`h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 text-sm outline-none focus:border-[hsl(var(--accent-foreground))] appearance-none ${className}`} data-testid={testId}>{children}</select>;
}

export function Textarea({ value, onChange, className = '', testId }: { value: string; onChange: (value: string) => void; className?: string; testId?: string }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`h-24 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))] ${className}`} data-testid={testId} />;
}

export function SearchField({ value, onChange, placeholder, testId }: { value: string; onChange: (value: string) => void; placeholder: string; testId: string }) {
  return <label className="relative block min-w-0 flex-1"><Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" /><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] pl-10 pr-4 text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--accent-foreground))] focus:ring-2 focus:ring-[hsl(var(--accent)/.3)]" data-testid={testId} /></label>;
}

export function Dashboard() {
  const summaryQuery = useGetDashboardSummary();
  const activityQuery = useListActivity();
  const meetingsQuery = useListMeetings({ status: 'scheduled' });
  const countriesQuery = useListCountries();
  const summary = summaryQuery.data;
  const meetings = meetingsQuery.data ?? [];
  const countries = countriesQuery.data ?? [];
  const activities = activityQuery.data ?? [];
  const maxPipeline = Math.max(...(summary?.pipeline ?? []).map((item) => item.count), 1);
  const refresh = () => { void summaryQuery.refetch(); void activityQuery.refetch(); void meetingsQuery.refetch(); void countriesQuery.refetch(); };
  if (summaryQuery.isLoading) return <><PageIntro eyebrow="Executive brief" title="A clear view of the room." description="Your diplomatic portfolio, distilled for the decisions ahead." /><LoadingRows count={5} /></>;
  if (summaryQuery.isError) return <ErrorState onRetry={refresh} />;
  return <div className="animate-rise-in">
    <PageIntro eyebrow="Executive brief · 06 February 2025" title="A clear view of the room." description="Your diplomatic portfolio, distilled for the decisions ahead." action={<PrimaryButton testId="button-log-engagement" onClick={() => window.dispatchEvent(new CustomEvent('open-quick-add'))}><Plus size={16} /> Log an engagement</PrimaryButton>} />
    <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {[
        { label: 'Countries', value: summary?.countries ?? 0, icon: Globe2, note: 'across 6 regions', accent: 'text-[hsl(190_54%_38%)]' },
        { label: 'Key contacts', value: summary?.contacts ?? 0, icon: Users, note: 'relationship owners', accent: 'text-[hsl(157_38%_39%)]' },
        { label: 'Active engagements', value: summary?.activeEngagements ?? 0, icon: ActivityIcon, note: 'in motion now', accent: 'text-[hsl(28_73%_48%)]' },
        { label: 'Meetings this month', value: summary?.meetingsThisMonth ?? 0, icon: CalendarDays, note: 'briefings & dialogues', accent: 'text-[hsl(4_64%_48%)]' },
        { label: 'Agreements', value: summary?.agreements ?? 0, icon: FileCheck2, note: 'under management', accent: 'text-[hsl(190_37%_24%)]' },
      ].map(({ label, value, icon: Icon, note, accent }, index) => <div key={label} className={`animate-rise-in delay-${Math.min(index + 1, 4)} rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-[0_4px_16px_hsl(190_20%_20%/.03)] sm:p-5`} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="mb-4 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-[.09em] text-[hsl(var(--muted-foreground))]">{label}</span><Icon size={16} className={accent} /></div><div className="font-serif text-[29px]">{value}</div><div className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">{note}</div></div>)}
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]">
      <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h3 className="font-serif text-[20px]">Engagement pipeline</h3><p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Where attention is moving this quarter</p></div><button className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" data-testid="button-pipeline-menu"><MoreHorizontal size={18} /></button></div>
        <div className="px-5 pb-6 pt-7">{(summary?.pipeline ?? []).length ? <div className="flex h-[190px] items-end gap-3 sm:gap-6">{summary?.pipeline.map((item, index) => <div className="flex h-full flex-1 flex-col items-center justify-end gap-3" key={item.stage} data-testid={`pipeline-stage-${item.stage}`}><span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{item.count}</span><div className={`w-full max-w-[70px] rounded-t-lg ${index === 1 ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--primary))]'} transition-all duration-500`} style={{ height: `${Math.max(item.count / maxPipeline * 130, 12)}px` }} /><span className="text-center text-[10px] font-bold uppercase tracking-[.04em] text-[hsl(var(--muted-foreground))]">{item.stage}</span></div>)}</div> : <EmptyState icon={ActivityIcon} title="No pipeline yet" description="As engagements are logged, their momentum will appear here." />}</div>
      </section>
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h3 className="font-serif text-[20px]">Next on the brief</h3><p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">Scheduled engagements</p></div><Link to="/meetings" className="text-[11px] font-bold text-[hsl(var(--accent-foreground))] hover:underline" data-testid="link-view-meetings">View all</Link></div>
        <div className="divide-y divide-[hsl(var(--border))]">{meetingsQuery.isLoading ? <div className="p-5"><LoadingRows count={3} /></div> : meetings.length ? meetings.slice(0, 4).map((meeting) => <Link to="/meetings" key={meeting.id} className="flex items-center gap-3 px-5 py-4 hover:bg-[hsl(var(--muted)/.55)]" data-testid={`meeting-preview-${meeting.id}`}><div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]"><span className="text-[9px] font-bold uppercase">{formatDate(meeting.date).split(' ')[1]}</span><span className="font-serif text-lg leading-4">{formatDate(meeting.date).split(' ')[0]}</span></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{meeting.title}</p><p className="mt-1 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{meeting.countryName} · {meeting.actionArea}</p></div><ChevronRight size={15} className="text-[hsl(var(--muted-foreground))]" /></Link>) : <div className="p-5"><EmptyState icon={CalendarDays} title="Room to breathe" description="No upcoming meetings are scheduled." /></div>}</div>
      </section>
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[.9fr_1.35fr]">
      <section className="workspace-grid rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.28)] p-6"><div className="flex items-center gap-2 text-[hsl(var(--accent-foreground))]"><Sparkles size={16} /><span className="text-[10px] font-bold uppercase tracking-[.17em]">Field note</span></div><p className="mt-5 max-w-md font-serif text-[25px] leading-[1.2]">“The quiet work is the work that changes the room.”</p><div className="mt-6 flex items-center gap-3"><div className="h-px w-7 bg-[hsl(var(--accent-foreground))]" /><span className="text-[11px] text-[hsl(var(--muted-foreground))]">Portfolio principle 04</span></div></section>
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4"><div><h3 className="font-serif text-[20px]">Recent activity</h3><p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">A living record of the portfolio</p></div><ActivityIcon size={17} className="text-[hsl(var(--muted-foreground))]" /></div><div className="divide-y divide-[hsl(var(--border))]">{activityQuery.isLoading ? <div className="p-5"><LoadingRows count={3} /></div> : activities.length ? activities.slice(0, 4).map((activity) => <div className="flex gap-3 px-5 py-4" key={activity.id} data-testid={`activity-${activity.id}`}><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--accent-foreground))] ring-4 ring-[hsl(var(--accent)/.25)]" /><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-x-3"><p className="text-xs font-bold">{activity.title}</p><time className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{formatDate(activity.occurredAt)} {formatTime(activity.occurredAt)}</time></div><p className="mt-1 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">{activity.description}{activity.countryName ? ` · ${activity.countryName}` : ''}</p></div></div>) : <div className="p-5"><EmptyState icon={ActivityIcon} title="No recorded movement" description="Recent updates will appear here as the team works." /></div>}</div></section>
    </div>
    <div className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] px-6 py-5 text-[hsl(var(--primary-foreground))] sm:flex sm:items-center sm:justify-between"><div className="flex items-start gap-3"><LockKeyhole size={18} className="mt-0.5 text-[hsl(var(--accent))]" /><div><p className="text-xs font-bold">Confidential workspace</p><p className="mt-1 text-[11px] text-[hsl(42_25%_75%)]">This workspace is restricted to your diplomatic affairs team.</p></div></div><span className="mt-3 block font-mono text-[10px] uppercase tracking-[.12em] text-[hsl(42_25%_65%)] sm:mt-0">Internal · Tier 3</span></div>
  </div>;
}

export function AddDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[hsl(190_37%_15%/.45)] p-0 backdrop-blur-sm sm:items-center sm:p-5"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-2xl sm:rounded-3xl" role="dialog" aria-modal="true" data-testid="dialog-create"><div className="mb-6 flex items-start justify-between"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">New record</p><h3 className="font-serif text-[26px]">{title}</h3></div><button onClick={onClose} className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Close dialog" data-testid="button-close-dialog"><X size={18} /></button></div>{children}</div></div>;
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">{label}</span>{children}</label>;
}

export const inputClass = 'h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3.5 text-sm outline-none focus:border-[hsl(var(--accent-foreground))] focus:ring-2 focus:ring-[hsl(var(--accent)/.3)]';
export const selectClass = `${inputClass} appearance-none`;

export function CountryPage() {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const countriesQuery = useListCountries({ search: search || undefined });
  const createCountry = useCreateCountry();
  const countries = countriesQuery.data ?? [];
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const input: CountryInput = { name: String(form.get('name')), code: String(form.get('code')).toUpperCase(), region: String(form.get('region')), status: String(form.get('status')) as CountryInput['status'] }; createCountry.mutate({ data: input }, { onSuccess: () => { setOpen(false); void queryClient.invalidateQueries({ queryKey: getListCountriesQueryKey() }); } }); };
  return <div className="animate-rise-in"><PageIntro eyebrow="Portfolio / 01" title="Countries in context." description="Each country workspace holds the signal, relationships, and next moves behind the headline." action={<PrimaryButton testId="button-add-country" onClick={() => setOpen(true)}><Plus size={16} /> Add country</PrimaryButton>} /><div className="mb-5 flex flex-col gap-3 sm:flex-row"><SearchField value={search} onChange={setSearch} placeholder="Search countries by name or region" testId="input-search-countries" /><button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-filter-countries"><SlidersHorizontal size={15} /> Filters</button></div>
    {countriesQuery.isLoading ? <LoadingRows count={6} /> : countriesQuery.isError ? <ErrorState onRetry={() => void countriesQuery.refetch()} /> : countries.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{countries.map((country, index) => <CountryCard country={country} key={country.id} index={index} />)}</div> : <EmptyState icon={Globe2} title="No country workspaces yet" description={search ? 'No country matches this search. Try another phrase.' : 'Create the first workspace to give the team a shared view of the relationship.'} action={<PrimaryButton testId="button-empty-add-country" onClick={() => setOpen(true)}><Plus size={15} /> Add country</PrimaryButton>} />}
    <AddDialog open={open} title="Add country workspace" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><FormField label="Country name"><input name="name" required placeholder="e.g. Republic of Korea" className={inputClass} data-testid="input-country-name" /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Code"><input name="code" required minLength={2} maxLength={3} placeholder="KOR" className={`${inputClass} uppercase`} data-testid="input-country-code" /></FormField><FormField label="Region"><select name="region" required className={selectClass} defaultValue="" data-testid="select-country-region"><option value="" disabled>Select region</option><option>East Asia & Pacific</option><option>Europe & Central Asia</option><option>Middle East & North Africa</option><option>Sub-Saharan Africa</option><option>Americas</option><option>South Asia</option></select></FormField></div><FormField label="Engagement status"><select name="status" className={selectClass} defaultValue="leads" data-testid="select-country-status"><option value="leads">Lead</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="agreement">Agreement</option><option value="inactive">Inactive</option></select></FormField><div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-country">Cancel</button><PrimaryButton type="submit" testId="button-submit-country">{createCountry.isPending ? 'Saving…' : 'Create workspace'}</PrimaryButton></div></form></AddDialog>
  </div>;
}

function CountryCard({ country, index }: { country: Country; index: number }) {
  return (
    <Link to="/country/$countryId" params={{ countryId: String(country.id) }}>
      <article className={`animate-rise-in delay-${Math.min(index + 1, 4)} group rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_4px_16px_hsl(190_20%_20%/.03)] hover:-translate-y-1 hover:border-[hsl(var(--accent-foreground)/.45)] hover:shadow-[0_12px_25px_hsl(190_20%_20%/.08)]`} data-testid={`card-country-${country.id}`}>
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[hsl(var(--primary))] font-mono text-[11px] font-bold text-[hsl(var(--accent))]">{country.code}</span>
            <div>
              <h3 className="font-serif text-[21px]">{country.name}</h3>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">{country.region}</p>
            </div>
          </div>
          <StatusPill tone={toneForStatus(country.status)}>{country.status.replace('_', ' ')}</StatusPill>
        </div>
        <div className="mb-5 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
          <span className={`h-2 w-2 rounded-full ${country.riskLevel === 'high' ? 'bg-[hsl(var(--destructive))]' : country.riskLevel === 'medium' ? 'bg-[hsl(var(--accent-foreground))]' : 'bg-[hsl(157_38%_39%)]'}`} /> {country.riskLevel} risk profile
          {country.primaryOwner && (
            <span className="ml-auto rounded-full bg-[hsl(var(--secondary)/.55)] px-2.5 py-1 font-bold" data-testid="country-primary-owner">
              {country.primaryOwner.name.split(' ')[0]}
            </span>
          )}
        </div>
        <div className="fine-rule mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="font-mono text-xl">{country.contactsCount}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Contacts</p>
          </div>
          <div>
            <p className="font-mono text-xl">{country.meetingsCount}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Meetings</p>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const contactsQuery = useListContacts({ search: search || undefined, status: (status || undefined) as 'verified' | 'review' | 'outdated' | undefined });
  const countriesQuery = useListCountries();
  const createContact = useCreateContact();
  const contacts = contactsQuery.data ?? [];
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const input: ContactInput = { name: String(form.get('name')), title: String(form.get('title')), institution: String(form.get('institution')), countryId: Number(form.get('countryId')), email: String(form.get('email')), phone: String(form.get('phone') || ''), relationship: String(form.get('relationship')) }; createContact.mutate({ data: input }, { onSuccess: () => { setOpen(false); void queryClient.invalidateQueries({ queryKey: getListContactsQueryKey() }); } }); };
  return <div className="animate-rise-in"><PageIntro eyebrow="Portfolio / 02" title="People make policy move." description="The directory for trusted counterparts, institutional memory, and the relationships that carry the work." action={<PrimaryButton testId="button-add-contact" onClick={() => setOpen(true)}><Plus size={16} /> Add contact</PrimaryButton>} /><div className="mb-5 flex flex-col gap-3 lg:flex-row"><SearchField value={search} onChange={setSearch} placeholder="Search by name, institution, or country" testId="input-search-contacts" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs font-bold outline-none focus:border-[hsl(var(--accent-foreground))]" data-testid="select-filter-contact-status"><option value="">All verification states</option><option value="verified">Verified</option><option value="review">Needs review</option><option value="outdated">Outdated</option></select></div>
    {contactsQuery.isLoading ? <LoadingRows count={6} /> : contactsQuery.isError ? <ErrorState onRetry={() => void contactsQuery.refetch()} /> : contacts.length ? <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="hidden grid-cols-[1.4fr_1.4fr_1fr_1fr_100px] gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-5 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))] md:grid]"><span>Contact</span><span>Institution</span><span>Country</span><span>Relationship</span><span>State</span></div>{contacts.map((contact) => <ContactRow contact={contact} key={contact.id} />)}</div> : <EmptyState icon={Users} title="No contacts found" description={search ? 'Try a name, institution, or country code.' : 'Build the directory with the first trusted counterpart.'} action={<PrimaryButton testId="button-empty-add-contact" onClick={() => setOpen(true)}><Plus size={15} /> Add contact</PrimaryButton>} />}
    <AddDialog open={open} title="Add diplomatic contact" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><FormField label="Full name"><input name="name" required placeholder="Full name" className={inputClass} data-testid="input-contact-name" /></FormField><div className="grid gap-3 sm:grid-cols-2"><FormField label="Title"><input name="title" required placeholder="Role or honorific" className={inputClass} data-testid="input-contact-title" /></FormField><FormField label="Institution"><input name="institution" required placeholder="Ministry or office" className={inputClass} data-testid="input-contact-institution" /></FormField></div><FormField label="Country"><select name="countryId" required defaultValue="" className={selectClass} data-testid="select-contact-country"><option value="" disabled>Select country workspace</option>{(countriesQuery.data ?? []).map((country) => <option value={country.id} key={country.id}>{country.name}</option>)}</select></FormField><div className="grid gap-3 sm:grid-cols-2"><FormField label="Email"><input name="email" required type="email" placeholder="name@institution.gov" className={inputClass} data-testid="input-contact-email" /></FormField><FormField label="Phone (optional)"><input name="phone" placeholder="+00 000 000 000" className={inputClass} data-testid="input-contact-phone" /></FormField></div><FormField label="Relationship"><select name="relationship" required defaultValue="" className={selectClass} data-testid="select-contact-relationship"><option value="" disabled>Choose relationship</option><option>Strategic</option><option>Established</option><option>Developing</option><option>Introduced</option></select></FormField><div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-contact">Cancel</button><PrimaryButton type="submit" testId="button-submit-contact">{createContact.isPending ? 'Saving…' : 'Add contact'}</PrimaryButton></div></form></AddDialog>
  </div>;
}

function ContactRow({ contact }: { contact: Contact }) {
  return <div className="grid gap-3 border-b border-[hsl(var(--border))] px-5 py-4 last:border-0 hover:bg-[hsl(var(--muted)/.38)] md:grid-cols-[1.4fr_1.4fr_1fr_1fr_100px] md:items-center md:gap-4" data-testid={`row-contact-${contact.id}`}><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[10px] font-bold text-[hsl(var(--primary))]">{initials(contact.name)}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{contact.name}</p><p className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">{contact.title}</p></div></div><div className="hidden min-w-0 md:block"><p className="truncate text-xs">{contact.institution}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]"><Mail size={11} /> {contact.email}</p></div><div className="hidden text-xs md:block">{contact.countryName}</div><div className="flex items-center justify-between md:block"><span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Relationship</span><span className="text-xs">{contact.relationship}</span></div><div className="flex items-center justify-between md:block"><span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Verification</span><StatusPill tone={toneForStatus(contact.verificationStatus)}>{contact.verificationStatus}</StatusPill></div></div>;
}

export function MeetingsPage() {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const meetingsQuery = useListMeetings({ status: (status || undefined) as 'scheduled' | 'completed' | 'follow_up' | undefined });
  const countriesQuery = useListCountries();
  const createMeeting = useCreateMeeting();
  const meetings = meetingsQuery.data ?? [];
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const input: MeetingInput = { title: String(form.get('title')), countryId: Number(form.get('countryId')), date: String(form.get('date')), actionArea: String(form.get('actionArea')), owner: String(form.get('owner') || '') }; createMeeting.mutate({ data: input }, { onSuccess: () => { setOpen(false); void queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }); } }); };
  return <div className="animate-rise-in"><PageIntro eyebrow="Portfolio / 03" title="Make the next room count." description="A measured view of every briefing, dialogue, and follow-up carrying the work forward." action={<PrimaryButton testId="button-add-meeting" onClick={() => setOpen(true)}><Plus size={16} /> Schedule meeting</PrimaryButton>} /><div className="mb-5 flex flex-wrap gap-2">{[['', 'All meetings'], ['scheduled', 'Scheduled'], ['follow_up', 'Follow-up'], ['completed', 'Completed']].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-full border px-4 py-2 text-xs font-bold ${status === value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]'}`} data-testid={`button-filter-meetings-${value || 'all'}`}>{label}</button>)}</div>
    {meetingsQuery.isLoading ? <LoadingRows count={6} /> : meetingsQuery.isError ? <ErrorState onRetry={() => void meetingsQuery.refetch()} /> : meetings.length ? <div className="space-y-3">{meetings.map((meeting) => <MeetingCard meeting={meeting} key={meeting.id} />)}</div> : <EmptyState icon={CalendarDays} title="The calendar is clear" description="Schedule the next diplomatic engagement to keep the relationship moving." action={<PrimaryButton testId="button-empty-add-meeting" onClick={() => setOpen(true)}><Plus size={15} /> Schedule meeting</PrimaryButton>} />}
    <AddDialog open={open} title="Schedule a meeting" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><FormField label="Meeting title"><input name="title" required placeholder="Bilateral coordination briefing" className={inputClass} data-testid="input-meeting-title" /></FormField><div className="grid gap-3 sm:grid-cols-2"><FormField label="Country workspace"><select name="countryId" required defaultValue="" className={selectClass} data-testid="select-meeting-country"><option value="" disabled>Select country</option>{(countriesQuery.data ?? []).map((country) => <option value={country.id} key={country.id}>{country.name}</option>)}</select></FormField><FormField label="Date & time"><input name="date" required type="datetime-local" className={inputClass} data-testid="input-meeting-date" /></FormField></div><FormField label="Action area"><select name="actionArea" required defaultValue="" className={selectClass} data-testid="select-meeting-action-area"><option value="" disabled>What is this meeting for?</option><option>Trade & investment</option><option>Security dialogue</option><option>Climate & energy</option><option>Humanitarian affairs</option><option>Protocol & access</option></select></FormField><FormField label="Owner (optional)"><input name="owner" placeholder="Team member" className={inputClass} data-testid="input-meeting-owner" /></FormField><div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-meeting">Cancel</button><PrimaryButton type="submit" testId="button-submit-meeting">{createMeeting.isPending ? 'Saving…' : 'Schedule meeting'}</PrimaryButton></div></form></AddDialog>
  </div>;
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const updateMeeting = useUpdateMeeting();
  const actionItemsQuery = useListActionItems(meeting.id);
  const openActionItems = (actionItemsQuery.data ?? []).filter((i) => i.status !== 'completed').length;
  const updateStatus = (status: 'scheduled' | 'completed' | 'follow_up') => updateMeeting.mutate({ id: meeting.id, data: { status } }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListMeetingsQueryKey() }) });
  return <article className="group grid gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[0_4px_16px_hsl(190_20%_20%/.03)] hover:border-[hsl(var(--accent-foreground)/.45)] sm:grid-cols-[86px_1fr_auto] sm:items-center" data-testid={`card-meeting-${meeting.id}`}><div className="flex items-center gap-3 sm:block"><div className="font-mono text-[11px] font-bold uppercase tracking-[.08em] text-[hsl(var(--accent-foreground))]">{formatDate(meeting.date).split(' ')[1]}</div><div className="font-serif text-[29px] leading-none">{formatDate(meeting.date).split(' ')[0]}</div><div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatTime(meeting.date)}</div></div><div className="border-l-0 sm:border-l sm:pl-5"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={toneForStatus(meeting.status)}>{meeting.status.replace('_', ' ')}</StatusPill><span className="text-[11px] text-[hsl(var(--muted-foreground))]">{meeting.countryName}</span></div><h3 className="font-serif text-[20px]"><Link to="/meeting/$meetingId" params={{ meetingId: String(meeting.id) }} className="hover:text-[hsl(var(--primary))]" data-testid={`link-meeting-detail-${meeting.id}`}>{meeting.title}</Link></h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[hsl(var(--muted-foreground))]"><span>{meeting.actionArea}</span><span>{meeting.participants} participants</span><span>{openActionItems} open action{openActionItems === 1 ? '' : 's'}</span>{meeting.owner && <span>Owner: {meeting.owner}</span>}</div></div><select value={meeting.status} onChange={(event) => updateStatus(event.target.value as 'scheduled' | 'completed' | 'follow_up')} disabled={updateMeeting.isPending} className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-[11px] font-bold" aria-label={`Update status for ${meeting.title}`} data-testid={`select-meeting-status-${meeting.id}`}><option value="scheduled">Scheduled</option><option value="follow_up">Follow-up</option><option value="completed">Completed</option></select></article>;
}

export function AgreementsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const agreementsQuery = useListAgreements({ search: search || undefined, status: (status || undefined) as 'draft' | 'review' | 'signed' | 'archived' | undefined });
  const countriesQuery = useListCountries();
  const createAgreement = useCreateAgreement();
  const agreements = agreementsQuery.data ?? [];
  const submit = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const input: AgreementInput = { name: String(form.get('name')), type: String(form.get('type')), countryId: Number(form.get('countryId')), status: String(form.get('status')) as AgreementInput['status'], renewalDate: String(form.get('renewalDate') || '') }; createAgreement.mutate({ data: input }, { onSuccess: () => { setOpen(false); void queryClient.invalidateQueries({ queryKey: getListAgreementsQueryKey() }); } }); };
  return <div className="animate-rise-in"><PageIntro eyebrow="Portfolio / 04" title="Agreements with a pulse." description="Track the instruments that turn intent into durable cooperation, from first draft to renewal." action={<PrimaryButton testId="button-add-agreement" onClick={() => setOpen(true)}><Plus size={16} /> Add agreement</PrimaryButton>} /><div className="mb-5 flex flex-col gap-3 lg:flex-row"><SearchField value={search} onChange={setSearch} placeholder="Search agreements or counterparties" testId="input-search-agreements" /><div className="flex gap-2 overflow-x-auto">{[['', 'All'], ['draft', 'Draft'], ['review', 'In review'], ['signed', 'Signed'], ['archived', 'Archived']].map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`whitespace-nowrap rounded-xl border px-3.5 text-[11px] font-bold ${status === value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]'}`} data-testid={`button-filter-agreements-${value || 'all'}`}>{label}</button>)}</div></div>
    {agreementsQuery.isLoading ? <LoadingRows count={6} /> : agreementsQuery.isError ? <ErrorState onRetry={() => void agreementsQuery.refetch()} /> : agreements.length ? <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="hidden grid-cols-[1.4fr_.9fr_1fr_110px_110px] gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-5 py-3 text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))] md:grid"><span>Agreement</span><span>Type</span><span>Country</span><span>Status</span><span>Renewal</span></div>{agreements.map((agreement) => <AgreementRow agreement={agreement} key={agreement.id} />)}</div> : <EmptyState icon={FileCheck2} title="No agreements in view" description={search ? 'No agreement matches this search.' : 'Add the first agreement record to keep the lifecycle visible.'} action={<PrimaryButton testId="button-empty-add-agreement" onClick={() => setOpen(true)}><Plus size={15} /> Add agreement</PrimaryButton>} />}
    <AddDialog open={open} title="Add agreement record" onClose={() => setOpen(false)}><form onSubmit={submit} className="space-y-4"><FormField label="Agreement name"><input name="name" required placeholder="Memorandum of understanding" className={inputClass} data-testid="input-agreement-name" /></FormField><div className="grid gap-3 sm:grid-cols-2"><FormField label="Type"><select name="type" required defaultValue="" className={selectClass} data-testid="select-agreement-type"><option value="" disabled>Select type</option><option>Memorandum of understanding</option><option>Treaty</option><option>Framework agreement</option><option>Protocol</option><option>Letter of intent</option></select></FormField><FormField label="Country workspace"><select name="countryId" required defaultValue="" className={selectClass} data-testid="select-agreement-country"><option value="" disabled>Select country</option>{(countriesQuery.data ?? []).map((country) => <option value={country.id} key={country.id}>{country.name}</option>)}</select></FormField></div><FormField label="Lifecycle status"><select name="status" className={selectClass} defaultValue="draft" data-testid="select-agreement-status"><option value="draft">Draft</option><option value="review">In review</option><option value="signed">Signed</option><option value="archived">Archived</option></select></FormField><FormField label="Renewal date (optional)"><input name="renewalDate" type="date" className={inputClass} data-testid="input-agreement-renewal-date" /></FormField><div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-agreement">Cancel</button><PrimaryButton type="submit" testId="button-submit-agreement">{createAgreement.isPending ? 'Saving…' : 'Create agreement'}</PrimaryButton></div></form></AddDialog>
  </div>;
}

function AgreementRow({ agreement }: { agreement: Agreement }) {
  const updateAgreement = useUpdateAgreement();
  const updateLifecycle = useUpdateAgreementLifecycle();
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const updateStatus = (status: 'draft' | 'review' | 'signed' | 'archived') => updateAgreement.mutate({ id: agreement.id, data: { status } }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getListAgreementsQueryKey() }); void queryClient.invalidateQueries({ queryKey: getListActivityQueryKey() }); } });
  const lifecycle = agreement.lifecycleState ?? 'draft';
  const lifecycleTransitions: Record<string, string[]> = {
    draft: ['review'],
    review: ['approved', 'draft'],
    approved: ['signed', 'review'],
    signed: ['archived'],
    archived: [],
  };
  const handleLifecycle = (next: string) => {
    setTransitioning(next);
    updateLifecycle.mutate({ id: agreement.id, data: { lifecycleState: next as AgreementLifecycleState } }, {
      onSuccess: () => {
        setTransitioning(null);
        void queryClient.invalidateQueries({ queryKey: getListAgreementsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getListActivityQueryKey() });
      },
      onError: () => setTransitioning(null),
    });
  };
  const friendlyTransition = (state: string) => state === 'approved' ? 'approve' : state === 'signed' ? 'sign' : state === 'archived' ? 'archive' : state;
  return <div className={`grid gap-3 border-b border-[hsl(var(--border))] px-5 py-4 last:border-0 hover:bg-[hsl(var(--muted)/.38)] md:grid-cols-[1.4fr_.9fr_1fr_120px_150px_110px] md:items-center md:gap-4 ${transitioning ? 'opacity-60' : ''}`} data-testid={`row-agreement-${agreement.id}`}><div><p className="text-xs font-bold">{agreement.name}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Updated {formatDate(agreement.updatedAt)}</p></div><div className="hidden text-xs md:block">{agreement.type}</div><div className="flex justify-between text-xs md:block"><span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Country</span>{agreement.countryName}</div><div className="flex justify-between md:block"><span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Status</span><select value={agreement.status} onChange={(event) => updateStatus(event.target.value as 'draft' | 'review' | 'signed' | 'archived')} disabled={updateAgreement.isPending} className="h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-[11px] font-bold" aria-label={`Update status for ${agreement.name}`} data-testid={`select-agreement-status-${agreement.id}`}><option value="draft">Draft</option><option value="review">In review</option><option value="signed">Signed</option><option value="archived">Archived</option></select></div><div className="flex justify-between md:block"><span className="text-[10px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] md:hidden">Lifecycle</span><StatusPill tone={lifecycleTone(lifecycle)}>{lifecycle}</StatusPill></div><div className="flex justify-end md:block"><div className="flex flex-wrap items-center gap-1.5">{lifecycleTransitions[lifecycle] && lifecycleTransitions[lifecycle].map((next) => <button key={next} onClick={() => handleLifecycle(next)} disabled={updateLifecycle.isPending} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-[10px] font-bold text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]" data-testid={`button-agreement-lifecycle-${next}-${agreement.id}`}>{friendlyTransition(next)}</button>)}</div></div></div>;
}

function lifecycleTone(state: string): 'neutral' | 'gold' | 'green' | 'red' | 'blue' {
  if (['signed'].includes(state)) return 'green';
  if (['draft', 'review'].includes(state)) return 'gold';
  if (['archived'].includes(state)) return 'red';
  if (['approved'].includes(state)) return 'blue';
  return 'neutral';
}

export function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const healthQuery = useHealthCheck();
  const [digest, setDigest] = useState(true);
  const [compact, setCompact] = useState(false);
  const { user, signOut } = useSessionInfo();
  return <div className="animate-rise-in"><PageIntro eyebrow="Governance / 05" title="A workspace that knows its boundaries." description="Preferences and access context for a team handling sensitive diplomatic relationships." /><div className="grid max-w-5xl gap-6 xl:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="border-b border-[hsl(var(--border))] px-6 py-5"><h3 className="font-serif text-[22px]">Workspace preferences</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Make Meridian fit the way your team works.</p></div><div className="divide-y divide-[hsl(var(--border))]"><SettingRow label="Weekly briefing digest" description="A Monday summary of changes across your portfolio" checked={digest} onChange={setDigest} testId="switch-weekly-digest" /><SettingRow label="Compact record density" description="Show more records per screen in directory views" checked={compact} onChange={setCompact} testId="switch-compact-density" /><div className="flex items-center justify-between gap-4 px-6 py-5"><div><p className="text-sm font-bold">Default region view</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">The region shown first on country workspaces</p></div><select className="h-10 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-xs font-bold" defaultValue="all" data-testid="select-default-region"><option value="all">All regions</option><option>Europe & Central Asia</option><option>East Asia & Pacific</option><option>Americas</option></select></div></div><div className="flex items-center justify-between border-t border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.35)] px-6 py-4"><span className={`text-xs ${saved ? 'text-[hsl(157_38%_30%)]' : 'text-[hsl(var(--muted-foreground))]'}`}>{saved ? 'Preferences saved locally' : 'Changes apply to this browser'}</span><PrimaryButton testId="button-save-preferences" onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 2500); }}>{saved ? <><Check size={15} /> Saved</> : 'Save preferences'}</PrimaryButton></div></section><div className="space-y-6"><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]"><div className="mb-5 flex items-center gap-2 text-[hsl(var(--accent))]"><ShieldCheck size={18} /><span className="text-[10px] font-bold uppercase tracking-[.18em]">Access context</span></div><p className="font-serif text-[25px] leading-tight">Your access is intentionally narrow.</p><div className="mt-6 space-y-3 border-t border-[hsl(42_25%_70%/.2)] pt-4"><AccessLine label="Workspace role" value={user?.roleLabel ?? '—'} /><AccessLine label="Signed in as" value={user?.email || '—'} /><AccessLine label="Last sign-in" value={user?.lastSignInAt ? formatDate(user.lastSignInAt, true) : '—'} />{authDemoEnabled() ? null : <div className="pt-2"><button onClick={() => void signOut()} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(42_25%_70%/.4)] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:bg-[hsl(42_25%_70%/.15)]" data-testid="button-sign-out"><X size={14} /> Sign out of Meridian</button></div>}</div></section><section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"><div className="mb-4 flex items-center gap-2"><LifeBuoy size={17} className="text-[hsl(var(--accent-foreground))]" /><h3 className="font-serif text-[20px]">System status</h3></div><div className="flex items-center justify-between rounded-xl bg-[hsl(var(--secondary)/.5)] px-4 py-3"><span className="text-xs font-bold">Meridian API</span><span className="flex items-center gap-2 text-[11px] font-bold text-[hsl(157_38%_30%)]"><span className="h-2 w-2 rounded-full bg-[hsl(157_50%_49%)]" />{healthQuery.isLoading ? 'Checking' : healthQuery.isError ? 'Needs attention' : healthQuery.data?.status ?? 'Operational'}</span></div><p className="mt-4 text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">For access changes or an incident report, contact the workspace administrator.</p></section></div></div></div>;
}

function SettingRow({ label, description, checked, onChange, testId }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; testId: string }) {
  return <div className="flex items-center justify-between gap-4 px-6 py-5"><div><p className="text-sm font-bold">{label}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{description}</p></div><button onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full ${checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`} aria-pressed={checked} data-testid={testId}><span className={`absolute top-1 h-4 w-4 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} /></button></div>;
}

function AccessLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 text-xs"><span className="text-[hsl(42_25%_69%)]">{label}</span><span className="text-right font-bold">{value}</span></div>;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'documents', label: 'Documents' },
  { id: 'news', label: 'News' },
  { id: 'government', label: 'Government' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'analytics', label: 'Analytics' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function TabButton({ id, label, active, onClick }: { id: TabId; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[11px] font-bold transition-colors ${
        active
          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
          : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]'
      }`}
      data-testid={`tab-${id}`}
    >
      {label}
    </button>
  );
}

export function EmptyPlaceholder({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ size?: number }>; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="mb-4 text-[hsl(var(--muted-foreground))]"><Icon size={48} /></span>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KpiCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
      <div className="flex items-center justify-between">
        <span className="text-[hsl(var(--muted-foreground))]"><Icon size={22} /></span>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  );
}

function ContactsList({ countryId }: { countryId: number }) {
  const contactsQuery = useListContacts({ countryId });
  const contacts = contactsQuery.data ?? [];
  return (
    <div className="space-y-3">
      {contactsQuery.isLoading ? (
        <LoadingRows count={5} />
      ) : contactsQuery.isError ? (
        <ErrorState onRetry={() => void contactsQuery.refetch()} />
      ) : contacts.length ? (
        contacts.map((contact) => (
          <div key={contact.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--muted)/.38)]">
            <p className="text-sm font-bold">{contact.name}</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{contact.title} · {contact.institution}</p>
          </div>
        ))
      ) : (
        <EmptyPlaceholder icon={Users} title="No contacts yet" description="Add your first contact in this country." />
      )}
    </div>
  );
}

function MeetingsList({ countryId }: { countryId: number }) {
  const meetingsQuery = useListMeetings({ countryId });
  const meetings = meetingsQuery.data ?? [];
  return (
    <div className="space-y-3">
      {meetingsQuery.isLoading ? (
        <LoadingRows count={5} />
      ) : meetingsQuery.isError ? (
        <ErrorState onRetry={() => void meetingsQuery.refetch()} />
      ) : meetings.length ? (
        meetings.map((meeting) => (
          <div key={meeting.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--muted)/.38)]">
            <p className="text-sm font-bold"><Link to="/meeting/$meetingId" params={{ meetingId: String(meeting.id) }} className="hover:text-[hsl(var(--primary))]" data-testid={`link-meeting-detail-${meeting.id}`}>{meeting.title}</Link></p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(meeting.date)} · {meeting.status}</p>
          </div>
        ))
      ) : (
        <EmptyPlaceholder icon={CalendarDays} title="No meetings yet" description="Schedule your first meeting in this country." />
      )}
    </div>
  );
}

function AgreementsList({ countryId }: { countryId: number }) {
  const agreementsQuery = useListAgreements({ countryId });
  const agreements = agreementsQuery.data ?? [];
  return (
    <div className="space-y-3">
      {agreementsQuery.isLoading ? (
        <LoadingRows count={5} />
      ) : agreementsQuery.isError ? (
        <ErrorState onRetry={() => void agreementsQuery.refetch()} />
      ) : agreements.length ? (
        agreements.map((agreement) => (
          <div key={agreement.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--muted)/.38)]">
            <p className="text-sm font-bold">{agreement.name}</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{agreement.type} · {agreement.status} · Renewal: {formatDate(agreement.renewalDate, true)}</p>
          </div>
        ))
      ) : (
        <EmptyPlaceholder icon={FileCheck2} title="No agreements yet" description="Record your first agreement for this country." />
      )}
    </div>
  );
}

function DocumentsList({ countryId }: { countryId: number }) {
  const documentsQuery = useListDocuments({ countryId });
  const createDoc = useCreateDocument();
  const deleteDoc = useDeleteDocument();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('report');
  const documents = documentsQuery.data ?? [];

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createDoc.mutate(
      { data: { countryId, title, type } },
      {
        onSuccess: () => {
          setTitle('');
          setType('report');
          setOpen(false);
          void queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey({ countryId }) });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <AddDialog open={open} title="Add document" onClose={() => setOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Title">
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Briefing notes" className={inputClass} data-testid="input-doc-title" />
          </FormField>
          <FormField label="Type">
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass} data-testid="select-doc-type">
              <option value="report">Report</option>
              <option value="memo">Memo</option>
              <option value="briefing">Briefing</option>
              <option value="correspondence">Correspondence</option>
              <option value="legal">Legal</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-doc">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-doc">{createDoc.isPending ? 'Saving…' : 'Create document'}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      <div className="flex justify-between items-center">
        <PrimaryButton testId="button-add-doc" onClick={() => setOpen(true)}><Plus size={16} /> Add document</PrimaryButton>
      </div>
      {documentsQuery.isLoading ? (
        <LoadingRows count={5} />
      ) : documentsQuery.isError ? (
        <ErrorState onRetry={() => void documentsQuery.refetch()} />
      ) : documents.length ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onDelete={() => deleteDoc.mutate({ id: doc.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey({ countryId }) }) })} />
          ))}
        </div>
      ) : (
        <EmptyPlaceholder icon={FileText} title="No documents yet" description="Upload your first document for this country." action={<PrimaryButton testId="button-empty-add-doc" onClick={() => setOpen(true)}><Plus size={15} /> Add document</PrimaryButton>} />
      )}
    </div>
  );
}

function DocumentRow({ doc, onDelete }: { doc: Document; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--muted)/.38)]" data-testid={`row-doc-${doc.id}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{doc.title}</p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{doc.type} · Updated {formatDate(doc.createdAt)}</p>
      </div>
      <button onClick={onDelete} className="h-8 w-8 rounded-lg hover:bg-[hsl(var(--destructive)/.15)] text-[hsl(var(--destructive))] transition-colors" aria-label={`Delete ${doc.title}`} data-testid={`button-delete-doc-${doc.id}`}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function NewsList({ countryId }: { countryId: number }) {
  const newsQuery = useListNews({ countryId });
  const createNews = useCreateNews();
  const deleteNews = useDeleteNews();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [summary, setSummary] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const news = newsQuery.data ?? [];

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createNews.mutate(
      { data: { countryId, title, source, summary: summary || undefined, publishedAt } },
      {
        onSuccess: () => {
          setTitle('');
          setSource('');
          setSummary('');
          setPublishedAt('');
          setOpen(false);
          void queryClient.invalidateQueries({ queryKey: getListNewsQueryKey({ countryId }) });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <AddDialog open={open} title="Add news item" onClose={() => setOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Title">
            <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Election results announced" className={inputClass} data-testid="input-news-title" />
          </FormField>
          <FormField label="Source">
            <input name="source" required value={source} onChange={(e) => setSource(e.target.value)} placeholder="Reuters, BBC, local outlet..." className={inputClass} data-testid="input-news-source" />
          </FormField>
          <FormField label="Published date">
            <input name="publishedAt" type="date" required value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} className={inputClass} data-testid="input-news-published-at" />
          </FormField>
          <FormField label="Summary">
            <textarea name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Key developments and implications..." className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]" data-testid="textarea-news-summary" />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-news">Cancel</button>
            <PrimaryButton type="submit" testId="button-submit-news">{createNews.isPending ? 'Saving…' : 'Create news item'}</PrimaryButton>
          </div>
        </form>
      </AddDialog>
      <div className="flex justify-between items-center">
        <PrimaryButton testId="button-add-news" onClick={() => setOpen(true)}><Plus size={16} /> Add news</PrimaryButton>
      </div>
      {newsQuery.isLoading ? (
        <LoadingRows count={5} />
      ) : newsQuery.isError ? (
        <ErrorState onRetry={() => void newsQuery.refetch()} />
      ) : news.length ? (
        <div className="space-y-2">
          {news.map((item) => (
            <NewsRow key={item.id} item={item} onDelete={() => deleteNews.mutate({ id: item.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListNewsQueryKey({ countryId }) }) })} />
          ))}
        </div>
      ) : (
        <EmptyPlaceholder icon={Newspaper} title="No news yet" description="Add your first news item for this country." action={<PrimaryButton testId="button-empty-add-news" onClick={() => setOpen(true)}><Plus size={15} /> Add news</PrimaryButton>} />
      )}
    </div>
  );
}

function NewsRow({ item, onDelete }: { item: News; onDelete: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 hover:bg-[hsl(var(--muted)/.38)]" data-testid={`row-news-${item.id}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold truncate">{item.title}</p>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">{item.summary}</p>
        <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Published {formatDate(item.publishedAt)}</p>
      </div>
      <button onClick={onDelete} className="h-8 w-8 rounded-lg hover:bg-[hsl(var(--destructive)/.15)] text-[hsl(var(--destructive))] transition-colors" aria-label={`Delete ${item.title}`} data-testid={`button-delete-news-${item.id}`}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function ActivityRow({ row }: { row: { id: number; kind: string; title: string; description: string; occurredAt: string; actorName?: string | null; countryName?: string | null } }) {
  const kindColors: Record<string, 'green' | 'gold' | 'neutral'> = {
    create: 'green',
    update: 'gold',
    read: 'neutral',
    delete: 'gold',
  };
  const tone = kindColors[row.kind] ?? 'neutral';
  return (
    <div className="px-6 py-4 border-b border-[hsl(var(--border))] last:border-0" data-testid={`activity-row-${row.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill tone={tone}>{row.kind}</StatusPill>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold">{row.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-[hsl(var(--muted-foreground))]">
              {row.actorName ?? 'Unknown'}{row.countryName ? ` · ${row.countryName}` : ''}
            </p>
          </div>
        </div>
        <time className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
          {formatDate(row.occurredAt, true)} {formatTime(row.occurredAt)}
        </time>
      </div>
      <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{row.description}</p>
    </div>
  );
}

export function CountryDetailPage() {
  const params = useParams({ from: '/country/$countryId', strict: true });
  const id = Number(params.countryId);
  const countryQuery = useGetCountry(id);
  const country = countryQuery.data;
  const activityQuery = useListActivity({ countryId: id });
  const contactsQuery = useListContacts({ countryId: id });
  const meetingsQuery = useListMeetings({ countryId: id });
  const agreementsQuery = useListAgreements({ countryId: id });
  const documentsQuery = useListDocuments({ countryId: id });
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    language: '',
    governmentType: '',
    electionYear: 0,
    team: '',
    priority: 'medium',
    strategy: '',
    primaryOwnerUserId: '',
    secondaryOwnerUserId: '',
    reviewerUserId: '',
    regionalCoordinatorUserId: '',
  });
  const updateCountry = useUpdateCountry();
  const assignableUsersQuery = useListAssignableUsers({ query: { queryKey: getListAssignableUsersQueryKey(), enabled: editOpen } });
  const assignableUsers = assignableUsersQuery.data ?? [];

  useEffect(() => {
    if (country) {
      setEditValues({
        language: country.language ?? '',
        governmentType: country.governmentType ?? '',
        electionYear: country.electionYear ?? 0,
        team: country.team ?? '',
        priority: country.priority ?? 'medium',
        strategy: country.strategy ?? '',
        primaryOwnerUserId: country.primaryOwner?.userId ?? '',
        secondaryOwnerUserId: country.secondaryOwner?.userId ?? '',
        reviewerUserId: country.reviewer?.userId ?? '',
        regionalCoordinatorUserId: country.regionalCoordinator?.userId ?? '',
      });
    }
  }, [country]);

  const handleEditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data: CountryUpdate = {
      language: editValues.language,
      governmentType: editValues.governmentType as CountryUpdate['governmentType'],
      electionYear: editValues.electionYear,
      team: editValues.team,
      priority: editValues.priority as CountryUpdate['priority'],
      strategy: editValues.strategy,
      primaryOwnerUserId: editValues.primaryOwnerUserId === '' ? null : editValues.primaryOwnerUserId,
      secondaryOwnerUserId: editValues.secondaryOwnerUserId === '' ? null : editValues.secondaryOwnerUserId,
      reviewerUserId: editValues.reviewerUserId === '' ? null : editValues.reviewerUserId,
      regionalCoordinatorUserId: editValues.regionalCoordinatorUserId === '' ? null : editValues.regionalCoordinatorUserId,
    };
    updateCountry.mutate(
      { id, data },
      {
        onSuccess: () => {
          setEditOpen(false);
          void queryClient.invalidateQueries({ queryKey: getGetCountryQueryKey(id) });
          void queryClient.invalidateQueries({ queryKey: getListCountriesQueryKey() });
        },
      }
    );
  };

  if (countryQuery.isLoading) return <LoadingRows count={6} />;
  if (countryQuery.isError) return <ErrorState onRetry={() => void countryQuery.refetch()} />;
  if (!country) return <NotFound />;

  const govTypes = [
    'presidential republic',
    'semi-presidential',
    'parliamentary republic',
    'parliamentary monarchy',
    'constitutional monarchy',
    'absolute monarchy',
    'one-party state',
    'transitional',
  ] as const;

  return (
    <div className="animate-rise-in">
      <PageIntro
        eyebrow="Portfolio"
        title={country.name}
        description={`${country.region} · ${country.governmentType ?? 'Government type not set'} · Election: ${country.electionYear ?? '—'} · Team: ${country.team ?? '—'} · Language: ${country.language ?? '—'} · Risk: ${country.riskLevel}`}
        action={
          <>
            <PrimaryButton testId="button-country-edit" onClick={() => setEditOpen(true)}>
              <FileCheck2 size={14} /> Edit details
            </PrimaryButton>
            <AddDialog open={editOpen} title="Edit country details" onClose={() => setEditOpen(false)}>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Language">
                    <input
                      name="language"
                      value={editValues.language}
                      onChange={(e) => setEditValues({ ...editValues, language: e.target.value })}
                      placeholder="e.g. English"
                      className={inputClass}
                      data-testid="country-field-language"
                    />
                  </FormField>
                  <FormField label="Government type">
                    <select
                      name="governmentType"
                      value={editValues.governmentType}
                      onChange={(e) => setEditValues({ ...editValues, governmentType: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-government-type"
                    >
                      <option value="">Select type</option>
                      {govTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Election year">
                    <input
                      name="electionYear"
                      type="number"
                      value={editValues.electionYear}
                      onChange={(e) => setEditValues({ ...editValues, electionYear: Number(e.target.value) || 0 })}
                      placeholder="2024"
                      className={inputClass}
                      data-testid="country-field-election-year"
                    />
                  </FormField>
                  <FormField label="Team">
                    <input
                      name="team"
                      value={editValues.team}
                      onChange={(e) => setEditValues({ ...editValues, team: e.target.value })}
                      placeholder="QA desk"
                      className={inputClass}
                      data-testid="country-field-team"
                    />
                  </FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Priority">
                    <select
                      name="priority"
                      value={editValues.priority}
                      onChange={(e) => setEditValues({ ...editValues, priority: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-priority"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </FormField>
                  <FormField label="Strategy">
                    <textarea
                      name="strategy"
                      value={editValues.strategy}
                      onChange={(e) => setEditValues({ ...editValues, strategy: e.target.value })}
                      placeholder="Engagement priorities..."
                      className="h-24 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
                      data-testid="country-field-strategy"
                    />
                  </FormField>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Primary owner">
                    <select
                      name="primaryOwnerUserId"
                      value={editValues.primaryOwnerUserId}
                      onChange={(e) => setEditValues({ ...editValues, primaryOwnerUserId: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-assignee-primary-owner"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Secondary owner">
                    <select
                      name="secondaryOwnerUserId"
                      value={editValues.secondaryOwnerUserId}
                      onChange={(e) => setEditValues({ ...editValues, secondaryOwnerUserId: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-assignee-secondary-owner"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Reviewer">
                    <select
                      name="reviewerUserId"
                      value={editValues.reviewerUserId}
                      onChange={(e) => setEditValues({ ...editValues, reviewerUserId: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-assignee-reviewer"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Regional coordinator">
                    <select
                      name="regionalCoordinatorUserId"
                      value={editValues.regionalCoordinatorUserId}
                      onChange={(e) => setEditValues({ ...editValues, regionalCoordinatorUserId: e.target.value })}
                      className={selectClass}
                      data-testid="country-field-assignee-regional-coordinator"
                    >
                      <option value="">Unassigned</option>
                      {assignableUsers.map((u) => (
                        <option value={u.userId} key={u.userId}>{u.name} — {roleLabel(u.role)}</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] pt-5">
                  <button type="button" onClick={() => setEditOpen(false)} className="rounded-xl px-4 py-2.5 text-xs font-bold hover:bg-[hsl(var(--muted))]" data-testid="button-cancel-edit">
                    Cancel
                  </button>
                  <PrimaryButton type="submit" testId="button-submit-edit">{updateCountry.isPending ? 'Saving…' : 'Save changes'}</PrimaryButton>
                </div>
              </form>
            </AddDialog>
          </>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row overflow-x-auto">
        {TABS.map((tab) => (
          <TabButton key={tab.id} id={tab.id} label={tab.label} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
        ))}
      </div>
      <div className="space-y-5">
{activeTab === 'overview' && country && <OverviewTab country={country} countryId={id} />}
        {activeTab === 'contacts' && <ContactsList countryId={id} />}
        {activeTab === 'meetings' && <MeetingsList countryId={id} />}
        {activeTab === 'agreements' && <AgreementsList countryId={id} />}
        {activeTab === 'documents' && <DocumentsList countryId={id} />}
        {activeTab === 'news' && <NewsList countryId={id} />}
        {activeTab === 'government' && <GovernmentTab countryId={id} />}
        {activeTab === 'organizations' && <OrganizationsTab countryId={id} />}
        {activeTab === 'strategies' && <StrategyPipeline countryId={id} />}
        {['tasks', 'analytics'].includes(activeTab) && (
          <EmptyPlaceholder
            icon={BarChart2}
            title="Coming soon"
            description={`The ${TABS.find((t) => t.id === activeTab)?.label} tab is not yet implemented.`}
          />
        )}
      </div>
    </div>
  );
}

export function AdminPage() {
  const usersQuery = useListAdminUsers();
  const membersQuery = useListAdminMembers();
  const createUser = useCreateAdminUser();
  const updateRole = useUpdateAdminUserRole();
  const createInvite = useCreateAdminInvitation();
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AdminUserInput['role']>('viewer');
  const [inviteEmail, setInviteEmail] = useState('');
  const [notice, setNotice] = useState<{ email: string; tempPassword: string; verificationToken: string | null } | null>(null);
  const users = usersQuery.data ?? [];
  const invitations = membersQuery.data?.invitations ?? [];
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAdminMembersQueryKey() });
  };
  const submitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createUser.mutate(
      { data: { email: newEmail, name: newName, role: newRole } },
      {
        onSuccess: (res) => {
          setNotice({ email: res.user.email, tempPassword: res.tempPassword, verificationToken: res.verificationToken ?? null });
          setNewEmail('');
          setNewName('');
          void invalidate();
        },
      },
    );
  };
  const changeRole = (user: AdminUser, role: string) => {
    if (role === user.role) return;
    updateRole.mutate({ id: user.id, data: { role: role as AdminUserInput['role'] } }, { onSuccess: () => invalidate() });
  };
  const submitInvite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createInvite.mutate({ data: { email: inviteEmail } }, { onSuccess: () => { setInviteEmail(''); void invalidate(); } });
  };
  return <div className="animate-rise-in"><PageIntro eyebrow="Governance / Admin" title="Who holds the room." description="Manage workspace access: create accounts, assign roles, and invite colleagues to Meridian." />
    {notice && <div className="mb-6 rounded-2xl border border-[hsl(var(--accent-foreground)/.4)] bg-[hsl(42_76%_68%/.12)] p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold">Account for {notice.email} is ready</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Share the temporary password with the user — it is shown only once. They will be asked to verify their email on first sign-in.</p></div><button onClick={() => setNotice(null)} className="rounded-lg p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]" aria-label="Dismiss notice" data-testid="button-dismiss-notice"><X size={16} /></button></div>
      <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[hsl(var(--card))] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Temporary password</p><p className="mt-1 break-all font-mono text-sm" data-testid="text-temp-password">{notice.tempPassword}</p></div><div className="rounded-xl bg-[hsl(var(--card))] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Verification token</p><p className="mt-1 break-all font-mono text-sm" data-testid="text-verification-code">{notice.verificationToken ?? '—'}</p></div></div>
    </div>}
    <div className="grid gap-6">
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="border-b border-[hsl(var(--border))] px-6 py-5"><h3 className="font-serif text-[22px]">Create a user account</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Accounts are issued with a temporary password and require email verification.</p></div><form onSubmit={submitCreate} className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4"><FormField label="Email"><input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} type="email" required placeholder="name@ministry.gov" className={inputClass} data-testid="input-admin-user-email" /></FormField><FormField label="Full name"><input value={newName} onChange={(event) => setNewName(event.target.value)} required placeholder="Full name" className={inputClass} data-testid="input-admin-user-name" /></FormField><FormField label="Role"><select value={newRole} onChange={(event) => setNewRole(event.target.value as AdminUserInput['role'])} className={selectClass} data-testid="select-admin-user-role">{['global_admin', 'regional_director', 'country_lead', 'research', 'meeting_coordinator', 'viewer'].map((role) => <option value={role} key={role}>{roleLabel(role)}</option>)}</select></FormField><div className="flex items-end"><PrimaryButton type="submit" testId="button-admin-create-user">{createUser.isPending ? 'Creating…' : 'Create account'}</PrimaryButton></div></form></section>
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="border-b border-[hsl(var(--border))] px-6 py-5"><h3 className="font-serif text-[22px]">Workspace users</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Global roles gate data access; adjust them here.</p></div>
        {usersQuery.isLoading ? <div className="p-6"><LoadingRows count={4} /></div> : usersQuery.isError ? <div className="p-6"><ErrorState onRetry={() => void usersQuery.refetch()} /></div> : users.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] text-[10px] font-bold uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]"><th className="px-6 py-3">User</th><th className="px-6 py-3">Email</th><th className="px-6 py-3">Verified</th><th className="px-6 py-3">Role</th></tr></thead><tbody className="divide-y divide-[hsl(var(--border))]">{users.map((user) => <tr key={user.id} data-testid={`admin-member-row-${user.id}`}><td className="px-6 py-4 font-bold">{user.name}</td><td className="px-6 py-4 text-[hsl(var(--muted-foreground))]">{user.email}</td><td className="px-6 py-4"><StatusPill tone={user.emailVerified ? 'green' : 'gold'}>{user.emailVerified ? 'Verified' : 'Pending'}</StatusPill></td><td className="px-6 py-4"><select value={user.role} onChange={(event) => changeRole(user, event.target.value)} disabled={updateRole.isPending} className="h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-[11px] font-bold" aria-label={`Change role for ${user.name}`} data-testid={`admin-role-select-${user.id}`}>{['global_admin', 'regional_director', 'country_lead', 'research', 'meeting_coordinator', 'viewer'].map((role) => <option value={role} key={role}>{roleLabel(role)}</option>)}</select></td></tr>)}</tbody></table></div> : <div className="p-6"><EmptyState icon={Users} title="No users yet" description="Create the first account to invite your team." /></div>}
      </section>
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]"><div className="border-b border-[hsl(var(--border))] px-6 py-5"><h3 className="font-serif text-[22px]">Invitations</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Invite existing accounts into the workspace org.</p></div><form onSubmit={submitInvite} className="flex flex-col gap-3 border-b border-[hsl(var(--border))] p-6 sm:flex-row sm:items-end"><FormField label="Account email"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" required placeholder="name@ministry.gov" className={inputClass} data-testid="input-admin-invite-email" /></FormField><PrimaryButton type="submit" testId="button-admin-invite">{createInvite.isPending ? 'Sending…' : 'Send invitation'}</PrimaryButton></form><div className="divide-y divide-[hsl(var(--border))]">{invitations.length ? invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-4 px-6 py-4" data-testid={`admin-invitation-row-${invitation.id}`}><div className="min-w-0"><p className="truncate text-xs font-bold">{invitation.email}</p><p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">Invited · {formatDate(invitation.expiresAt, true)}</p></div><StatusPill tone={toneForStatus(invitation.status)}>{invitation.status.replace('_', ' ')}</StatusPill></div>) : <div className="px-6 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">No invitations yet.</div>}</div></section>
    </div>
  </div>;
}

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  country: 'Country',
  contact: 'Contact',
  meeting: 'Meeting',
  agreement: 'Agreement',
  admin_user: 'User',
  admin_invitation: 'Invitation',
  dashboard_summary: 'Dashboard',
};

export function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [openId, setOpenId] = useState<string | null>(null);
  const params = { action: action || undefined, entityType: entityType || undefined, limit };
  const auditQuery = useListAudit(params);
  const all = auditQuery.data ?? [];
  const rows = actorFilter.trim()
    ? all.filter((row) => (row.actorName ?? '').toLowerCase().includes(actorFilter.trim().toLowerCase()))
    : all;
  const actionTone: Record<string, 'green' | 'gold' | 'neutral'> = { create: 'green', update: 'gold', read: 'neutral' };
  return <div className="animate-rise-in"><PageIntro eyebrow="Governance / Audit" title="Every action, accounted for." description="An append-only record of who changed what, and who read what, across the workspace." />
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="border-b border-[hsl(var(--border))] px-6 py-5"><h3 className="font-serif text-[22px]">Audit trail</h3><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Filters apply to the trail; tone reflects whether the entry records a create, update, or read.</p></div>
      <div className="grid gap-3 border-b border-[hsl(var(--border))] p-6 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Action"><select value={action} onChange={(event) => setAction(event.target.value)} className={selectClass} data-testid="audit-filter-action"><option value="">All actions</option><option value="create">Create</option><option value="update">Update</option><option value="read">Read</option></select></FormField>
        <FormField label="Entity"><select value={entityType} onChange={(event) => setEntityType(event.target.value)} className={selectClass} data-testid="audit-filter-entity"><option value="">All entities</option>{Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></FormField>
        <FormField label="Actor"><input value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} type="search" placeholder="Filter by name…" className={inputClass} data-testid="audit-filter-actor" /></FormField>
        <FormField label="Result limit"><select value={limit} onChange={(event) => setLimit(Number(event.target.value))} className={selectClass} data-testid="audit-filter-limit"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value={200}>200</option></select></FormField>
      </div>
      {auditQuery.isLoading ? <div className="p-6"><LoadingRows count={5} /></div> : auditQuery.isError ? <div className="p-6"><ErrorState onRetry={() => void auditQuery.refetch()} /></div> : rows.length ? <div className="divide-y divide-[hsl(var(--border))]">{rows.map((row) => <AuditRow row={row} isOpen={openId === String(row.id)} onToggle={() => setOpenId(openId === String(row.id) ? null : String(row.id))} tone={actionTone[row.action] ?? 'neutral'} key={row.id} />)}</div> : <div className="p-6"><EmptyState icon={ScrollText} title="No entries here" description="Nothing matches those filters yet." /></div>}
    </section>
  </div>;
}

function AuditRow({ row, isOpen, onToggle, tone }: { row: AuditEntry; isOpen: boolean; onToggle: () => void; tone: 'green' | 'gold' | 'neutral' }) {
  return <div className="px-6 py-4" data-testid={`audit-row-${row.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div className="flex min-w-0 items-center gap-3"><StatusPill tone={tone}>{row.action}</StatusPill><div className="min-w-0"><p className="truncate text-xs font-bold">{row.title}</p><p className="mt-0.5 truncate text-[11px] text-[hsl(var(--muted-foreground))]">{row.actorName ?? 'Unknown'} · {AUDIT_ENTITY_LABELS[row.entityType] ?? row.entityType}{row.entityId ? ` #${row.entityId}` : ''}{row.countryName ? ` · ${row.countryName}` : ''}</p></div></div><div className="flex items-center gap-3"><time className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{formatDate(row.occurredAt, true)} {formatTime(row.occurredAt)}</time></div></div>
    <p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{row.description}</p>
    {(row.before || row.after) && <button onClick={onToggle} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.55)] px-2.5 py-1 text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]" data-testid={`button-audit-toggle-${row.id}`}>{isOpen ? 'Hide' : 'Show'} before/after <ChevronRight size={12} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} /></button>}
    {isOpen && <div className="mt-3 grid gap-3 sm:grid-cols-2">{row.before && <pre className="overflow-x-auto rounded-xl bg-[hsl(var(--secondary)/.55)] p-3 font-mono text-[11px] leading-5" data-testid={`audit-row-before-${row.id}`}>{JSON.stringify(row.before, null, 2)}</pre>}{row.after && <pre className="overflow-x-auto rounded-xl bg-[hsl(var(--secondary)/.55)] p-3 font-mono text-[11px] leading-5" data-testid={`audit-row-after-${row.id}`}>{JSON.stringify(row.after, null, 2)}</pre>}</div>}
  </div>;
}

export function QuickAddListener() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-quick-add', handler);
    return () => window.removeEventListener('open-quick-add', handler);
  }, []);
  return <AddDialog open={open} title="Log an engagement" onClose={() => setOpen(false)}><div className="space-y-2"><Link to="/meetings" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] p-4 hover:bg-[hsl(var(--muted))]" data-testid="link-quick-add-meeting"><div><p className="text-sm font-bold">Schedule a meeting</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Put the next conversation on the calendar.</p></div><ChevronRight size={16} /></Link><Link to="/contacts" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] p-4 hover:bg-[hsl(var(--muted))]" data-testid="link-quick-add-contact"><div><p className="text-sm font-bold">Add a contact</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Keep the relationship map current.</p></div><ChevronRight size={16} /></Link><Link to="/agreements" onClick={() => setOpen(false)} className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] p-4 hover:bg-[hsl(var(--muted))]" data-testid="link-quick-add-agreement"><div><p className="text-sm font-bold">Record an agreement</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Give the lifecycle a shared source of truth.</p></div><ChevronRight size={16} /></Link></div></AddDialog>;
}

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'verify'>('signin');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      if (res.error.code === 'EMAIL_NOT_VERIFIED') {
        setMode('verify');
        setStatus('idle');
        void sendVerificationEmail(email);
        return;
      }
      setStatus('error');
      setError(res.error.message ?? 'Sign-in failed. Check your credentials.');
      return;
    }
    setStatus('idle');
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    const result = await verifyEmailToken(code.trim());
    if (!result.ok) {
      setStatus('error');
      setError(result.error);
      return;
    }
    setStatus('idle');
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <div className="workspace-grid w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-14 text-center shadow-xl">
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-[15px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <Landmark size={26} strokeWidth={2.2} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(157_50%_62%)] ring-2 ring-[hsl(var(--card))]" />
        </span>
        <h1 className="mt-6 font-serif text-[30px] leading-tight">Meridian</h1>
        {mode === 'verify' ? (
          <>
            <p className="mb-8 mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              A verification token was sent to <span className="font-bold">{email}</span>. Open the link in the email, or paste the token below to finish signing in.
            </p>
            <form onSubmit={verify} className="space-y-4">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Verification token"
                autoComplete="one-time-code"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-center text-sm font-mono outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-verification-code"
              />
              {error && <p className="text-xs font-bold text-[hsl(var(--destructive))]" data-testid="text-verification-error">{error}</p>}
              <button
                type="submit"
                className="h-12 w-full cursor-pointer rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                disabled={status === 'submitting'}
                data-testid="button-verify-code"
              >
                {status === 'submitting' ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                onClick={() => void sendVerificationEmail(email)}
                className="cursor-pointer text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                data-testid="button-resend-verification"
              >
                Resend verification token
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-8 mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Sign in to open the diplomatic workspace. Access is restricted to your diplomatic affairs team.</p>
            <form onSubmit={submit} className="space-y-4">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="email@ministry.gov"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-signin-email"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-signin-password"
              />
              {error && <p className="text-xs font-bold text-[hsl(var(--destructive))]" data-testid="text-signin-error">{error}</p>}
              <button
                type="submit"
                className="h-12 w-full cursor-pointer rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                disabled={status === 'submitting'}
                data-testid="button-sign-in"
              >
                {status === 'submitting' ? 'Signing in…' : 'Sign in to Meridian'}
              </button>
            </form>
            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.35)] px-4 py-3 text-[11px] text-[hsl(var(--muted-foreground))]">
              <ShieldCheck size={14} className="text-[hsl(var(--primary))]" />
              <span>Sign-in is required before confidential records are shown</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="flex min-h-[70dvh] items-center justify-center py-10">
      <div className="workspace-grid w-full max-w-xl rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.25)] px-8 py-16 text-center">
        <Compass className="mx-auto mb-5 text-[hsl(var(--accent-foreground))]" size={34} />
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[.2em] text-[hsl(var(--muted-foreground))]">Signal not found · 404</p>
        <h1 className="font-serif text-4xl">This room does not exist.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">The address may have changed, or this part of the workspace is outside your current access.</p>
        <Link to="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:-translate-y-0.5" data-testid="link-return-overview">
          <ArrowLeft size={15} /> Return to overview
        </Link>
      </div>
    </div>
  );
}