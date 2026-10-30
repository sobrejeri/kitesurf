import { StudentShell } from '@/components/shells';
import { getViewer } from '@/lib/auth';
import { initials } from '@/lib/people';

/** Explore and policies are public; every other student page calls requireRole. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <StudentShell name={viewer?.fullName || 'Visitante'} initials={initials(viewer?.fullName)} signedIn={Boolean(viewer)}>
      {children}
    </StudentShell>
  );
}
