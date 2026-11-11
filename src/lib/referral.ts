import { SITE_URL } from './env';

/** The student page an affiliate shares; the proxy remembers `ref` for 30 days. */
export function referralLink(code: string): string {
  return `${SITE_URL}/aluno/inicio?ref=${encodeURIComponent(code)}`;
}

/** What the phone share sheet sends along with the link. */
export const REFERRAL_SHARE_TEXT =
  'Quer aprender kitesurf em Preá ou Jericoacoara? Reserve sua aula com instrutores verificados pelo VentoKite:';

/** Ready-to-send messages for the affiliate to copy or share. */
export function referralMessages(link: string) {
  return [
    {
      id: 'whatsapp',
      title: 'WhatsApp',
      icon: 'chat' as const,
      text: `${REFERRAL_SHARE_TEXT} ${link}`,
    },
    {
      id: 'instagram',
      title: 'Legenda para Instagram',
      icon: 'image' as const,
      text: `Vento bom, mar azul e instrutor verificado. Agende sua aula de kitesurf pelo VentoKite: ${link}`,
    },
    {
      id: 'recepcao',
      title: 'Recepção ou balcão',
      icon: 'grid' as const,
      text: 'Aulas de kitesurf com instrutores verificados. Aponte a câmera para o QR Code e agende pelo VentoKite.',
    },
  ];
}
