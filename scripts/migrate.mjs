import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Pool } = require('pg');
for (const path of process.argv.includes('--neon') ? ['../.env.neon.local'] : ['../ui/.env.local', '../.env.local', '../.env']) {
  try { process.loadEnvFile(fileURLToPath(new URL(path, import.meta.url))); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.argv.includes('--neon') ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./migrations/001_membership.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Membership migration applied. Existing records preserved.');
} catch (e) { await client.query('ROLLBACK'); throw e; }
finally { client.release(); await pool.end(); }
