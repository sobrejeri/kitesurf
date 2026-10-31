'use client';

import { useState } from 'react';

import { Icon } from '@/components/icon';

export interface MultiChoice {
  label: string;
  value: string;
}

/** Compact expandable multi-select: native checkboxes, real FormData values. */
export function InstructorMultiSelect({
  label, name, options, initialValues, emptyText,
}: {
  label: string;
  name: string;
  options: readonly MultiChoice[];
  initialValues: string[];
  emptyText: string;
}) {
  const [selected, setSelected] = useState<string[]>(initialValues);
  const [open, setOpen] = useState(false);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[12px] font-semibold text-label">{label}</legend>
      <div className="rounded-[16px] border border-line-input bg-surface">
        <button
          type="button"
          aria-expanded={open}
          aria-label={label + ' — selecionar opções'}
          onClick={() => setOpen((previous) => !previous)}
          className="press flex min-h-12 w-full items-center justify-between gap-2 px-3.5 py-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
            {selected.length === 0 ? emptyText :
              options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(', ')}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11px] text-brand">
            {selected.length > 0 ? selected.length + ' selecionado(s)' : 'Escolher'}
            <Icon name="chevronDown" className={'!h-4 !w-4 transition-transform ' + (open ? 'rotate-180' : '')} />
          </span>
        </button>
        {open ? (
          <div className="max-h-60 overflow-y-auto border-t border-line px-2 py-2">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">Nenhuma opção cadastrada pela administração.</p>
            ) : options.map((option) => (
              <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2 text-[14px] text-ink hover:bg-brand-wash">
                <input
                  name={name}
                  type="checkbox"
                  value={option.value}
                  checked={selected.includes(option.value)}
                  onChange={(e) => {
                    setSelected((values) => e.target.checked
                      ? [...values, option.value]
                      : values.filter((value) => value !== option.value));
                  }}
                  className="h-[18px] w-[18px] accent-brand"
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : selected.map((value) => (
          <input type="hidden" key={value} name={name} value={value} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Você pode selecionar mais de uma opção.</p>
    </fieldset>
  );
}
