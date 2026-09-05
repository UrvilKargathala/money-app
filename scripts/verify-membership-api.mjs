import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Pool } = require('pg');
process.loadEnvFile('.env.local');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const token = randomBytes(32).toString('hex');
const email = `membership-check-${randomBytes(8).toString('hex')}@test.invalid`;
let userId; let checks = 0;
async function call(path, expected, method='GET', body) {
  const r = await fetch(`http://localhost:3016/api${path}`, { method, headers: { cookie: `mm_session=${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0,150)}`); checks++; return data;
}
try {
  userId = (await pool.query("INSERT INTO users (email,hashed_password) VALUES ($1,'verification-only') RETURNING user_id", [email])).rows[0].user_id;
  await pool.query("INSERT INTO user_profiles (user_id,full_name) VALUES ($1,'Membership verification')", [userId]);
  await pool.query("INSERT INTO user_settings (user_id) VALUES ($1)", [userId]);
  await pool.query("INSERT INTO auth_tokens (user_id,token_hash,token_type,expires_at) VALUES ($1,$2,'session',CURRENT_TIMESTAMP + INTERVAL '10 minutes')", [userId,createHash('sha256').update(token).digest('hex')]);
  assert.equal((await call('/users/me/plan',200)).plan.plan_type,'free');
  const freeChecks = await Promise.allSettled(['/investments','/debts','/tax/sections','/subscriptions/audits','/export/jobs','/reports/forecast','/net-worth/trend','/sips','/dividends'].map(path => call(path,403)));
  for (const check of freeChecks) if (check.status === 'rejected') throw check.reason;
  await call('/users/me/settings',403,'PATCH',{widget_layout:['bills-due']});
  await call('/notification-preferences',403,'PATCH',{preferences:[{notification_type:'bill_reminder',channel:'email',is_enabled:1}]});
  await call('/accounts/export',200);
  await call('/users/me/data-copy',200);
  const simultaneous = await Promise.all([0,1,2].map(async i => (await fetch('http://localhost:3016/api/accounts', { method:'POST', headers:{cookie:`mm_session=${token}`,'content-type':'application/json'}, body:JSON.stringify({name:`Concurrent ${i}`,type:'cash'}) })).status));
  assert.deepEqual(simultaneous.sort(),[200,200,403]); checks += 3;
  await call('/accounts',403,'POST',{name:'Over limit',type:'cash'});
  const firstAccounts = await call('/accounts',200);
  const accountId = firstAccounts.accounts[0].id;
  for (const cycle of ['monthly','annual','lifetime']) {
    await pool.query("UPDATE users SET plan_type='premium',billing_cycle=$2,premium_expires_at=$3,legacy_member_number=$4 WHERE user_id=$1",[userId,cycle,cycle==='lifetime'?null:new Date('2030-01-01'),cycle==='lifetime'?1000:null]);
    const paidChecks = await Promise.allSettled(['/investments','/debts','/tax/sections','/subscriptions/audits','/reports/forecast','/net-worth/trend'].map(path => call(path,200)));
    for (const check of paidChecks) if (check.status === 'rejected') throw check.reason;
    await call('/users/me/settings',200,'PATCH',{widget_layout:['bills-due','networth-sparkline']});
    await call('/accounts',200,'POST',{name:`Premium ${cycle}`,type:'cash'});
  }
  await call('/subscriptions',200,'POST',{service_name:'Music Plus',amount:1200,frequency:'annual',next_renewal_date:'2027-01-01',account_id:accountId});
  await call('/subscriptions',200,'POST',{service_name:'music-plus',amount:100,frequency:'monthly',next_renewal_date:'2027-01-01',account_id:accountId});
  const subscriptions = (await call('/subscriptions',200)).subscriptions;
  const id = subscriptions[0].id;
  await call(`/subscriptions/${id}/usage`,200,'PATCH',{last_used_at:'2025-01-01'});
  let audits = (await call('/subscriptions/audits',200)).audits;
  assert.ok(audits.some(a=>a.audit_type==='duplicate'));
  assert.ok(audits.some(a=>a.audit_type==='unused'));
  await call(`/subscriptions/audits/${audits[0].id}/dismiss`,200,'POST',{});
  audits = (await call('/subscriptions/audits',200)).audits;
  assert.ok(audits.some(a=>a.is_dismissed===1));
  console.log(`${checks} live API checks passed against the configured database.`);
} finally {
  if (userId) { await pool.query('DELETE FROM users WHERE user_id=$1 AND email=$2',[userId,email]); console.log('Removed only the temporary verification account and its test records.'); }
  await pool.end();
}
