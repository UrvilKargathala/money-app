import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export type MigrationWatermark = {
  snoozes: boolean;
  attempt_id: boolean;
  investments_updated_at: boolean;
  note_user_templates: boolean;
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
            to_regclass('note_user_templates') IS NOT NULL AS note_user_templates`
  );
  return result.rows[0];
}
