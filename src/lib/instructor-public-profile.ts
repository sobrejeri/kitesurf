export type InstructorPublicProfile = {
  id: string;
  name: string;
  years_experience: number;
  languages: string[];
  beaches: string[];
  bio: string;
  rating_count: number;
  rating_avg: number | null;
  reviews: { stars: number; comment: string; created_at: string }[];
};

/** Narrow the RPC result so a malformed payload can never crash or leak into the page. */
export function parseInstructorPublicProfile(value: unknown): InstructorPublicProfile | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.name !== 'string') return null;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const reviews = Array.isArray(v.reviews)
    ? v.reviews.flatMap((r) => {
        const o = r as Record<string, unknown>;
        return typeof o?.stars === 'number' && typeof o.comment === 'string' && typeof o.created_at === 'string'
          ? [{ stars: Math.min(5, Math.max(1, Math.round(o.stars))), comment: o.comment, created_at: o.created_at }]
          : [];
      })
    : [];
  return {
    id: v.id,
    name: v.name,
    years_experience: typeof v.years_experience === 'number' ? v.years_experience : 0,
    languages: strings(v.languages),
    beaches: strings(v.beaches),
    bio: typeof v.bio === 'string' ? v.bio : '',
    rating_count: typeof v.rating_count === 'number' ? v.rating_count : 0,
    rating_avg: typeof v.rating_avg === 'number' ? v.rating_avg : null,
    reviews,
  };
}
