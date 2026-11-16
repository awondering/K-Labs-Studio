"""Browser checks for KR Guide Layout (headless Chromium, Playwright). Run: python3 browser-tests.py
Loads kr-calculator.html as a single file with every other request blocked, then drives the UI."""
import sys, os
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'file://' + os.path.normpath(os.path.join(HERE, '..', 'index.html'))
errs = []; n = 0
def ck(name, cond, extra=''):
    global n; n += 1
    print(('PASS ' if cond else 'FAIL ') + name + (' :: ' + str(extra) if (extra != '' and not cond) else ''))
    if not cond: errs.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844}); logs = []; failed = []
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e)))); pg.on('requestfailed', lambda r: failed.append(r.url))
    pg.route('**/*', lambda r: r.continue_() if r.request.url == URL else r.abort())
    pg.goto(URL); pg.wait_for_timeout(400)
    L = lambda s: pg.locator(s)
    val = lambda i: L(f'.row[data-i="{i}"] input').input_value()
    chips = '[aria-label="Guide counts compared"] button[data-cand="%s"]'
    ck('no page errors on load', not [l for l in logs if l[0] == 'pageerror'], logs)
    ck('interface renders: title, cards, 10 rows, 10 diagram markers', L('h1').inner_text() == 'KR Guide Layout' and L('.row').count() == 10 and L('svg g.g').count() == 10)
    cys = pg.evaluate("[...document.querySelectorAll('svg g.g circle')].map(c=>+c.getAttribute('cy'))")
    ck('diagram heights differ by role', cys[0] < cys[1] < cys[2] < cys[3] < cys[4] == cys[9], cys)
    ck('reference start: #5 = 556.3, status Reference start', val(4) == '556.3' and 'Reference start' in L('#app').inner_text())
    L('.row[data-i="4"] button[data-st="1"]').click()
    ck('stepper + moves #5 and updates tag + adjacent spacings', val(4) == '557.3' and L('.row[data-i="4"] .tag').inner_text() == 'adjusted' and L('.row[data-i="4"] .sp').inner_text() == '125.5')
    L('.row[data-i="4"] button[data-st="-1"]').click(); ck('stepper - returns to reference', val(4) == '556.3' and L('.row[data-i="4"] .tag').inner_text() == 'reference')
    L('.row[data-i="4"] input').fill('560'); L('.row[data-i="4"] input').press('Enter'); ck('typed position applies', val(4) == '560.0')
    L('.row[data-i="4"] button[data-reset]').click(); ck('Ref restores reference', val(4) == '556.3')
    L('.row[data-i="5"] button[data-lock]').click(); L('.row[data-i="5"] button[data-st="1"]').click()
    ck('locked guide ignores stepper and says so', val(5) == '431.8' and 'locked' in L('.err').first.inner_text()); L('.row[data-i="5"] button[data-lock]').click()
    L('svg g.g[data-i="2"]').click(position={'x': 9, 'y': 20}, force=True); ck('diagram click selects row', L('.row.sel').get_attribute('data-i') == '2')
    ck('fit case: no warning card', L('.warn').count() == 0)
    L('input[data-k="stem"]').fill('300'); L('input[data-k="stem"]').press('Enter'); pg.wait_for_timeout(80)
    w = L('.warn').inner_text()
    ck('stem 300: reference does not fit, so a valid K-Labs layout is shown automatically: 8 + tip-top, labelled calculated, reasons and numbers given', 'k-labs calculated layout' in w.lower() and 'K-Labs-calculated' in w and '8 guides + tip-top' in w and 'the reference has 9 + tip-top' in w and 'Stripper, reduction and choke keep the chart distances' in w and 'not a manufacturer recommendation' in w, w[:200])
    vals = pg.evaluate("[...document.querySelectorAll('.row .num input')].map(i=>parseFloat(i.value))")
    ck('auto layout: 9 rows, all on the blank, tip-top at 0, strictly ordered, no off-blank tag, status not invalid, reduction/choke unchanged from the stem', len(vals) == 9 and min(vals) >= 0 and vals[0] == 0 and all(vals[i] < vals[i + 1] for i in range(8)) and L('.row .tag.off').count() == 0 and 'Not a valid layout' not in L('#app').inner_text() and abs(vals[8] - (1833.6 - 698.5)) < 0.06, vals)
    ck('auto layout: calculated tags on recalculated running guides', L('.row .tag.heuristic').count() >= 4)
    L('button[data-restoreref]').click(); pg.wait_for_timeout(60)
    ck('Restore reference shows the published layout again (invalid, nothing hidden) with the proposal previewed', L('.row').count() == 10 and L('.row .tag.off').count() == 2 and 'Not a valid layout' in L('#app').inner_text() and L('button[data-candapply]').count() == 1 and L('input[data-done="st"]').is_disabled())
    ck('reference preserved, nothing moved silently', val(9) == '-101.9' and val(8) == '-2.8')
    ck('chips: 8 starred; 9 marked review', '★' in L(chips % 8).inner_text() and 'review' in L(chips % 9).inner_text())
    L(chips % 8).click(); ck('preview 8: ghost markers drawn, nothing applied', L('.row').count() == 10 and L('svg circle[stroke-dasharray]').count() >= 4 and L('button[data-candapply]').inner_text() == 'Apply 8 + tip-top')
    L('button[data-candcancel]').click(); ck('cancel leaves layout untouched', L('.row').count() == 10 and val(9) == '-101.9')
    L(chips % 9).click(); t = L('.warn').inner_text()
    ck('9 is manual review, not recommended; finding with numbers; explicit apply label', 'manual review, not recommended' in t and 'never goes below' in t and L('button[data-candapply]').inner_text() == 'Apply 9 for manual review')
    L('button[data-candcancel]').click(); L(chips % 8).click(); L('button[data-candapply]').click()
    vals = pg.evaluate("[...document.querySelectorAll('.row .num input')].map(i=>parseFloat(i.value))")
    ck('accepted 8: 9 rows, all >= 0, strictly ordered, valid, count flagged -1, heuristic tags', len(vals) == 9 and min(vals) >= 0 and all(vals[i] < vals[i + 1] for i in range(8)) and 'Not a valid layout' not in L('#app').inner_text() and '-1 vs reference' in L('#app').inner_text() and L('.row .tag.heuristic').count() >= 4, vals)
    L('button[data-resetall]').click(); ck('reset all needs a second tap', L('button[data-resetall]').inner_text().startswith('Tap again') and L('.row').count() == 9)
    L('button[data-resetall]').click(); ck('second tap restores the reference (invalid, nothing hidden)', L('.row').count() == 10 and L('.row .tag.off').count() == 2)
    L(chips % 9).click(); L('button[data-candapply]').click(); ck('review layout applied only by its explicit button; status says Manual review needed', 'Manual review needed' in L('#app').inner_text() and L('.row').count() == 11 - 1 and 'Not a valid layout' not in L('#app').inner_text())
    L('button[data-resetall]').click(); L('button[data-resetall]').click()
    L('input[data-k="stem"]').fill('700'); L('input[data-k="stem"]').press('Enter'); pg.wait_for_timeout(80)
    ck('stem 700: no recommendation, all counts review', 'No recommended count' in L('.warn').inner_text() and 'Suggested:' not in L('.warn').inner_text() and '★' not in L('.warn').inner_text())
    L('input[data-k="stem"]').fill('1200'); L('input[data-k="stem"]').press('Enter'); pg.wait_for_timeout(80)
    ck('train off the blank: explained, no candidates', 'reduction train' in L('.warn').inner_text() and L('button[data-cand]').count() == 0)
    L('button[data-fit]').click(); ck('Set stem to fit clears the warning', L('.warn').count() == 0 and L('input[data-k="stem"]').input_value() == '198.1')
    L('button[data-st="-1"][data-k="stem"]').click(); L('.row[data-i="4"] input').fill('560'); L('.row[data-i="4"] input').press('Enter')
    L('button[data-st="1"][data-k="stem"]').click(); ck('manual edit survives a stem change', val(4) == '560.0')
    L('button[data-resetall]').click(); L('button[data-resetall]').click()
    L('button[data-unit="in"]').click(); ck('decimal inch display', val(3) == '27.200', val(3))
    L('button[data-unit="frac"]').click(); L('.row[data-i="4"] input').fill('22 1/16'); L('.row[data-i="4"] input').press('Enter'); ck('fractional entry accepted', val(4) == '22 1/16', val(4))
    L('button[data-unit="mm"]').click(); L('button[data-resetall]').click(); L('button[data-resetall]').click()
    L('button[data-cnt="1"]').click(); ck('add guide: 10 blank, flagged +1', L('.row').count() == 11 and '+1 vs reference' in L('#app').inner_text())
    L('button[data-cnt="-1"]').click(); ck('remove guide returns to 9', L('.row').count() == 10 and 'Matches reference' in L('#app').inner_text())
    ck('chart source stated, no invented/demonstration wording', 'nvented' not in L('#app').text_content() and "Fuji\u2019s published KR Concept chart" in L('#app').text_content() and L('button[data-train]').count() == 0)
    ck('unverified flags and IP disclaimer shown', 'unverified' in L('#app').text_content() and 'not affiliated with or endorsed by Fuji' in L('#app').text_content())
    L('button[data-unit="in"]').click()
    L('#entrybox > summary').click(); L('input[data-e="label"]').fill('My 6 ft test'); L('input[data-e="stripper"]').fill('26.2'); L('input[data-e="gaps"]').fill('10 8 6.5 6 5.4 5 4.8 4.3')
    L('button[data-applyentry]').click(); pg.wait_for_timeout(80)
    ck('builder entry: 9 guides built from typed numbers, labelled as builder-entered, own measurements labelled', L('.row').count() == 9 and 'your own chart measurements' in L('#app').text_content() and 'My 6 ft test' in L('#app').inner_text())
    ck('builder entry: first guide sits the sum of the typed gaps (50 in) from the tip; the entered chart fits the blade, so no geometry warning', val(0) == '50.000' and L('.warn').count() == 0, val(0))
    L('input[data-e="gaps"]').fill('8 abc 5'); L('button[data-applyentry]').click(); pg.wait_for_timeout(60)
    ck('bad entry: reason shown, previous layout kept', 'Check the numbers' in L('#app').inner_text() and L('.row').count() == 9)
    L('input[data-e="gaps"]').fill('8 6'); L('button[data-applyentry]').click(); pg.wait_for_timeout(60)
    ck('too few gaps: explained, previous layout kept', 'at least 4 gaps' in L('#app').inner_text() and L('.row').count() == 9)
    L('button[data-usedemo]').click(); pg.wait_for_timeout(60); L('button[data-unit="mm"]').click()
    ck('back to the chart rod restores the chart reference', L('.row').count() == 10 and val(4) == '556.3')
    # Stem sweep through the interface: all eight chart rods, stem moved toward the butt and toward the tip, in mm, decimal inch and fractional inch.
    RODS = ["5'6\"", "6'", "6'6\"", "7'", "7'6\"", "8'", "8'6\"", "9'"]; bad = []; shown = 0
    for ri, rod in enumerate(RODS):
        L('button[data-unit="mm"]').click(); L('button[data-rod]').nth(ri).click(); pg.wait_for_timeout(30)
        base = float(L('input[data-k="stem"]').input_value()); blade = float(L('input[data-k="blade"]').input_value())
        for unit, d in [('mm', -150), ('mm', -40), ('mm', 40), ('in', -100), ('in', 120), ('frac', -60), ('frac', 80)]:
            L('button[data-unit="%s"]' % unit).click(); mm = base - d
            txt = '%.1f' % mm if unit == 'mm' else ('%.3f' % (mm / 25.4) if unit == 'in' else None)
            if txt is None:
                sixteenths = round(mm / 25.4 * 16); w, fr = divmod(sixteenths, 16); txt = '%d %d/16' % (w, fr) if fr else '%d' % w; mm = sixteenths / 16 * 25.4
            L('input[data-k="stem"]').fill(txt); L('input[data-k="stem"]').press('Enter'); pg.wait_for_timeout(25)
            L('button[data-unit="mm"]').click(); v = pg.evaluate("[...document.querySelectorAll('.row .num input')].map(i=>parseFloat(i.value))")
            invalid = 'Not a valid layout' in L('#app').inner_text(); shown += 1
            ok_geo = v[0] == 0 and min(v) >= 0 and all(v[i] + 14.9 < v[i + 1] for i in range(len(v) - 1)) and max(v) <= blade
            if not invalid and not ok_geo: bad.append((rod, unit, d, 'labelled valid but geometry bad', v))
            if invalid and L('.row .tag.off').count() == 0 and min(v) >= 0 and v[0] == 0: bad.append((rod, unit, d, 'invalid with no flagged cause'))
            if ri == 0 and False: pass
    ck('interface sweep: 8 rods x 7 stem moves (mm, decimal in, fractional in): nothing invalid is shown as valid and every valid layout is on the blank, ordered, 15 mm apart, tip-top at 0', not bad and shown == 56, bad[:2])
    # ---- Units audit: every measurement follows the selected unit; physical positions never change; round trip is exact ----
    from fractions import Fraction
    def f16(mm):
        i = Fraction(mm) / Fraction(254, 10); n = round(abs(i) * 32); w, r = divmod(n, 32)
        while r and r % 2 == 0: r //= 2
        return n
    def parse_frac(t):
        t = t.replace('"', '').strip(); neg = t.startswith('-'); t = t.lstrip('-'); parts = t.split()
        v = sum(Fraction(x) for x in parts); return -v if neg else v
    REF7 = [1236.98, 1008.38, 840.74, 690.88, 556.26, 431.8, 317.5, 208.28, 99.06, 0.0]   # chart row 7 ft, from the raw chart arithmetic (tip distances)
    def snap(page): return page.evaluate("[...document.querySelectorAll('.row')].map(r => [r.querySelector('.num input').value, r.querySelector('.sp').textContent])")
    for w, hh in [(390, 844), (1440, 900)]:
        up = b.new_page(viewport={'width': w, 'height': hh}); up.goto(URL); up.wait_for_timeout(120)
        U = lambda sel: up.locator(sel)
        mm0 = snap(up); stem_mm0 = U('input[data-k="stem"]').input_value(); blade_mm0 = U('input[data-k="blade"]').input_value()
        modes = {}
        for unit in ('in', 'frac', 'mm'):
            U('button[data-unit="%s"]' % unit).click(); up.wait_for_timeout(40); modes[unit] = snap(up)
            txt = up.evaluate("document.querySelector('#app').textContent.replace(/Advanced: reference as JSON[\\s\\S]*?Apply values/, '')")
            txt = txt.replace('mm', '') if unit == 'mm' else txt
            if unit != 'mm':
                import re as _re
                stray = _re.findall(r'.{25}\bmm\b.{10}', _re.sub(r'(Optional|Choke|Stripper)', '', up.evaluate("[...document.querySelectorAll('#app')].map(e=>{const c=e.cloneNode(true);c.querySelectorAll('button[data-unit=mm],textarea').forEach(x=>x.remove());return c.textContent}).join(' ')")))
                ck('units audit %dpx %s: no "mm" label or value anywhere in the interface (rod, stem, rows, spacing, summary, warnings, About)' % (w, unit), not stray, stray[:2])
            exp_in = [('%.3f' % (v / 25.4)) for v in REF7]
            if unit == 'in': ck('decimal inch %dpx: all 10 guide positions equal the independent conversion of the chart row' % w, [r[0] for r in modes[unit]] == exp_in[::-1] and U('input[data-k="blade"]').input_value() == '84.000' and U('input[data-k="stem"]').input_value() == '7.800', ([r[0] for r in modes[unit]], exp_in))
            if unit == 'frac':
                got = [parse_frac(r[0]) for r in modes[unit]]; exp = [Fraction(round(Fraction(v).limit_denominator(10**9) / Fraction(254, 10) * 16), 16) for v in REF7[::-1]] if False else None
                okf = all(abs(float(g) * 25.4 - v) <= 25.4 / 32 + 1e-6 for g, v in zip(got, REF7[::-1])) and all('/' in r[0] or r[0].replace('"', '').replace('-', '').isdigit() for r in modes[unit])
                ck('fractional inch %dpx: positions are inch fractions within 1/32 in of the true value; blank and stem shown as fractions' % w, okf and U('input[data-k="blade"]').input_value() == '84' and U('input[data-k="stem"]').input_value() == '7 13/16', [r[0] for r in modes[unit]])
        ck('round trip mm -> decimal in -> fractional in -> mm returns the original values exactly (%dpx)' % w, snap(up) == mm0 and U('input[data-k="stem"]').input_value() == stem_mm0 and U('input[data-k="blade"]').input_value() == blade_mm0)
        # physical positions untouched by display: odd stem, cycle units, compare at 3 inch decimals before and after, plus focus/blur without edit
        U('input[data-k="stem"]').fill('198.37'); U('input[data-k="stem"]').press('Enter'); up.wait_for_timeout(40); U('button[data-unit="in"]').click(); up.wait_for_timeout(30); before = snap(up); st_before = U('input[data-k="stem"]').input_value()
        for unit in ('frac', 'mm', 'frac', 'in'):
            U('button[data-unit="%s"]' % unit).click(); up.wait_for_timeout(20)
            for i in (0, 4, 9): U('.row[data-i="%d"] input' % i).focus(); U('.row[data-i="%d"] input' % i).blur()
            U('input[data-k="stem"]').focus(); U('input[data-k="stem"]').blur()
        ck('unit cycling and focus/blur without editing never move a guide or the stem (%dpx; compared at 0.001 in)' % w, snap(up) == before and U('input[data-k="stem"]').input_value() == st_before and st_before == '7.810', (st_before, U('input[data-k="stem"]').input_value()))
        # entry in each unit: stem typed in frac and decimal inch give the same physical stem
        U('button[data-unit="frac"]').click(); U('input[data-k="stem"]').fill('7 3/4'); U('input[data-k="stem"]').press('Enter'); up.wait_for_timeout(40); U('button[data-unit="mm"]').click(); a = snap(up); U('button[data-unit="in"]').click()
        U('button[data-unit="in"]').click(); U('input[data-k="stem"]').fill('7.75'); U('input[data-k="stem"]').press('Enter'); up.wait_for_timeout(40); U('button[data-unit="mm"]').click(); b2 = snap(up)
        U('button[data-unit="mm"]').click(); mmv = U('input[data-k="stem"]').input_value()
        ck('stem typed as 7 3/4" or 7.75 in gives the identical layout (196.85 mm, shown 196.8) (%dpx)' % w, a == b2 and mmv == '196.8', (mmv,))
        U('button[data-unit="frac"]').click(); U('.row[data-i="3"] input').fill('27 1/4'); U('.row[data-i="3"] input').press('Enter'); up.wait_for_timeout(40)
        U('button[data-unit="in"]').click(); r3 = U('.row[data-i="3"] input').input_value(); U('button[data-unit="mm"]').click(); r3m = U('.row[data-i="3"] input').input_value()
        ck('guide position typed as a fraction is stored exactly (27 1/4 in = 692.2 mm, shown 27.250 in) (%dpx)' % w, r3 == '27.250' and r3m == '692.2', (r3, r3m))
        up.close()
    for w, hh in [(360, 800), (390, 844), (768, 1024), (1440, 900)]:
        fp = b.new_page(viewport={'width': w, 'height': hh}); fp.goto(URL); fp.wait_for_timeout(100)
        fp.click('button[data-unit="frac"]'); fp.fill('input[data-k="stem"]', '11 3/4'); fp.press('input[data-k="stem"]', 'Enter'); fp.wait_for_timeout(80)
        r = fp.evaluate('''() => ({ over: document.documentElement.scrollWidth > innerWidth,
          clip: [...document.querySelectorAll('.num input, .seg button, .row .ac button, .btn')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length,
          wrap: [...document.querySelectorAll('.row .sp')].filter(e => e.getBoundingClientRect().height > 22).length, n: document.querySelectorAll('.row').length })''')
        ck('fractional inch with an automatically recalculated layout at %dpx: no overflow, clipping or wrapped spacing' % w, not r['over'] and r['clip'] == 0 and r['wrap'] == 0 and r['n'] == 9, r)
        fp.close()
    ep = b.new_page(viewport={'width': 390, 'height': 844}); ep.goto(URL); ep.wait_for_timeout(100); ep.click('button[data-unit="in"]'); ep.click('#entrybox > summary')
    ep.fill('input[data-e="stripper"]', '26.2'); ep.fill('input[data-e="gaps"]', '10 8 6.5 6 5.5 5 4.75 4.25')
    ep.click('button[data-unit="mm"]'); mmv = (ep.input_value('input[data-e="stripper"]'), ep.input_value('input[data-e="gaps"]'))
    ep.click('button[data-unit="frac"]'); fv = (ep.input_value('input[data-e="stripper"]'), ep.input_value('input[data-e="gaps"]'))
    ep.click('button[data-unit="in"]'); iv = (ep.input_value('input[data-e="stripper"]'), ep.input_value('input[data-e="gaps"]'))
    ck('typed chart entries convert with the unit and return exactly (in -> mm -> fractional -> in)', mmv == ('665.48', '254, 203.2, 165.1, 152.4, 139.7, 127, 120.65, 107.95') and fv == ('26.2', '10, 8, 6 1/2, 6, 5 1/2, 5, 4 3/4, 4 1/4') and iv == ('26.2', '10, 8, 6.5, 6, 5.5, 5, 4.75, 4.25'), (mmv, fv, iv))
    ep.click('button[data-unit="frac"]'); ep.fill('input[data-e="gaps"]', '10 8 6 1/2 6 5 1/2 5 4 3/4 4 1/4'); ep.click('button[data-applyentry]'); ep.wait_for_timeout(80)
    ck('fractional gaps typed with spaces ("6 1/2") are read as 8 gaps, giving 9 guides', ep.locator('.row').count() == 9, ep.locator('.row').count())
    ep.close()
    # Responsive layout at the five widths: no overflow or clipping; one clean column below 900; rod/reel bar over two balanced columns from 900.
    for w, hh in [(360, 800), (390, 844), (768, 1024), (1024, 800), (1440, 900)]:
        rp = b.new_page(viewport={'width': w, 'height': hh}); rp.goto(URL); rp.wait_for_timeout(120)
        r = rp.evaluate('''() => { const R = e => e.getBoundingClientRect(), q = s => document.querySelector(s), main = R(q('main')), rod = R(q('.s-rod'));
          const secs = [...document.querySelectorAll('#app section')].map(e => [e.className.split(' ').find(c => c.startsWith('s-')), R(e)]);
          const clip = [...document.querySelectorAll('.num input, .seg button, .row .ac button, .btn')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length;
          const small = [...document.querySelectorAll('.num button, .seg button')].filter(e => e.offsetParent && (R(e).height < 30 || R(e).width < 30)).length;
          const L = q('.colL').getBoundingClientRect(), Rr = q('.colR').getBoundingClientRect(), lefts = new Set(secs.map(x => Math.round(x[1].left)));
          return { over: document.documentElement.scrollWidth > innerWidth, clip, small, mainW: Math.round(main.width), rodW: Math.round(rod.width), order: secs.slice().sort((a, b) => a[1].top - b[1].top || a[1].left - b[1].left).map(x => x[0]).join(','), cols: lefts.size,
            lh: Math.round(L.height), rh: Math.round(Rr.height), lw: Math.round(L.width), rw: Math.round(Rr.width), seg: [...document.querySelectorAll('.s-rod .seg.wrap button')].map(e => Math.round(R(e).top)).filter((v, i, a) => a.indexOf(v) === i).length }; }''')
        two = w >= 900
        good = (not r['over'] and r['clip'] == 0 and r['small'] == 0 and r['rodW'] >= r['mainW'] - 44 and (r['cols'] == 2 if two else r['cols'] == 1)
                and (r['order'].startswith('s-rod') and (two or r['order'] == 's-rod,s-sum,s-dia,s-gui,s-sta,s-src')) and (min(r['lh'], r['rh']) >= 0.7 * max(r['lh'], r['rh']) if two else True) and (r['seg'] == 1 if w >= 600 else r['seg'] == 2))
        ck('responsive %dpx: no overflow or clipping, touch targets >= 30 px, %s' % (w, 'rod/reel bar spans the width over two balanced columns' if two else 'single column, rod/reel first'), good, r)
        rp.close()
    ck('no horizontal overflow; no clipped position inputs', not pg.evaluate("document.documentElement.scrollWidth>innerWidth") and pg.evaluate("[...document.querySelectorAll('.row .num input')].filter(i=>i.scrollWidth>i.clientWidth).length") == 0)
    ck('no external requests at all (the Google Fonts link was removed for the Workshop build); no page errors', failed == [] and not [l for l in logs if l[0] == 'pageerror'], (failed, logs[-3:]))
    tp = b.new_page(); terr = []; tp.on('pageerror', lambda e: terr.append(str(e))); tp.goto('file://' + os.path.join(HERE, 'tests.html')); tp.wait_for_timeout(500); last = tp.inner_text('pre').splitlines()[-1]
    ck('engine tests page (browser): ' + last, last.endswith('passed') and last.split('/')[0] == last.split('/')[1].split(' ')[0] and not terr, terr)
    b.close()
print(f'{n - len(errs)}/{n} browser checks passed'); sys.exit(1 if errs else 0)
