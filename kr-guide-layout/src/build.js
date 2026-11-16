// Bundles shell.html + styles.css + chart-data.js + engine.js + app.js into the served, self-contained kr-guide-layout/index.html
const fs = require('fs'), path = require('path'), r = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = r('shell.html')
  .replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + r('styles.css') + '\n</style>')
  .replace('<script src="chart-data.js"></script>', () => '<script>\n' + r('chart-data.js') + '\n</script>')
  .replace('<script src="engine.js"></script>', () => '<script>\n' + r('engine.js') + '\n</script>')
  .replace('<script src="app.js"></script>', () => '<script>\n' + r('app.js') + '\n</script>');
if (/(src|href)="(engine|app|styles)\.(js|css)"/.test(html)) throw new Error('unresolved local reference');
const OUT = process.env.KR_OUT || path.join(__dirname, '..', 'index.html'); fs.writeFileSync(OUT, html); console.log('kr-guide-layout/index.html', html.length, 'bytes');
