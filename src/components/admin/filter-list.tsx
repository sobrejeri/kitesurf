'use client';

import { useState } from 'react';

import { Icon } from '../icon';

export interface FilterEntry {
  key: string;
  /** Chip ids this entry belongs to ("all" is implied). */
  groups: readonly string[];
  /** Lower-cased text the search box matches against. */
  text: string;
  node: React.ReactNode;
}

/**
 * Search box, filter chips with counts, and the list they filter. The rows
 * are rendered on the server and only shown or hidden here.
 */
export function FilterList({
  chips,
  entries,
  placeholder,
  empty,
}: {
  chips: readonly { id: string; label: string }[];
  entries: readonly FilterEntry[];
  placeholder: string;
  empty: string;
}) {
  const [chip, setChip] = useState('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = entries.filter((entry) => (chip === 'all' || entry.groups.includes(chip)) && (!q || entry.text.includes(q)));
  const count = (id: string) => (id === 'all' ? entries.length : entries.filter((entry) => entry.groups.includes(id)).length);

  return (
    <>
      <label className="flex h-12 items-center gap-3 rounded-[12px] border border-line-input bg-surface px-4 shadow-card focus-within:border-brand-focus focus-within:shadow-focus md:h-11">
        <Icon name="search" className="!h-5 !w-5 text-muted" />
        <span className="sr-only">{placeholder}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none md:text-[14px]"
        />
      </label>
      <div role="tablist" aria-label="Filtros" className="snap-rail -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {[{ id: 'all', label: 'Todos' }, ...chips].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={chip === item.id}
            onClick={() => setChip(item.id)}
            className={`press shrink-0 rounded-full border px-4 py-2 text-[13px] ${chip === item.id ? 'btn-primary border-transparent !text-[13px] font-semibold text-white' : 'border-line bg-surface font-medium text-label hover:border-line-ghost hover:text-ink'}`}
          >
            {item.label} ({count(item.id)})
          </button>
        ))}
      </div>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((entry) => (
          <li key={entry.key}>{entry.node}</li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="mt-6 text-center text-[13px] text-muted">{empty}</p> : null}
    </>
  );
}
