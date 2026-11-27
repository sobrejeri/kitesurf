import { requireUniqueTarget, requireUuid } from './unique-target.mjs';
import { meetingForBooking } from './booking-targets.mjs';

export function blocked(message) {
  return Object.assign(new Error(message), { code: 'E2E_BLOCKED' });
}
const stages = ['first-recorded', 'second-start-attempted', 'second-started', 'second-record-attempted', 'complete'];
export function validateCheckpoint(raw, base) {
  const keys = ['version','baseOrigin','bookingId','meetingIds','secondStartsAt','firstDoneMinutes','secondDoneMinutes','stage'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).sort().join() !== keys.sort().join()
    || raw.version !== 1 || !stages.includes(raw.stage)) throw blocked('checkpoint inválido');
  const origin = new URL(base).origin;
  if (raw.baseOrigin !== origin) throw blocked('checkpoint pertence a outro ambiente');
  requireUuid(raw.bookingId, 'reserva do checkpoint');
  if (!raw.meetingIds || Object.keys(raw.meetingIds).sort().join() !== '1,2') throw blocked('checkpoint exige dois encontros');
  const ids = [1,2].map((position) => requireUuid(raw.meetingIds[position], 'encontro do checkpoint'));
  if (ids[0] === ids[1]) throw blocked('checkpoint repete o mesmo encontro');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?-03:00$/.test(raw.secondStartsAt)
    || !Number.isFinite(Date.parse(raw.secondStartsAt))) throw blocked('data do segundo encontro inválida');
  for (const key of ['firstDoneMinutes','secondDoneMinutes']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] < 1 || raw[key] > 120) throw blocked('minutos fora do encontro contratado');
  }
  return { ...raw, meetingIds: { ...raw.meetingIds } };
}
export function finalBalance(first, second) {
  for (const value of [first,second]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 120) throw blocked('minutos inválidos');
  }
  return { done: first+second, scheduled: 0, available: 240-first-second };
}
function validateObserved(observed, checkpoint) {
  if (observed.bookingId !== checkpoint.bookingId || observed.first.id !== checkpoint.meetingIds[1]
    || observed.second.id !== checkpoint.meetingIds[2]) throw blocked('identidade observada diverge do checkpoint');
  if (observed.first.status !== 'done' || observed.first.doneMinutes !== checkpoint.firstDoneMinutes) {
    throw blocked('primeiro encontro não comprova o registro esperado');
  }
  if (!['scheduled','in_progress','done'].includes(observed.second.status)) throw blocked('estado do segundo encontro inválido');
  if (observed.second.status === 'done' && observed.second.doneMinutes !== checkpoint.secondDoneMinutes) {
    throw blocked('minutos do segundo encontro divergem do checkpoint');
  }
  return observed;
}

/** Pure protocol with injected browser adapter. Persist intent BEFORE each click.
 * An ambiguous previous record attempt is read-only until the outcome is known.
 * The scheduled date never changes; both the local window and the app's own
 * start form must allow starting the exact second meeting.
 */
export async function continueSecondMeeting({
  checkpoint: raw, base, inspect, start, record, persist, now = Date.now, stopAfterStart = false,
}) {
  let checkpoint = validateCheckpoint(raw, base);
  if (typeof persist !== 'function') throw blocked('retomada exige persistência do checkpoint antes de gravar');
  const save = async (stage) => {
    const updated = { ...checkpoint, stage };
    await persist(updated);
    checkpoint = updated;
  };
  const read = async () => validateObserved(await inspect(), checkpoint);
  let observed = await read();
  if (observed.second.status === 'done') {
    await save('complete'); return checkpoint;
  }
  if (checkpoint.stage === 'complete') throw blocked('checkpoint concluído diverge do estado atual');
  if (observed.second.status === 'scheduled') {
    if (checkpoint.stage !== 'first-recorded') throw blocked('resultado do início anterior desconhecido; não repetir');
    if (Date.parse(checkpoint.secondStartsAt) > now()+24*3600_000 || !observed.second.canStart) {
      throw blocked('segundo encontro fora da janela autorizada; retome este checkpoint na data permitida');
    }
    await save('second-start-attempted');
    await start();
    observed = await read();
    if (observed.second.status === 'scheduled') throw blocked('início ainda não comprovado; não repetir');
  }
  if (observed.second.status === 'done') {
    await save('complete'); return checkpoint;
  }
  if (checkpoint.stage === 'second-record-attempted') {
    throw blocked('resultado do registro anterior desconhecido; não repetir');
  }
  await save('second-started');
  if (stopAfterStart) return checkpoint;
  await save('second-record-attempted');
  await record(checkpoint.secondDoneMinutes);
  observed = await read();
  if (observed.second.status !== 'done') throw blocked('registro ainda não comprovado; retome somente para conferir o mesmo encontro');
  await save('complete');
  return checkpoint;
}

