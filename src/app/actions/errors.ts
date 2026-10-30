/**
 * Database errors in words a person can act on. Unknown errors get a generic
 * message: the raw text can carry internal details and is only logged.
 */
const KNOWN: readonly [RegExp, string][] = [
  [/Unknown or inactive beach/i, 'Essa praia não está disponível. Escolha outra.'],
  [/Beach name must have/i, 'O nome da praia precisa ter de 2 a 60 letras.'],
  [/duplicate key.*beaches_name/i, 'Já existe uma praia com esse nome.'],
  [/No instructor available/i, 'Nenhum instrutor disponível nesses horários. Tente outro dia ou horário.'],
  [/at least one hour from now/i, 'Os encontros precisam começar daqui a pelo menos uma hora.'],
  [/At most 8 hours|Each meeting lasts/i, 'Cada reserva tem de 1 a 8 horas no total.'],
  [/Presence code does not match/i, 'O código de presença não confere.'],
  [/Start the meeting/i, 'Inicie o encontro com o código de presença antes de registrar.'],
  [/Done minutes must be/i, 'Os minutos realizados não podem passar do tempo agendado.'],
  [/not awaiting payment/i, 'Esta reserva não está aguardando pagamento.'],
  [/reason is required/i, 'Informe o motivo da alteração.'],
  [/Not allowed for role|Sign in required/i, 'Você não tem permissão para esta ação.'],
  [/not found/i, 'Registro não encontrado.'],
  [/duplicate key.*partners_owner_id/i, 'Esta conta já tem uma pousada cadastrada.'],
  [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
  [/User already registered/i, 'Já existe uma conta com este e-mail.'],
  [/Password should be/i, 'A senha precisa ter pelo menos 8 caracteres.'],
];

export function friendlyError(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? '';
  for (const [pattern, text] of KNOWN) if (pattern.test(message)) return text;
  console.error('Unexpected Supabase error:', message);
  return 'Não foi possível concluir agora. Tente novamente.';
}

export interface ActionState {
  error?: string;
  ok?: string;
}
