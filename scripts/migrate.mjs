import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Pool } = require('pg');
for (const path of process.argv.includes('--neon') ? ['../.env.neon.local', '../.env.local'] : ['../ui/.env.local', '../.env.local', '../.env']) {
  try { process.loadEnvFile(fileURLToPath(new URL(path, import.meta.url))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.argv.includes('--neon') ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL });
const client = await pool.connect();
const MIGRATIONS = ['./migrations/001_membership.sql', './migrations/002_billing_catalog.sql', './migrations/003_report_filters.sql', './migrations/004_subscription_snoozes.sql', './migrations/005_investments_updated_at.sql', './migrations/006_snooze_attempt_id.sql', './migrations/007_note_user_templates.sql', './migrations/008_bill_reminders_channel.sql', './migrations/009_plan_code_and_manifest.sql', './migrations/010_perf_indexes.sql', './migrations/011_schema_parity.sql'];
try {
  // Manifest table first so every run is recorded; all migration files are
  // idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING), so re-running on
  // DBs migrated by older scripts is safe and self-heals drift (003, 009).
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  for (const file of MIGRATIONS) {
    await client.query('BEGIN');
    try {
      await client.query(await readFile(new URL(file, import.meta.url), 'utf8'));
      await client.query(`INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
      await client.query('COMMIT');
      console.log(`Applied ${file}`);
    } catch (e) { await client.query('ROLLBACK'); throw e; }
  }
  console.log('Membership migration applied. Existing records preserved.');
} finally { client.release(); await pool.end(); }
