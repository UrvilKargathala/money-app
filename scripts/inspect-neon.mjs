import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Pool } = require('pg');
process.loadEnvFile('.env.neon.local');
const pool = new Pool({ connectionString: process.env.DIRECT_DATABASE_URL });
try {
  const result = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  console.log(JSON.stringify({ tables: result.rows.map(r => r.tablename) }));
  if (result.rows.some(r => r.tablename === 'users')) {
    const columns = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'");
    const counts = await pool.query("SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM transactions)::int AS transactions, EXISTS(SELECT 1 FROM users WHERE email = 'demo@moneymind.local') AS demo_account");
    const users = await pool.query("SELECT user_id, email, plan_type, billing_cycle, premium_expires_at FROM users ORDER BY user_id");
    console.log(JSON.stringify({ users: users.rows }));
    console.log(JSON.stringify({ user_columns: columns.rows, counts: counts.rows[0] }));
  }
} finally { await pool.end(); }