const parseMinutes = (text) => {
  const match = /^\s*(?:(\d+)h)?\s*(?:(\d+)min)?\s*$/.exec(text);
  if (!match || (!match[1] && !match[2])) throw blocked('tempo realizado não reconhecido');
  return Number(match[1] ?? 0)*60+Number(match[2] ?? 0);
};
export function secondMeetingBrowserAdapter({ page, base, checkpoint, code }) {
  const open = async (position, tab) => {
    const id = checkpoint.meetingIds[position];
    await page.goto(base+'/instrutor/aula?aba='+tab+'&aula='+id, { waitUntil: 'networkidle' });
    const candidates = page.locator('[data-booking-id="'+checkpoint.bookingId+'"][data-meeting-position="'+position+'"]');
    if (await candidates.count() === 0) return null;
    const card = await meetingForBooking(page, checkpoint.bookingId, position);
    if (await card.getAttribute('id') !== 'aula-'+id) throw blocked('encontro da tela não corresponde ao checkpoint');
    return card;
  };
  const completedMinutes = async (card) => {
    const label = await requireUniqueTarget(card.getByText('Tempo realizado', { exact: true }), 'tempo realizado do encontro');
    const value = await requireUniqueTarget(label.locator('..').locator('strong'), 'minutos registrados');
    return parseMinutes(await value.innerText());
  };
  return {
    inspect: async () => {
      const first = await open(1, 'concluidas');
      if (!first) throw blocked('primeiro encontro do checkpoint não aparece no histórico autorizado');
      const firstMinutes = await completedMinutes(first);
      for (const [tab,status] of [['concluidas','done'],['andamento','in_progress'],['proximas','scheduled']]) {
        const second = await open(2,tab);
        if (!second) continue;
        return { bookingId: checkpoint.bookingId,
          first: { id: checkpoint.meetingIds[1], status: 'done', doneMinutes: firstMinutes },
          second: { id: checkpoint.meetingIds[2], status,
            doneMinutes: status === 'done' ? await completedMinutes(second) : null,
            canStart: status === 'scheduled' && await second.locator('form:has(input[name="presenceCode"]) input[name="meetingId"]').count() === 1,
          },
        };
      }
      throw blocked('segundo encontro do checkpoint não aparece nas abas autorizadas');
    },
    start: async () => {
      const card = await open(2, 'proximas');
      if (!card) throw blocked('segundo encontro agendado ausente');
      const id = await requireUniqueTarget(card.locator('form:has(input[name="presenceCode"]) input[name="meetingId"]'), 'formulário de início');
      if (await id.inputValue() !== checkpoint.meetingIds[2]) throw blocked('formulário de início aponta para outro encontro');
      if (!/^\d{4}$/.test(code)) throw blocked('código de presença inválido');
      await (await requireUniqueTarget(card.locator('input[name="presenceCode"]'), 'presença do segundo encontro')).fill(code);
      const button = await requireUniqueTarget(card.getByRole('button', { name: 'Confirmar presença e iniciar', exact: true }), 'iniciar segundo encontro');
      await button.click();
      // Give this form's response time to settle before the read-only reload.
      // Disappearance is synchronization only; inspect() must prove the state.
      await button.waitFor({state:'detached',timeout:20_000}).catch(()=>{});
    },
    record: async (doneMinutes) => {
      const card = await open(2, 'andamento');
      if (!card) throw blocked('segundo encontro em andamento ausente');
      const id = await requireUniqueTarget(card.locator('form:has(input[name="doneMinutes"]) input[name="meetingId"]'), 'formulário de registro');
      if (await id.inputValue() !== checkpoint.meetingIds[2]) throw blocked('formulário de registro aponta para outro encontro');
      await (await requireUniqueTarget(card.locator('input[name="doneMinutes"]'), 'minutos do segundo encontro')).fill(String(doneMinutes));
      await (await requireUniqueTarget(card.locator('input[type="radio"][name="step1"][value="mastered"]'), 'etapa 1 do segundo encontro')).check();
      await (await requireUniqueTarget(card.locator('input[type="radio"][name="step2"][value="practiced"]'), 'etapa 2 do segundo encontro')).check();
      const button = await requireUniqueTarget(card.getByRole('button', { name: 'Concluir e registrar encontro', exact: true }), 'registrar segundo encontro');
      await button.click();
      await button.waitFor({state:'detached',timeout:20_000}).catch(()=>{});
    },
  };
}
