/**
 * Cenário prioritário do E2E (fluxo principal #90/#92/#93/#103), com CONTAS FICTÍCIAS e SEM COBRANÇA:
 *   P1 Aluno monta 4 h em 2 encontros de 2 h (dias diferentes) e pede instrutor
 *   P2 Instrutor recebe e aceita a solicitação
 *   P3 Aluno vê a reserva, confirma "sem cobrança" e lê o código de presença
 *   P4 Instrutor inicia o 1º encontro com o código
 *   P5 Instrutor conclui: minutos realizados + etapas (competências)
 *   P6 Aluno vê a evolução e o saldo corretos (realizadas / agendadas / disponíveis)
 * Grava dados (reserva de TESTE, aceite, registro de aula): só roda com E2E_WRITE=sim E E2E_CONFIRM_NO_CHARGE=sim e só com as contas informadas.
 * Nunca abre nenhuma tela de pagamento real: os únicos botões de confirmação usados são "Confirmar aula sem cobrança" e
 * "Confirmar pagamento de teste" (sandbox do próprio app, nenhum dinheiro). Cada passo que falha deixa os seguintes BLOQUEADOS.
 * Datas: o 1º encontro começa 2 h à frente (a regra do app permite iniciar a aula em até 24 h do horário); o 2º, 2 dias depois, às 09:00.
 * Substitua com E2E_M1 / E2E_M2 ("AAAA-MM-DDTHH:MM", horário de Fortaleza) se a agenda do instrutor de teste exigir outros horários.
 * Os seletores vêm do código do app (lesson-builder, lesson-date-picker, aula/page, reserva/[id]); só foram exercitados contra um backend
 * fictício local: a primeira execução no app de teste pode ajustar seletores. FAIL aqui é informação, não homologação.
 */
import { requireUniqueTarget, requireUuid } from './unique-target.mjs';
import { offerForRequest, meetingForBooking, meetingIdsForBooking } from './booking-targets.mjs';
import { acceptOfferOnce, bookingForRequest, presenceCodeForConfirmedBooking } from './accept-offer-once.mjs';

const MONTHS_PT = (year, month) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
const pad = (n) => String(n).padStart(2, '0');
const minutes = (value) => { const h = Math.floor(value / 60); const r = value % 60; return h === 0 ? `${r}min` : r === 0 ? `${h}h` : `${h}h ${r}min`; };

