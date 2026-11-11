import { InfoDisclosure } from '@/components/ui';

/** How a referral turns into commission; one tap away on every affiliate screen. */
export function AffiliateProgramRules({ className = '' }: { className?: string }) {
  return (
    <InfoDisclosure title="Como funciona a comissão" className={className}>
      <p>
        Você recebe comissão somente na primeira reserva elegível do aluno que chegar pelo seu link.
        Novas reservas do mesmo aluno não geram outra comissão.
      </p>
      <p className="mt-2">
        A comissão sai da parte da plataforma: o preço do aluno e o líquido do instrutor não mudam.
        Reservas de validação não geram comissão, e os repasses ainda não são automáticos: dependem da
        integração de pagamento.
      </p>
    </InfoDisclosure>
  );
}
