const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');

function extract(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, name);
  const next = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nasync function ', start + 1)]
    .filter(index => index >= 0);
  return source.slice(start, Math.min(...next));
}
function harness() {
  const elements = {
    amount: { value: '50.00' }, date: { value: '2026-11-11' }, reason: { value: '' }, error: { textContent: '' },
  };
  const quote = { payments: [{ id: 'deposit-1', type: 'deposit', amount: 20, date: '2026-11-01' }] };
  let submitted = null, closed = false, reject = false;
  const context = vm.createContext({ quote, window: { crypto: { randomUUID: () => 'new-payment-id' } },
    $: id => elements[id], async commitFinancialOperation(kind, data) {
      submitted = { kind, data };
      if (reject) throw new Error('No server acknowledgement.');
    }, closeDepositReceivedForm() { closed = true; }, closeBalanceReceivedForm() { closed = true; },
  });
  vm.runInContext(extract('saveFinancialPayment'), context);
  return { context, elements, quote, get submitted() { return submitted; }, get closed() { return closed; },
    reject() { reject = true; } };
}
test('partial balance is submitted once and does not alter the original deposit', async () => {
  const h = harness();
  await h.context.saveFinancialPayment('balance', '', 'amount', 'date', 'reason', 'error');
  assert.equal(h.submitted.kind, 'add_payment');
  assert.equal(h.submitted.data.id, 'new-payment-id');
  assert.equal(h.submitted.data.amount, 50);
  assert.equal(h.quote.payments[0].id, 'deposit-1');
  assert.equal(h.closed, true);
});
test('corrections require a reason and retain the original payment identity', async () => {
  const h = harness();
  await h.context.saveFinancialPayment('balance', 'existing', 'amount', 'date', 'reason', 'error');
  assert.match(h.elements.error.textContent, /reason/i);
  assert.equal(h.submitted, null);
  h.elements.reason.value = 'Correct receipt';
  await h.context.saveFinancialPayment('balance', 'existing', 'amount', 'date', 'reason', 'error');
  assert.equal(h.submitted.kind, 'correct_payment');
  assert.equal(h.submitted.data.id, 'existing');
  assert.equal(h.submitted.data.reason, 'Correct receipt');
});
test('invalid dates, fractional cents and unconfirmed writes do not report success', async () => {
  const h = harness();
  h.elements.amount.value = '1.001';
  await h.context.saveFinancialPayment('balance', '', 'amount', 'date', 'reason', 'error');
  assert.match(h.elements.error.textContent, /amount/i);
  h.elements.amount.value = '1';
  h.elements.date.value = '2026-02-31';
  await h.context.saveFinancialPayment('balance', '', 'amount', 'date', 'reason', 'error');
  assert.match(h.elements.error.textContent, /date/i);
  h.elements.date.value = '2026-11-11';
  h.reject();
  await h.context.saveFinancialPayment('balance', '', 'amount', 'date', 'reason', 'error');
  assert.match(h.elements.error.textContent, /acknowledgement/i);
  assert.equal(h.closed, false);
});
