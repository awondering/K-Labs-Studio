(function () {
  // Common glyphs in the bundled regular and bold fonts; other text uses the device's fonts.
  const fontRanges = [[0,0],[2,2],[13,13],[32,126],[160,383],[399,399],[402,402],[416,417],[431,432],[496,496],[506,511],[536,539],[567,567],[601,601],[700,700],[710,711],[713,713],[728,733],[755,755],[768,769],[771,771],[777,777],[783,783],[803,803],[900,906],[908,908],[910,929],[931,974],[977,978],[982,982],[1024,1158],[1160,1299],[7680,7681],[7742,7743],[7808,7813],[7838,7838],[7840,7929],[8013,8013],[8192,8203],[8208,8209],[8211,8213],[8215,8222],[8224,8226],[8229,8231],[8240,8240],[8242,8243],[8249,8250],[8252,8252],[8260,8260],[8304,8304],[8308,8334],[8355,8356],[8358,8364],[8369,8369],[8377,8378],[8380,8381],[8453,8453],[8467,8467],[8470,8470],[8482,8482],[8486,8486],[8494,8494],[8539,8542],[8706,8706],[8710,8710],[8719,8719],[8721,8722],[8730,8730],[8734,8734],[8747,8747],[8776,8776],[8800,8800],[8804,8805],[9674,9674],[60929,60930],[63171,63171],[64257,64260],[65279,65279],[65532,65533]];
  let libraries;
  let generation = 0;
  let prepared = null;
  let measureContext;

  function isStandaloneIOS() {
    return navigator.standalone === true ||
      (/iPhone|iPad|iPod/.test(navigator.userAgent) && window.matchMedia('(display-mode: standalone)').matches);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('The PDF tools could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  function loadLibraries() {
    if (!libraries) {
      libraries = loadScript('js/vendor/pdfmake/pdfmake-0.2.20.min.js')
        .then(() => loadScript('js/vendor/pdfmake/vfs_fonts.js'))
        .catch((error) => { libraries = null; throw error; });
    }
    return libraries;
  }

  function requireText(node, selector) {
    const element = node.querySelector(selector);
    if (!element) throw new Error('The invoice preview is incomplete.');
    return element.textContent.trim();
  }

  function needsSystemFont(text) {
    return Array.from(text).some((char) => {
      const code = char.codePointAt(0);
      return char !== '\n' && !fontRanges.some(([first, last]) => code >= first && code <= last);
    });
  }

  function textNode(value, options, width) {
    const text = String(value || '');
    const size = options.fontSize || 10;
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    if (!measureContext) throw new Error('The PDF text renderer is unavailable.');
    measureContext.font = `${options.bold ? 'bold ' : ''}${size}px "Helvetica Neue", sans-serif`;
    if (!needsSystemFont(text)) {
      const wrapped = text.replace(/\S+/gu, (word) => {
        if (measureContext.measureText(word).width <= width * 0.85) return word;
        const parts = [];
        let part = '';
        for (const char of word) {
          if (part && measureContext.measureText(part + char).width > width * 0.85) {
            parts.push(part);
            part = '';
          }
          part += char;
        }
        parts.push(part);
        return parts.join('\n');
      });
      return { text: wrapped, ...options };
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The PDF text renderer is unavailable.');
    const font = `${options.bold ? 'bold ' : ''}${size * 2}px "Helvetica Neue", sans-serif`;
    context.font = font;
    const segments = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment)
      : Array.from(text);
    const lines = [];
    let line = '';
    for (const segment of segments) {
      if (segment === '\n') { lines.push(line); line = ''; continue; }
      if (line && context.measureText(line + segment).width > width * 2 - 4) {
        lines.push(line);
        line = '';
      }
      line += segment;
    }
    lines.push(line);
    const images = lines.map((value) => {
      canvas.width = Math.ceil(width * 2);
      canvas.height = Math.ceil(size * 3);
      context.font = font;
      context.textBaseline = 'middle';
      context.fillStyle = options.color || '#242323';
      context.fillText(value, 2, canvas.height / 2);
      return { image: canvas.toDataURL('image/png'), width };
    });
    return { stack: images, margin: options.margin || 0 };
  }

  function documentDefinition(node, logo) {
    const text = (value, options = {}, width = 490) => textNode(value, options, width);
    const label = (value) => text(value.toUpperCase(), { fontSize: 8, bold: true, color: '#77716f' });
    const heading = requireText(node, '.invoice-document__heading h3');
    const business = requireText(node, '.invoice-document__brand span');
    const address = Array.from(node.querySelectorAll('.invoice-document__address p'), (p) => text(p.textContent.trim(), {}, 215));
    const metadata = Array.from(node.querySelectorAll('.invoice-document__metadata div'), (row) => ({
      columns: [
        { width: 82, ...text(requireText(row, 'dt'), { color: '#77716f' }, 82) },
        { width: '*', ...text(requireText(row, 'dd'), { alignment: 'right' }, 130) }
      ], columnGap: 6, margin: [0, 0, 0, 5]
    }));
    const description = node.querySelector('.invoice-document__description');
    const financial = Array.from(node.querySelectorAll('.invoice-document__amount-row'), (row) => [
      text(requireText(row, 'dt'), { bold: row.classList.contains('invoice-document__balance') }, 185),
      text(requireText(row, 'dd'), { alignment: 'right', bold: row.classList.contains('invoice-document__balance') }, 100)
    ]);
    if (!financial.length) throw new Error('The invoice totals are missing.');
    const paymentRows = Array.from(node.querySelectorAll('.invoice-document__payments tr'), (row) =>
      Array.from(row.querySelectorAll('th,td'), (cell, index) =>
        text(cell.textContent.trim(), { bold: cell.tagName === 'TH', alignment: index === 2 ? 'right' : 'left' }, index === 2 ? 110 : 180)));
    const footer = node.querySelector('.invoice-document__footer');
    if (!footer) throw new Error('The invoice footer is missing.');
    const content = [
      { columns: [
        { width: '*', columns: [{ svg: logo, width: 29 }, { width: '*', ...text(business, { fontSize: 13, bold: true }, 200), margin: [9, 4, 0, 0] }] },
        { width: 160, stack: [text('K-LABS STUDIO', { fontSize: 8, color: '#77716f', alignment: 'right' }, 160),
          text(heading, { fontSize: 22, alignment: 'right' }, 160)] }
      ], margin: [0, 0, 0, 12] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 493, y2: 0, lineWidth: 1.5, lineColor: '#861e2a' }] }
    ];
    const draft = node.querySelector('.invoice-document__draft');
    if (draft) content.push(text(draft.textContent.trim(), { bold: true, color: '#861e2a', margin: [0, 12, 0, 0] }));
    content.push({ columns: [
      { width: 225, stack: [label('Bill to'), ...address] },
      { width: '*', stack: metadata }
    ], columnGap: 30, margin: [0, 20, 0, 0] });
    if (description) {
      const paragraphs = Array.from(description.querySelectorAll('p'), (p) =>
        text(p.textContent.trim(), { fontSize: p.classList.contains('invoice-document__detail') ? 9.5 : 12, margin: [0, 5, 0, 0] }));
      content.push({ stack: [label('Description'), ...paragraphs], margin: [0, 20, 0, 0] });
    }
    content.push(
      { columns: [{ width: '*', text: '' }, { width: 290, stack: [label('Summary'),
        { table: { widths: ['*', 100], body: financial }, layout: 'noBorders', margin: [0, 5, 0, 0] }] }],
      margin: [0, 18, 0, 0] },
      { stack: [label('Payments received'), paymentRows.length
        ? { table: { headerRows: 1, widths: ['*', '*', 110], body: paymentRows }, layout: 'lightHorizontalLines', margin: [0, 6, 0, 0] }
        : text(requireText(node, '.invoice-document__empty'), { color: '#77716f', margin: [0, 6, 0, 0] })],
      margin: [0, 18, 0, 0] },
      { stack: [text(requireText(footer, 'strong'), { bold: true }, 490),
        ...Array.from(footer.querySelectorAll('span'), (span) => text(span.textContent.trim(), { fontSize: 9, color: '#635e5b' }))],
      margin: [0, 20, 0, 0] }
    );
    return { pageSize: 'A4', pageMargins: [51, 45, 51, 45], defaultStyle: { font: 'Roboto', fontSize: 10 }, content };
  }

  async function create(node) {
    await loadLibraries();
    const response = await fetch('assets/logo.svg');
    if (!response.ok) throw new Error('The invoice logo could not be loaded.');
    const logo = await response.text();
    const definition = documentDefinition(node, logo);
    return new Promise((resolve, reject) => {
      let timeout;
      try {
        const stream = window.pdfMake.createPdf(definition).getStream();
        const chunks = [];
        timeout = window.setTimeout(() => reject(new Error('PDF preparation timed out.')), 30000);
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', (error) => { window.clearTimeout(timeout); reject(error); });
        stream.on('end', () => { window.clearTimeout(timeout); resolve(new Blob(chunks, { type: 'application/pdf' })); });
        stream.end();
      } catch (error) {
        window.clearTimeout(timeout);
        reject(error);
      }
    });
  }

  function prepare(node, button) {
    const serial = ++generation;
    const markup = node.outerHTML;
    prepared = null;
    button.disabled = true;
    button.textContent = 'Preparing PDF...';
    const copy = node.cloneNode(true);
    create(copy).then((blob) => {
      if (serial !== generation) return;
      if (!blob || blob.type !== 'application/pdf' || !blob.size) throw new Error('The PDF could not be created.');
      const draft = !!copy.querySelector('.invoice-document__draft');
      const statement = requireText(copy, '.invoice-document__heading h3') === 'Payment Statement';
      const name = statement ? 'Payment-Statement.pdf' : draft ? 'Draft-Invoice.pdf' : 'Invoice.pdf';
      prepared = { markup, blob, name, file: typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null };
      button.disabled = false;
      button.textContent = 'Print / Save as PDF';
    }).catch((error) => {
      if (serial !== generation) return;
      console.error('[K-Labs Studio] PDF preparation failed:', error);
      button.disabled = false;
      button.textContent = 'Print / Save as PDF';
      prepared = { markup, error };
    });
  }

  function share(node) {
    if (!prepared || prepared.markup !== node.outerHTML) {
      throw new Error('The PDF is not ready. Close and reopen the preview.');
    }
    if (prepared.error) throw new Error('The PDF could not be prepared. Close and reopen the preview to try again.', { cause: prepared.error });
    const { file, blob, name } = prepared;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).catch((error) => {
        if (error.name !== 'AbortError') throw error;
      });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return Promise.resolve();
  }

  window.KLABS_INVOICE_PDF = { isStandaloneIOS, prepare, share };
})();
