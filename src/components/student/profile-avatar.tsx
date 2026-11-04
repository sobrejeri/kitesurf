'use client';

import { useState } from 'react';

/** A failed or expired private photo leaves a readable fallback in the same circle. */
export function StudentProfileAvatar({ name, initials, photoUrl }: {
  name: string;
  initials: string;
  photoUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-sand text-[13px] font-bold text-ink">
      <span aria-hidden="true">{initials}</span>
      {photoUrl && failedUrl !== photoUrl ? (
        <img src={photoUrl} alt={`Foto de ${name}`} width={40} height={40}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedUrl(photoUrl)} />
      ) : null}
    </span>
  );
}
