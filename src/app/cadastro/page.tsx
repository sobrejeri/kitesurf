import { redirect } from 'next/navigation';

/** Old sign-up link: each app now has its own sign-up screen. */
export default async function SignUpRedirect({ searchParams }: { searchParams: Promise<{ perfil?: string }> }) {
  const { perfil } = await searchParams;
  redirect(perfil === 'instructor' ? '/instrutor/criar-conta' : perfil === 'partner' ? '/afiliado/criar-conta' : '/aluno/criar-conta');
}
