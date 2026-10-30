import { StudentShell } from '@/components/shells';
import { STUDENT } from '@/data/demo';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentShell name={STUDENT.name} initials={STUDENT.initials}>
      {children}
    </StudentShell>
  );
}
