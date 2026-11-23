const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');

// Pricing redesign: one payment form (Amount, Date, Save). A new payment goes through add_payment; tapping a payment
// edits it through correct_payment with the same id and type, and Studio supplies the server's edit reason itself.
function extract(name, prefix = '') {
  const start = source.indexOf(`${prefix}function ${name}(`);
  assert.notEqual(start, -1, name);
  const next = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nasync function ', start + 1)]
    .filter(index => index >= 0);
  return source.slice(start, Math.min(...next));
}
function harness({ total = 100 } = {}) {
  const elements = {
    quoteBalanceReceivedAmount: { value: '50.00' }, quoteBalanceReceivedDate: { value: '2026-11-11' },
    quoteBalanceReceivedError: { textContent: '' }, quoteBalanceReceivedSave: { disabled: false },
  };
  const quote = { payments: [{ id: 'deposit-1', type: 'deposit', amount: 20, date: '2026-11-01' }] };
  const calls = [];
  let closed = false, reject = false;
  const context = vm.createContext({ quote, window: { crypto: { randomUUID: () => 'new-payment-id' } },
    $: id => elements[id], numberOrZero: v => Number(v) || 0, roundMoney: v => Math.round(v * 100) / 100,
    isComponentsJob: () => false,
    depositMaths: () => {
      const received = quote.payments.reduce((sum, p) => sum + p.amount, 0);
      return { total, balanceOwing: Math.max(0, total - received), depositPayment: quote.payments.find(p => p.type === 'deposit') || null };
    },
    async commitFinancialOperation(kind, data) {
      calls.push({ kind, data });
      if (reject) throw new Error('No server acknowledgement.');
    },
    closeBalanceReceivedForm() { closed = true; },
  });
  vm.runInContext("var financialOperationInFlight=false;var editingPaymentId='';var PAYMENT_EDIT_REASON='Edited in Studio';", context);
  for (const name of ['paymentFormValues', 'newPaymentType', 'paymentErrorMessage']) vm.runInContext(extract(name), context);
  vm.runInContext(extract('saveBalanceReceived', 'async '), context);
  return { context, elements, quote, calls, get closed() { return closed; }, reject() { reject = true; } };
}
const error = h => h.elements.quoteBalanceReceivedError.textContent;

test('a new payment is submitted once and does not alter the original deposit', async () => {
  const h = harness();
  await h.context.saveBalanceReceived();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].kind, 'add_payment');
  assert.deepEqual({ ...h.calls[0].data }, { id: 'new-payment-id', type: 'balance', amount: 50, date: '2026-11-11' });
  assert.equal(h.quote.payments[0].id, 'deposit-1');
  assert.equal(h.closed, true);
});

test('editing keeps the original payment identity and type, with Studio supplying the reason', async () => {
  const h = harness();
  h.context.editingPaymentId = 'deposit-1';
  h.elements.quoteBalanceReceivedAmount.value = '25.00';
  await h.context.saveBalanceReceived();
  assert.equal(h.calls.length, 1, 'never adds a second payment');
  assert.equal(h.calls[0].kind, 'correct_payment');
  assert.deepEqual({ ...h.calls[0].data }, { id: 'deposit-1', type: 'deposit', amount: 25, date: '2026-11-11', reason: 'Edited in Studio' });
  assert.ok(h.calls[0].data.reason.trim().length >= 3, 'meets the server reason rule');
});

test('an edit with nothing changed closes without a write', async () => {
  const h = harness();
  h.context.editingPaymentId = 'deposit-1';
  h.elements.quoteBalanceReceivedAmount.value = '20';
  h.elements.quoteBalanceReceivedDate.value = '2026-11-01';
  await h.context.saveBalanceReceived();
  assert.deepEqual(h.calls, []);
  assert.equal(h.closed, true);
});

test('invalid dates, fractional cents, over-total amounts and unconfirmed writes do not report success', async () => {
  const h = harness();
  h.elements.quoteBalanceReceivedAmount.value = '1.001';
  await h.context.saveBalanceReceived();
  assert.match(error(h), /amount/i);
  h.elements.quoteBalanceReceivedAmount.value = '1';
  h.elements.quoteBalanceReceivedDate.value = '2026-02-31';
  await h.context.saveBalanceReceived();
  assert.match(error(h), /date/i);
  h.elements.quoteBalanceReceivedDate.value = '2026-11-11';
  h.elements.quoteBalanceReceivedAmount.value = '80.01';
  await h.context.saveBalanceReceived();
  assert.equal(error(h), 'Payments can’t add up to more than the total price.');
  assert.deepEqual(h.calls, []);
  h.elements.quoteBalanceReceivedAmount.value = '1';
  h.reject();
  await h.context.saveBalanceReceived();
  assert.match(error(h), /acknowledgement/i);
  assert.equal(h.closed, false);
  assert.equal(h.elements.quoteBalanceReceivedSave.disabled, false, 'Save is usable again after a failure');
});
