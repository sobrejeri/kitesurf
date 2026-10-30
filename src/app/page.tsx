import { redirect } from 'next/navigation';

import { ROLE_HOME, getViewer } from '@/lib/auth';

/** Signed-in users land on their own area; visitors on the student home. */
export default async function IndexPage() {
  const viewer = await getViewer();
  redirect(viewer ? ROLE_HOME[viewer.role] : '/aluno/inicio');
}
