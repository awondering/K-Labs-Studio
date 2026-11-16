// Bundle shell.html + styles.css + engine.js + app.js into one self-contained thread-studio.html
const fs = require('fs'), r = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
let h = r('shell.html');
h = h.replace('<link rel="stylesheet" href="styles.css">', '<style>' + r('styles.css') + '</style>')
  .replace('<script src="engine.js"></script><script src="crosswrap.js"></script><script src="weave.js"></script><script src="art.js"></script><script src="app.js"></script>', '<script>' + r('engine.js') + '</script><script>' + r('crosswrap.js') + '</script><script>' + r('weave.js') + '</script><script>' + r('art.js') + '</script><script>' + r('app.js') + '</script>');
const OUT = process.env.TDS_OUT || __dirname + '/../index.html'; fs.writeFileSync(OUT, h); console.log('thread-studio/index.html', h.length, 'bytes');
