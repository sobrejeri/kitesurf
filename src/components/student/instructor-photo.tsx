'use client';

import { useState } from 'react';

import { Avatar } from '@/components/ui';
import { initials } from '@/lib/people';

/** Real, private instructor photo with a visible fallback if it fails to load. */
export function StudentInstructorPhoto({
  name,
  url,
  size = 56,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      style={{ height: size, width: size }}
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#24bbd1] bg-[#084963] ring-2 ring-[#0bc5dd]/10"
      role="img"
      aria-label={url && failedUrl !== url ? 'Foto do instrutor ' + name : 'Perfil do instrutor ' + name}
    >
      <Avatar initials={initials(name)} tone="a3" size={size - 2} />
      {url && failedUrl !== url ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedUrl(url)}
        />
      ) : null}
    </span>
  );
}
