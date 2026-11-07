import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Meu perfil' };

/** Compatibility for existing links/bookmarks: account actions now live in Perfil. */
export default function AccessPage() {
  redirect('/aluno/conta');
}
