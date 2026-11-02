'use client';

import { updateMyKiteLevel } from '@/app/actions/student';
import { ActionForm } from '@/components/action-form';
import { type LessonLevel } from '@/lib/data-labels';
import { KITE_LEVEL_BADGES } from '@/lib/kite-steps';
import { inputClass } from '@/components/ui';

export function KiteLevelEditor({ reported, assessed, ready }: {
  reported: LessonLevel;
  assessed: LessonLevel | null;
  ready: boolean;
}) {
  return (
    <div className="mt-4 rounded-[16px] border border-line bg-sand/50 p-3">
      <p className="text-[12px] font-bold text-ink">Meu nível no kitesurf</p>
      <p className="mt-1 text-[12px] text-muted">
        {assessed
          ? 'O nível exibido nas reservas foi avaliado pelo seu instrutor. Você ainda pode atualizar sua autoavaliação.'
          : 'Seu selo atual é baseado no nível que você informou. O instrutor poderá avaliá-lo após a aula.'}
      </p>
      <p className="mt-2 text-[12px] text-label">
        Nível usado nas recomendações: {KITE_LEVEL_BADGES[assessed ?? reported].label}
      </p>
      {ready ? (
        <ActionForm action={updateMyKiteLevel} submitLabel="Salvar meu nível" className="mt-3 grid gap-3">
          <label className="text-[12px] text-label">
            Nível informado por você
            <select name="kiteLevel" defaultValue={reported} required className={'mt-1 '+inputClass}>
              <option value="first_time">Iniciante · Bronze</option>
              <option value="returning">Intermediário · Prata</option>
              <option value="improving">Avançado · Ouro</option>
            </select>
          </label>
        </ActionForm>
      ) : (
        <p className="mt-2 text-[12px] text-warning">
          A atualização do nível ficará disponível após a Migration 27.
        </p>
      )}
    </div>
  );
}
