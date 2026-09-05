// Runs against an isolated schema in a rollback-only transaction. No user data changes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Pool } = require('pg');
process.loadEnvFile('.env.local');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await pool.connect();
let checks = 0;
async function rejects(sql, values, constraint) {
  await c.query('SAVEPOINT expected_failure');
  let error;
  try { await c.query(sql, values); } catch (e) { error = e; }
  await c.query('ROLLBACK TO SAVEPOINT expected_failure');
  assert.ok(error, 'Expected write to be denied');
  if (constraint === 'users_legacy_member_unique') assert.equal(error.code, '23505');
  else if (constraint) assert.equal(error.constraint, constraint);
  checks++;
}
try {
  await c.query('BEGIN');
  await c.query('CREATE SCHEMA membership_verification');
  await c.query('SET LOCAL search_path = membership_verification, public');
  for (const table of ['users','user_settings','accounts','budgets','bills','subscriptions','goals','subscription_audits']) {
    await c.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }
  const sql = await readFile(new URL('./migrations/001_membership.sql', import.meta.url), 'utf8');
  await c.query(sql);
  await c.query(sql); checks++; // migration is rerunnable
  const user = (await c.query("INSERT INTO users (email, hashed_password) VALUES ('membership@test.invalid','test') RETURNING user_id")).rows[0].user_id;
  for (let i=0; i<2; i++) await c.query("INSERT INTO accounts (user_id,name,type) VALUES ($1,'Test','cash')", [user]);
  await rejects("INSERT INTO accounts (user_id,name,type) VALUES ($1,'Overflow','cash')", [user], 'starter_plan_limit');
  const inactive = (await c.query("INSERT INTO accounts (user_id,name,type,is_active) VALUES ($1,'Inactive','cash',0) RETURNING id", [user])).rows[0].id;
  await rejects("UPDATE accounts SET is_active = 1 WHERE id = $1", [inactive], 'starter_plan_limit');
  for (let i=0; i<5; i++) await c.query("INSERT INTO bills (user_id,name) VALUES ($1,'Test')", [user]);
  await rejects("INSERT INTO bills (user_id,name) VALUES ($1,'Overflow')", [user], 'starter_plan_limit');
  for (let i=0; i<3; i++) await c.query("INSERT INTO subscriptions (user_id,service_name,amount,frequency,next_renewal_date) VALUES ($1,'Test',100,'monthly',CURRENT_DATE)", [user]);
  await rejects("INSERT INTO subscriptions (user_id,service_name,amount,frequency,next_renewal_date) VALUES ($1,'Overflow',100,'monthly',CURRENT_DATE)", [user], 'starter_plan_limit');
  await c.query("INSERT INTO goals (user_id,name,target,status) VALUES ($1,'Test',100,'active')", [user]);
  await rejects("INSERT INTO goals (user_id,name,target,status) VALUES ($1,'Overflow',100,'active')", [user], 'starter_plan_limit');
  const paused = (await c.query("INSERT INTO goals (user_id,name,target,status) VALUES ($1,'Paused',100,'paused') RETURNING id", [user])).rows[0].id;
  await rejects("UPDATE goals SET status='active' WHERE id=$1", [paused], 'starter_plan_limit');
  const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
  for (let i=0; i<2; i++) await c.query("INSERT INTO budgets (user_id,category_id,amount,month,year) VALUES ($1,$2,100,1,2026)", [user,ids[i]]);
  await c.query("INSERT INTO budgets (user_id,category_id,amount,month,year) VALUES ($1,$2,100,2,2026)", [user,ids[0]]); checks++;
  await rejects("INSERT INTO budgets (user_id,category_id,amount,month,year) VALUES ($1,$2,100,1,2026)", [user,ids[2]], 'starter_plan_limit');
  for (const cycle of ['monthly','annual','lifetime']) {
    await c.query("UPDATE users SET plan_type='premium', billing_cycle=$2, premium_expires_at=$3, legacy_member_number=$4 WHERE user_id=$1", [user,cycle,cycle === 'lifetime' ? null : new Date('2030-01-01'),cycle === 'lifetime' ? 1 : null]);
    await c.query("INSERT INTO accounts (user_id,name,type) VALUES ($1,'Premium','cash')", [user]);
    await c.query("INSERT INTO goals (user_id,name,target,status) VALUES ($1,'Premium',100,'active')", [user]); checks++;
  }
  await rejects("UPDATE users SET legacy_member_number=1001 WHERE user_id=$1", [user], 'users_membership_valid');
  await rejects("INSERT INTO users (email,hashed_password,plan_type,billing_cycle,legacy_member_number) VALUES ('duplicate@test.invalid','x','premium','lifetime',1)", [], 'users_legacy_member_unique');
  await c.query("UPDATE subscriptions SET amount=150 WHERE user_id=$1", [user]);
  assert.equal(Number((await c.query("SELECT count(*) FROM subscription_audits WHERE audit_type='price_change'")).rows[0].count),3); checks++;
  console.log(`${checks} membership database checks passed; transaction rolled back.`);
} finally { await c.query('ROLLBACK'); c.release(); await pool.end(); }