/** "AAAA-MM-DDTHH:MM" em Fortaleza para um instante (UTC-3 fixo). */
export function fortalezaLocal(ms) {
  const d = new Date(ms - 3 * 3600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
/** Primeiro encontro: agora + 2 h arredondado para cima em múltiplos de 30 min; o segundo: dois dias depois, 09:00. */
export function defaultMeetings(nowMs = Date.now(), env = {}) {
  const half = 30 * 60_000;
  const first = env.E2E_M1 ?? fortalezaLocal(Math.ceil((nowMs + 2 * 3600_000) / half) * half);
  const second = env.E2E_M2 ?? `${fortalezaLocal(Date.parse(`${first.slice(0, 10)}T12:00:00-03:00`) + 2 * 86_400_000).slice(0, 10)}T09:00`;
  return { first, second };
}
/** Saldo esperado depois de registrar `done` minutos no 1º encontro de 2 encontros de 120 min (contratado 240). */
export function expectedBalance(done) {
  return { done: minutes(done), scheduled: minutes(120), available: minutes(240 - done - 120) };
}

async function pickDate(page, ariaPrefix, ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  await page.locator(`button[aria-label^="${ariaPrefix}"]`).first().click();
  const dialog = page.getByRole('dialog', { name: 'Escolher a data da aula' });
  await dialog.waitFor({ timeout: 10000 });
  const wanted = MONTHS_PT(year, month).toLowerCase();
  for (let guard = 0; guard < 8; guard += 1) {
    const title = (await dialog.locator('h2').first().innerText()).trim().toLowerCase();
    if (title === wanted) break;
    await dialog.getByRole('button', { name: 'Próximo mês' }).click();
  }
  await dialog.locator('[data-day="true"]:not([disabled])', { hasText: new RegExp(`^${day}$`) }).first().click();
  await dialog.waitFor({ state: 'detached', timeout: 10000 });
}
async function openMeeting(page, number) {
  const header = page.locator('button[aria-expanded]', { hasText: `Encontro ${number}` }).first();
  if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
}
export async function runPriorityScenario({ sessions, browser, BASE, WRITE, env, record, shot }) {
  const ids = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const titles = {
    P1: 'Aluno monta 4 h em 2 encontros e pede instrutor', P2: 'Instrutor recebe e aceita', P3: 'Aluno vê a reserva, confirma sem cobrança e lê o código',
    P4: 'Instrutor inicia o 1º encontro com o código de presença', P5: 'Instrutor registra minutos e competências', P6: 'Aluno vê evolução e saldo corretos',
  };
  const blockAll = (reason) => ids.forEach((id) => record(id, titles[id], 'BLOQUEADO', reason));
  if (!WRITE || env.E2E_CONFIRM_NO_CHARGE !== 'sim') return blockAll('grava dados de TESTE: rode com E2E_WRITE=sim e E2E_CONFIRM_NO_CHARGE=sim, só com contas fictícias');
  if (!sessions.aluno || !sessions.instrutor) return blockAll('precisa das sessões de aluno e instrutor (credenciais fictícias)');

  // A oferta e os formulários de aula ainda são escolhidos pela posição na tela,
  // sem comprovar vínculo com a solicitação/reserva criada. Não criar sequer a
  // solicitação enquanto o fluxo completo não identificar cada item de forma
  // inequívoca. Uma flag de ambiente não deve contornar esta proteção.
  return blockAll('segurança: identificação inequívoca da oferta e dos encontros ainda não implementada; cenário desabilitado antes de qualquer gravação');

  const student = sessions.aluno.page;
  const instructor = sessions.instrutor.page;
  await student.setViewportSize({ width: 1280, height: 900 });
  await instructor.setViewportSize({ width: 1280, height: 900 });
  const { first, second } = defaultMeetings(Date.now(), env);
  const doneMinutes = Number(env.E2E_DONE_MINUTES ?? 120);
  const state = {};
  let broken = null;
  const step = async (id, fn) => {
    if (broken) return record(id, titles[id], 'BLOQUEADO', `passo anterior falhou (${broken})`);
    try { const detail = await fn(); record(id, titles[id], 'PASS', detail ?? ''); }
    catch (error) { broken = id; await shot(id.startsWith('P1') || id === 'P3' || id === 'P6' ? student : instructor, `${id}-falha`); record(id, titles[id], 'FAIL', String(error.message).split('\n')[0].slice(0, 200)); }
  };

  await step('P1', async () => {
    await student.goto(`${BASE}/aluno/reservar?horas=4&dia=${first.slice(0, 10)}`, { waitUntil: 'networkidle' });
    if (env.E2E_BEACH) {
      await student.getByRole('button', { name: 'Editar' }).first().click();
      await student.locator('select').first().selectOption({ label: env.E2E_BEACH });
      await student.getByRole('button', { name: 'Pronto' }).first().click();
    }
    await openMeeting(student, 1);
    await student.locator('input[type="time"]').fill(first.slice(11, 16));
    await student.getByRole('button', { name: 'Adicionar encontro' }).click();   // 4 h viram 3 h + 1 h
    await openMeeting(student, 1);
    await student.locator('select', { has: student.locator('option', { hasText: '1h' }) }).last().selectOption('2');
    await openMeeting(student, 2);
    await student.locator('select', { has: student.locator('option', { hasText: '1h' }) }).last().selectOption('2');
    await pickDate(student, 'Data do encontro 2', second.slice(0, 10));
    await student.locator('input[type="time"]').fill(second.slice(11, 16));
    await student.getByText('Todas as horas definidas').waitFor({ timeout: 10000 });
    await student.getByText('4h de 4h distribuídas').first().waitFor({ timeout: 10000 });
    await shot(student, 'P1-montagem');
    await student.getByRole('button', { name: 'Continuar' }).click();
    await Promise.all([student.waitForURL(/\/aluno\/solicitacao\//, { timeout: 60000 }), student.getByRole('button', { name: 'Confirmar e buscar instrutor' }).click()]);
    state.requestUrl = student.url();
    state.requestId = requireUuid(new URL(state.requestUrl).pathname.split('/').filter(Boolean).at(-1), 'solicitação');
    return state.requestUrl.replace(BASE, '');
  });

  await step('P2', async () => {
    const accepted = await acceptOfferOnce({
      findOffer: async () => {
        await instructor.goto(`${BASE}/instrutor/solicitacao`, { waitUntil: 'networkidle' });
        return offerForRequest(instructor, state.requestId, { allowAbsent: true });
      },
      readAcceptedBooking: async () => {
        await student.goto(state.requestUrl, { waitUntil: 'networkidle' });
        return bookingForRequest(student, BASE, state.requestId);
      },
    });
    state.bookingId = accepted.bookingId;
    state.bookingUrl = accepted.bookingUrl;
    await shot(instructor, 'P2-aceite');
  });

  await step('P3', async () => {
    await student.goto(state.requestUrl, { waitUntil: 'networkidle' });
    const accepted = await bookingForRequest(student, BASE, state.requestId);
    if (!accepted || accepted.bookingId !== state.bookingId) throw new Error('reserva alterada depois do aceite');
    await student.goto(state.bookingUrl, { waitUntil: 'networkidle' });
    const confirm = student.getByRole('button', { name: /^(Confirmar aula sem cobrança|Confirmar pagamento de teste)$/ });
    if (await confirm.count()) {
      await (await requireUniqueTarget(confirm, 'confirmar reserva sem cobrança')).click();
    }
    // Never infer success from toast text or absence of a confirmation button.
    // Reload the bound booking and require its exact persisted status instead.
    await student.goto(state.bookingUrl, { waitUntil: 'networkidle' });
    state.code = await presenceCodeForConfirmedBooking(student);
    await shot(student, 'P3-reserva');
    return 'reserva confirmada e código consistente lido (4 dígitos)';
  });

  await step('P4', async () => {
    await instructor.goto(`${BASE}/instrutor/aula?aba=proximas`, { waitUntil: 'networkidle' });
    state.meetingIds = await meetingIdsForBooking(instructor, state.bookingId);
    let card = await meetingForBooking(instructor, state.bookingId, 1);
    await (await requireUniqueTarget(card.locator('a'), 'abrir encontro')).click();
    card = await meetingForBooking(instructor, state.bookingId, 1);
    const meetingInput = await requireUniqueTarget(card.locator('form:has(input[name="presenceCode"]) input[name="meetingId"]'), 'identificador do encontro');
    state.meetingId = requireUuid(await meetingInput.inputValue(), 'encontro');
    if (state.meetingId !== state.meetingIds[1]) throw new Error('formulário não corresponde ao primeiro encontro identificado');
    await (await requireUniqueTarget(card.locator('input[name="presenceCode"]'), 'código de presença')).fill(state.code);
    await (await requireUniqueTarget(card.getByRole('button', { name: 'Confirmar presença e iniciar' }), 'iniciar encontro')).click();
    await instructor.getByText(/Presença confirmada/).first().waitFor({ timeout: 20000 });
    await shot(instructor, 'P4-inicio');
  });

  await step('P5', async () => {
    await instructor.goto(`${BASE}/instrutor/aula?aba=andamento`, { waitUntil: 'networkidle' });
    let card = await meetingForBooking(instructor, state.bookingId, 1);
    await (await requireUniqueTarget(card.locator('a'), 'abrir encontro em andamento')).click();
    card = await meetingForBooking(instructor, state.bookingId, 1);
    const meetingInput = await requireUniqueTarget(card.locator('form:has(input[name="doneMinutes"]) input[name="meetingId"]'), 'identificador do encontro');
    if (requireUuid(await meetingInput.inputValue(), 'encontro') !== state.meetingId) throw new Error('encontro alterado entre início e registro');
    await (await requireUniqueTarget(card.locator('input[name="doneMinutes"]'), 'minutos')).fill(String(doneMinutes));
    // uma etapa "Praticada" e uma "Concluída" (os rádios step1..step6 existem quando a migration de competências está aplicada)
    const radios = await card.locator('input[type="radio"][name="step1"]').count();
    if (radios === 0) throw new Error('sem os campos de etapas (step1..): migration de competências ausente ou tela diferente');
    await (await requireUniqueTarget(card.locator('input[type="radio"][name="step1"][value="mastered"]'), 'etapa 1')).check();
    await (await requireUniqueTarget(card.locator('input[type="radio"][name="step2"][value="practiced"]'), 'etapa 2')).check();
    await (await requireUniqueTarget(card.getByRole('button', { name: 'Concluir e registrar encontro' }), 'registrar encontro')).click();
    await instructor.getByText(/Encontro registrado|Aula registrada/).first().waitFor({ timeout: 20000 });
    await shot(instructor, 'P5-registro');
  });

  await step('P6', async () => {
    const expected = expectedBalance(doneMinutes);
    await student.goto(state.bookingUrl, { waitUntil: 'networkidle' });
    const text = await student.locator('body').innerText();
    for (const [label, value] of [['realizadas', expected.done], ['agendadas', expected.scheduled], ['disponíveis', expected.available]]) {
      if (!new RegExp(`${value.replace(/\s/g, '\\s')}\\s+${label}`).test(text)) throw new Error(`saldo: esperava "${value} ${label}" na reserva`);
    }
    await shot(student, 'P6-saldo');
    await student.goto(`${BASE}/aluno/evolucao`, { waitUntil: 'networkidle' });
    const evolution = await student.locator('body').innerText();
    if (!/Teoria, equipamento e montagem/.test(evolution)) throw new Error('a evolução não mostra a etapa 1 trabalhada');
    await shot(student, 'P6-evolucao');
    return `saldo ${expected.done} realizadas / ${expected.scheduled} agendadas / ${expected.available} disponíveis`;
  });
}
