import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type AdminAvatarKind = 'instructor' | 'partner';
type AvatarRow = { user_id: string; avatar_path: string };
const rpcByKind = {
  instructor: 'get_admin_instructor_avatar_paths',
  partner: 'get_admin_partner_avatar_paths',
} as const;
const bucketByKind = {
  instructor: 'vento-instructor-avatars',
  partner: 'vento-partner-avatars',
} as const;

function isAvatarRow(value: unknown): value is AvatarRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.user_id === 'string' && typeof row.avatar_path === 'string';
}

/**
 * Admin-only: read just avatar paths through a restricted RPC, then sign the
 * private objects for short-lived display. No private contact or payout fields
 * ever enter the returned map or the rendered page.
 *
 * If migration 23 or a given image is unavailable, keep the list usable:
 * clients fall back to initials/icons, and never expose a public Storage URL.
 */
export async function getAdminAvatarUrls(kind: AdminAvatarKind): Promise<Map<string, string>> {
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc(rpcByKind[kind]);
    if (error) {
      console.warn('[admin.avatars.paths]', { kind, code: error.code });
      return new Map();
    }

    const paths = Array.isArray(data) ? data.filter(isAvatarRow) : [];
    const signed = await Promise.all(paths.map(async ({ user_id, avatar_path }) => {
      try {
        const { data: image, error: imageError } = await db.storage
          .from(bucketByKind[kind]).createSignedUrl(avatar_path, 3600);
        if (imageError || !image?.signedUrl) {
          console.warn('[admin.avatars.signed-url]', { kind, code: imageError?.statusCode });
          return null;
        }
        return [user_id, image.signedUrl] as [string, string];
      } catch (cause) {
        console.warn('[admin.avatars.storage-unavailable]', { kind, cause });
        return null;
      }
    }));

    return new Map(signed.filter((item): item is [string, string] => item !== null));
  } catch (cause) {
    // Avatar loading is optional: an outage must never block the admin queue.
    console.warn('[admin.avatars.unavailable]', { kind, cause });
    return new Map();
  }
}
