import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type MigrationWatermark = {
  snoozes: boolean;
  attempt_id: boolean;
  investments_updated_at: boolean;
  note_user_templates: boolean;
  report_filters: boolean;
  plan_code: boolean;
  bill_reminder_channel: boolean;
  billing_catalog: boolean;
};

export async function checkDatabase(q: Queryable = DB): Promise<void> {
  await q.query("SELECT 1");
}

export async function getMigrationWatermark(
  q: Queryable = DB
): Promise<MigrationWatermark> {
  const result = await q.query<MigrationWatermark>(
    `SELECT to_regclass('subscription_snoozes') IS NOT NULL AS snoozes,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'subscription_snoozes' AND column_name = 'attempt_id') AS attempt_id,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'investments' AND column_name = 'updated_at') AS investments_updated_at,
            to_regclass('note_user_templates') IS NOT NULL AS note_user_templates,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'user_settings' AND column_name = 'report_filters') AS report_filters,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'user_settings' AND column_name = 'plan_code') AS plan_code,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'bill_reminders' AND column_name = 'channel') AND
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'bill_reminders' AND column_name = 'is_enabled') AS bill_reminder_channel,
            to_regclass('plan_entitlements') IS NOT NULL AS billing_catalog`
  );
  return result.rows[0];
}
