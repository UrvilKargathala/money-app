import { query } from "../db";

export type Queryable = { query: typeof query };

export type WidgetSettings = {
  widget_layout: unknown;
  haptics_enabled: number;
  report_filters: unknown;
};

export async function setWidgetLayout(
  q: Queryable,
  userId: number,
  layout: unknown
): Promise<void> {
  await q.query("UPDATE user_settings SET widget_layout = $2::jsonb WHERE user_id = $1", [
    userId,
    JSON.stringify(layout),
  ]);
}

export async function setHapticsEnabled(
  q: Queryable,
  userId: number,
  enabled: unknown
): Promise<void> {
  await q.query("UPDATE user_settings SET haptics_enabled = $2 WHERE user_id = $1", [
    userId,
    enabled ? 1 : 0,
  ]);
}

export async function setReportFilters(
  q: Queryable,
  userId: number,
  filters: unknown
): Promise<void> {
  await q.query("UPDATE user_settings SET report_filters = $2::jsonb WHERE user_id = $1", [
    userId,
    JSON.stringify(filters),
  ]);
}

export async function getWidgetSettings(
  q: Queryable,
  userId: number
): Promise<WidgetSettings | null> {
  const result = await q.query<WidgetSettings>(
    "SELECT widget_layout, haptics_enabled, report_filters FROM user_settings WHERE user_id = $1",
    [userId]
  );
  return result.rows[0] ?? null;
}
