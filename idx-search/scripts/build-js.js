// Bundle + minify auth.js + list.js + app.js → public/js/bundle.min.js.
// Runs on `npm run build:js` and automatically via `prestart`.
const path = require('path');
const esbuild = require('esbuild');

const pub = path.join(__dirname, '..', 'public', 'js');

esbuild.buildSync({
  stdin: {
    contents: [
      `// --- auth.js ---`,
      require('fs').readFileSync(path.join(pub, 'auth.js'), 'utf8'),
      `// --- list.js ---`,
      require('fs').readFileSync(path.join(pub, 'list.js'), 'utf8'),
      `// --- app.js ---`,
      require('fs').readFileSync(path.join(pub, 'app.js'), 'utf8'),
    ].join('\n'),
    resolveDir: pub,
    loader: 'js',
  },
  outfile: path.join(pub, 'bundle.min.js'),
  minify: true,
  sourcemap: true,
  target: ['es2019'],
  legalComments: 'none',
});

const { size } = require('fs').statSync(path.join(pub, 'bundle.min.js'));
console.log(`[build:js] bundle.min.js → ${(size / 1024).toFixed(1)} KB`);
