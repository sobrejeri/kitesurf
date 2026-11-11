/**
 * The Vento trust mark is awarded by the administration, not by the user.
 * It represents approval inside this app, not outside certification.
 */
export function VerifiedVentoBadge({
  status,
  kind,
  size = 'md',
}: {
  status: 'pending' | 'approved' | 'paused' | null | undefined;
  kind: 'instructor' | 'partner';
  size?: 'sm' | 'md' | 'lg';
}) {
  if (status !== 'approved') return null;

  const dimensions = size === 'sm' ? 'h-[19px] w-[19px]' : size === 'lg'
    ? 'h-[25px] w-[25px]' : 'h-[22px] w-[22px]';
  const ariaLabel = kind === 'partner'
    ? 'Afiliado verificado pelo VentoKite'
    : 'Instrutor verificado pelo Vento';

  return (
    <span
      className={'inline-flex shrink-0 items-center justify-center align-middle ' + dimensions}
      role="img"
      aria-label={ariaLabel}
      title="Cadastro aprovado pela administração do Vento"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-full w-full">
        <path
          fill="#2495FF"
          d="M12 1.5 14.7 3l3.1-.1 1.1 2.9L21.5 7l-.3 3.1L22.5 12l-1.3 1.9.3 3.1-2.6 1.2-1.1 2.9-3.1-.1L12 22.5 9.3 21l-3.1.1-1.1-2.9L2.5 17l.3-3.1L1.5 12l1.3-1.9L2.5 7l2.6-1.2 1.1-2.9 3.1.1L12 1.5Z"
        />
        <path
          d="m7.3 12.1 3.1 3.1 6.2-6.4"
          fill="none"
          stroke="#fff"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
