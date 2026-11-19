// Q6: the pricing-pending migration is additive and limited to refusing invoices / payments while pricing is pending.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261120000000_financial_pricing_pending.sql'),'utf8');
const rollback=fs.readFileSync(path.join(root,'SUPABASE-FINANCIAL-PRICING-PENDING-ROLLBACK-DRAFT.sql'),'utf8');
const code=(sql)=>sql.replace(/--.*$/gm,'');

test('Q6 migration: one trigger function and one BEFORE UPDATE trigger on builds, in a transaction',()=>{
  const sql=code(migration);
  assert.match(sql,/^\s*begin;[\s\S]*commit;\s*$/);
  assert.equal((sql.match(/create or replace function/g)||[]).length,1);
  assert.match(sql,/create or replace function public\.klabs_refuse_pending_financials\(\)\s*returns trigger/);
  assert.match(sql,/create trigger klabs_refuse_pending_financials\s+before update on public\.builds\s+for each row/);
  assert.match(sql,/revoke all on function public\.klabs_refuse_pending_financials\(\) from public, anon, authenticated/);
});

test('Q6 migration: changes no data, tables, policies or the existing financial function',()=>{
  const sql=code(migration).toLowerCase();
  for(const forbidden of [/\bupdate\s+public\./,/\bdelete\s+from\b/,/\binsert\s+into\b/,/\balter\s+table\b/,/\bdrop\s+table\b/,/\bcreate\s+table\b/,/\bpolicy\b/,/klabs_financial_operation\b/,/\bsecurity\s+definer\b/,/\btruncate\b/,/\bgrant\b/]){
    assert.doesNotMatch(sql,forbidden,String(forbidden));
  }
});

test('Q6 migration: acts only on payment / issued-invoice changes, and only for the pricePending marker',()=>{
  const sql=code(migration);
  assert.match(sql,/new\.payload->'payments'[\s\S]*is not distinct from[\s\S]*old\.payload->'payments'/);
  assert.match(sql,/new\.payload->'issuedInvoice' is not distinct from old\.payload->'issuedInvoice' then\s*return new;/);
  assert.match(sql,/old\.payload->>'pricePending' = 'true' or new\.payload->>'pricePending' = 'true'/);
  assert.match(sql,/Pricing to be confirmed/);
  assert.match(sql,/errcode = 'P0001'/);
});

test('Q6 rollback: drops only the new trigger and function',()=>{
  const sql=code(rollback);
  assert.match(sql,/drop trigger if exists klabs_refuse_pending_financials on public\.builds;/);
  assert.match(sql,/drop function if exists public\.klabs_refuse_pending_financials\(\);/);
  assert.equal((sql.match(/\bdrop\b/g)||[]).length,2);
  assert.doesNotMatch(sql,/\b(update|delete|insert|alter)\b/i);
});
