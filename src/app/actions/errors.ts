/**
 * Database errors in words a person can act on. Unknown errors get a generic
 * message: the raw text can carry internal details and is only logged.
 */
const KNOWN: readonly [RegExp, string][] = [
  [/New password should be different|same password/i,
    'Escolha uma senha diferente da senha atual.'],
  [/Please wait before sending again/i,
    'Aguarde dois segundos antes de enviar outra mensagem.'],
  [/Validation confirmation unavailable or expired/i,
    'O prazo de confirmação expirou ou a aula não está disponível. Confira a reserva ou procure um novo horário.'],
  [/Student already has a lesson at the selected time/i,
    'Você já tem uma aula ou uma busca de instrutor nesse horário. Escolha outro dia ou horário sem sobreposição.'],
  [/Overlapping meetings/i,
    'Há dois encontros no mesmo horário. Ajuste as datas e os horários para continuar.'],
  [/Invalid meeting date or hours/i,
    'Confira os horários: cada aula precisa começar com pelo menos uma hora de antecedência.'],
  [/Meeting change must be requested 72 hours before/i,
    'Alterações precisam ser solicitadas com pelo menos 3 dias (72 horas) de antecedência da aula original.'],
  [/Propose a new date at least 72 hours away/i,
    'Escolha uma nova data pelo menos 72 horas à frente, dentro dos próximos 90 dias.'],
  [/Another change request is waiting for approval/i,
    'Já existe uma mudança pendente nesta reserva. Aguarde a resposta antes de solicitar outra.'],
  [/Change reason must have/i,
    'Escreva um motivo com 8 a 500 caracteres.'],
  [/New meeting time changes booking order/i,
    'A nova data não pode ultrapassar ou anteceder os outros encontros desta reserva.'],
  [/Instructor unavailable for proposed meeting|Proposed time is no longer available/i,
    'A nova data não está disponível na agenda do instrutor. Escolha outro horário.'],
  [/Meeting change already decided|Meeting change response deadline expired/i,
    'Esta solicitação já foi respondida ou o prazo de resposta expirou.'],
  [/Only scheduled confirmed meetings may be changed|Meeting no longer eligible for change/i,
    'Apenas aulas agendadas de reservas confirmadas podem ser reagendadas.'],

  [/Meeting day has not arrived/i,
    'Este encontro só pode ser iniciado a partir do dia agendado. Confira a data da aula.'],
  [/Finish the previous meeting first/i,
    'Conclua e registre o encontro anterior antes de iniciar o próximo.'],
  [/Select valid kite skills for the minutes taught/i,
    'Marque pelo menos uma etapa do kite para registrar uma aula com minutos realizados.'],

  [/Instructor has a class or block at (?:the|a) selected time/i,
    'Um ou mais encontros estão fora da disponibilidade do instrutor, bloqueados ou com conflito de outra reserva. Confira todas as datas e horários na agenda; nenhuma reserva foi criada.'],
  [/Demo meetings cannot overlap each other/i,
    'Os encontros desta reserva de teste não podem acontecer em horários sobrepostos. Ajuste as datas ou a duração. Nenhuma reserva foi criada.'],
  [/A started test must be completed before cleanup/i,
    'Essa aula de teste já foi iniciada. Termine o registro da aula antes de encerrá-la.'],

  [/Partner profile must be completed before approval/i,
    'A pousada ainda precisa preencher responsável, telefone, cidade e endereço antes da aprovação.'],
  [/Approved establishment identity requires admin review/i,
    'Nome e praia de uma pousada já aprovada só podem ser alterados após análise da administração.'],
  [/Instructor documents must be approved before activation/i,
    'Antes de aprovar, confira e aprove a identidade e a certificação profissional do instrutor em Admin > Documentos.'],
  [/Unknown or inactive beach/i, 'Essa praia não está disponível. Escolha outra.'],
  [/Could not find the function .*create_booking|function .*create_booking.* does not exist/i,
    'O serviço de reservas precisa ser sincronizado com o banco de dados. Informe à administração.'],
  [/Beach name must have/i, 'O nome da praia precisa ter de 2 a 60 letras.'],
  [/duplicate key.*beaches_name/i, 'Já existe uma praia com esse nome.'],
  [/No instructor available/i, 'Nenhum instrutor disponível nesses horários. Tente outro dia ou horário (ou sem transporte de apoio).'],
  [/Support vehicle not available/i, 'O transporte de apoio não está disponível no momento.'],
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

export function friendlyError(
  error: { message?: string; code?: string; hint?: string; details?: string } | null | undefined,
): string {
  const message = error?.message ?? '';
  for (const [pattern, text] of KNOWN) if (pattern.test(message)) return text;

  // PostgREST reports PGRST202/203 when an RPC signature is missing or
  // ambiguous. These usually mean the published app and SQL migrations differ.
  if (error?.code === 'PGRST202' || error?.code === 'PGRST203' || error?.code === '42883') {
    return 'A função necessária no Supabase não está disponível ou está desatualizada. Avise a administração para verificar as migrações.';
  }
  if (error?.code === '42501') return 'Você não tem permissão para esta operação. Entre novamente ou contate a administração.';
  if (error?.hint === 'NO_INSTRUCTOR') {
    return 'Nenhum instrutor disponível para essa praia e horário. Escolha outro horário ou tente outra praia.';
  }

  console.error('Unexpected Supabase error:', {
    code: error?.code ?? 'unknown',
    message,
    hint: error?.hint,
    details: error?.details,
  });
  // Error identifiers are operational codes, not database details. Displaying
  // only this small sanitized code helps support find the Render log.
  const code = error?.code?.match(/^[A-Za-z0-9]{4,12}$/)?.[0];
  return code
    ? `Não foi possível concluir agora (código ${code}). Tente novamente ou informe à administração.`
    : 'Não foi possível concluir agora. Tente novamente.';
}

export interface ActionState {
  error?: string;
  ok?: string;
}
