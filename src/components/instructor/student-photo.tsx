'use client';

import { useState } from 'react';
import { Avatar } from '@/components/ui';
import { initials } from '@/lib/people';

export function InstructorStudentPhoto({
  url, name, size = 48,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      role="img"
      aria-label={'Foto do aluno ' + name}
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-brand-focus bg-sand"
      style={{ height: size, width: size }}
    >
      <Avatar initials={initials(name)} tone="a3" size={size - 4} />
      {url && url !== failed ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(url)}
        />
      ) : null}
    </span>
  );
}
