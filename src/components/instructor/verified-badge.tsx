import type { InstructorStatus } from '@/lib/data';
import { VerifiedVentoBadge } from '@/components/verified-badge';

/** Existing instructor-facing wrapper: badge only while admin status is approved. */
export function VerifiedInstructorBadge({
  status,
  size = 'md',
}: {
  status: InstructorStatus | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  return <VerifiedVentoBadge kind="instructor" status={status} size={size} />;
}
