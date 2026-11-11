'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';

/**
 * Photo when available, current initials/icon when absent or broken.
 * The URL is a temporary signed link produced server-side for the admin.
 */
export function AdminProfilePhoto({
  src,
  name,
  initials,
  kind = 'instructor',
  size = 64,
}: {
  src?: string | null;
  name: string;
  initials: string;
  kind?: 'instructor' | 'partner';
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(src && failedUrl !== src);
  const fallback = kind === 'partner'
    ? 'bg-brand-soft text-brand'
    : 'vk-photo-fallback text-white';

  return (
    <span
      className={'relative grid shrink-0 place-items-center overflow-hidden rounded-[14px] font-bold ' + fallback}
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      role="img"
      aria-label={kind === 'partner' ? 'Foto da pousada ' + name : 'Foto do instrutor ' + name}
    >
      {kind === 'partner' ? <Icon name="home" className="!h-7 !w-7" /> : initials}
      {showImage ? (
        <img
          key={src}
          src={src ?? undefined}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedUrl(src ?? null)}
        />
      ) : null}
    </span>
  );
}
