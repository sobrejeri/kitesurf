import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LessonLevel } from '@/lib/data-labels';

export interface StudentKiteLevel {
  reported: LessonLevel;
  assessed: LessonLevel | null;
  effective: LessonLevel;
  assessedAt: string | null;
  ready: boolean;
}
const known = new Set(['first_time','returning','improving']);

export async function getStudentKiteLevel(studentId: string): Promise<StudentKiteLevel> {
  const fallback: StudentKiteLevel = {
    reported: 'first_time', assessed: null, effective: 'first_time',
    assessedAt: null, ready: false,
  };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.from('profiles')
      .select('self_reported_kite_level, assessed_kite_level, kite_assessed_at')
      .eq('id', studentId).maybeSingle<{
        self_reported_kite_level: LessonLevel;
        assessed_kite_level: LessonLevel | null;
        kite_assessed_at: string | null;
      }>();
    if (error || !data || !known.has(data.self_reported_kite_level)) {
      if (error) console.warn('[student.kite-level]', { code: error.code });
      return fallback;
    }
    const assessed = data.assessed_kite_level && known.has(data.assessed_kite_level)
      ? data.assessed_kite_level : null;
    return {
      reported: data.self_reported_kite_level,
      assessed,
      effective: assessed ?? data.self_reported_kite_level,
      assessedAt: data.kite_assessed_at,
      ready: true,
    };
  } catch {
    return fallback;
  }
}
