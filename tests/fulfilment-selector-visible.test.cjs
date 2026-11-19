// Q14: the Fulfilment Method selector must be reachable whenever its warning can appear. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/studio.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
// Markup of the element with this id, including its children (balanced <div>/<section>).
function block(id) {
  const at = html.indexOf(`id="${id}"`);
  assert.ok(at >= 0, id);
  const start = html.lastIndexOf('<', at);
  const tag = /^<(\w+)/.exec(html.slice(start))[1];
  let depth = 0;
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = start;
  for (let m; (m = re.exec(html));) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error('unbalanced ' + id);
}

test('Q14: selector is outside the collapsible pricing-fields block and directly above the Documents actions', () => {
  assert.ok(!block('workshopPricingFields').includes('quoteFulfilmentGroup'), 'not inside #workshopPricingFields');
  const surface = html.slice(html.indexOf('<section class="workshop-build-actions-surface"'));
  const firstChild = /<section[^>]*>\s*<div id="([^"]+)"/.exec(surface)[1];
  assert.equal(firstChild, 'quoteFulfilmentGroup', 'first item of the actions area');
  assert.ok(surface.indexOf('quoteFulfilmentGroup') < surface.indexOf('aria-label="Documents"'));
  assert.ok(block('workshopQuoteSummaryBody').includes('id="quoteFulfilmentGroup"'), 'still inside Job Pricing & Actions');
  assert.equal((html.match(/id="quoteFulfilmentGroup"/g) || []).length, 1, 'one selector only');
  assert.equal((html.match(/data-fulfilment-method="/g) || []).length, 2);
});

test('Q14: no pricing visibility rule can hide the selector (no components / no pricing / folded Complete or invoiced)', () => {
  // The JS rule hides only #workshopPricingFields; the selector is no longer inside it.
  const visibility = fn('updateWorkshopSectionVisibility');
  assert.match(visibility, /pricingFields\.hidden=!showPricing/);
  assert.doesNotMatch(visibility, /quoteFulfilmentGroup/);
  // The fold for completed / invoiced builds and repairs only targets children of #workshopPricingFields.
  assert.match(css, /\[data-pricing-collapsed="true"\] #workshopPricingFields > :not/);
  // No CSS rule (any job kind, delivery mode or lifecycle) hides the selector or its options.
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display\s*:\s*none|visibility\s*:\s*hidden/.test(m[2])) continue;
    assert.doesNotMatch(m[1], /quoteFulfilmentGroup|quote-job-type__option|data-fulfilment-method|workshop-build-actions-surface/, m[1].trim());
  }
});

// Minimal DOM for revealFulfilmentSelector and the selector state, enough to run the real functions.
function dom(jobType) {
  const calls = [];
  const el = (id, extra = {}) => ({ id, hidden: false, attrs: {}, classList: new Set(), focusCalls: 0,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, ...extra });
  const options = ['collection', 'shipping'].map((m) => el('opt-' + m, { attrs: { 'data-fulfilment-method': m, 'aria-pressed': 'false' },
    focus(o) { this.focusCalls += 1; calls.push(['focus', m, o]); } }));
  const group = el('quoteFulfilmentGroup', {
    get offsetWidth() { return 1; },
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    scrollIntoView(o) { calls.push(['scroll', o]); },
    querySelector(sel) { return sel.includes('[aria-pressed="true"]') ? options.find((o) => o.attrs['aria-pressed'] === 'true') || null : options[0]; },
  });
  const section = el('workshopPricingSection', { hidden: true, attrs: { 'data-job-kind': jobType === 'components' ? 'components' : '' } });
  const ids = { quoteFulfilmentGroup: group, workshopPricingSection: section };
  const timers = [];
  const c = { calls, options, group, section, timers,
    quote: { jobType, fulfilmentMethod: '', fulfilmentChoiceRequired: true },
    $: (id) => ids[id] || null,
    setWorkshopSectionCollapsed: (id, collapsed, o) => calls.push(['expand', id, collapsed, o && o.instant]),
    window: { setTimeout: (f, ms) => timers.push([f, ms]) },
  };
  vm.createContext(c);
  vm.runInContext(fn('revealFulfilmentSelector'), c);
  return c;
}

for (const jobType of ['build', 'repair', 'components']) {
  test(`Q14: "Choose Fulfilment Method" opens Job Pricing & Actions, scrolls to and focuses the selector (${jobType})`, () => {
    const c = dom(jobType);
    c.revealFulfilmentSelector();
    assert.equal(c.section.hidden, false, 'section shown');
    assert.deepEqual(c.calls.find((x) => x[0] === 'expand'), ['expand', 'workshopQuoteSummaryBody', false, true], 'section opened');
    const scroll = c.calls.find((x) => x[0] === 'scroll');
    assert.ok(scroll, 'scrolled into view');
    assert.equal(c.calls.at(-1)[0], 'focus');
    assert.equal(c.calls.at(-1)[1], 'collection', 'first option focused when nothing is chosen');
    assert.ok(c.group.classList.contains('is-attention'), 'briefly highlighted');
    assert.equal(c.timers.length, 1);
    c.timers[0][0]();
    assert.ok(!c.group.classList.contains('is-attention'), 'highlight removed');
    assert.equal(c.quote.fulfilmentMethod, '', 'no method is chosen for the user');
  });
}

test('Q14: an existing selection is kept and is the option focused', () => {
  const c = dom('build');
  c.options[1].attrs['aria-pressed'] = 'true';
  c.quote.fulfilmentMethod = 'shipping';
  c.revealFulfilmentSelector();
  assert.equal(c.calls.at(-1)[1], 'shipping');
  assert.equal(c.quote.fulfilmentMethod, 'shipping');
  assert.equal(c.options[1].attrs['aria-pressed'], 'true');
});

test('Q14: display only - the reveal never saves, syncs or changes the job', () => {
  const body = fn('revealFulfilmentSelector');
  assert.doesNotMatch(body, /saveQuoteCurrent|markQuoteDirty|persist|Store\.|KLABS_BUILD_SYNC|fulfilmentMethod\s*=/);
  const guard = fn('runWithFulfilmentCheck');
  assert.match(guard, /if\(action==='choose'\)window\.setTimeout\(revealFulfilmentSelector,0\)/);
  assert.doesNotMatch(guard.split("if(action==='choose')")[1].split('\n')[0], /proceed/, 'choosing never creates the document');
});
