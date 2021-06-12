const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const crypto = require('crypto');

function noRebuildNeeded(src, dest) {
  try {
    const srcStat = fs.statSync(src, {throwIfNoEntry: false});
    if (!srcStat) return true;
    const destStat = fs.statSync(dest);
    if (srcStat.ctimeMs < destStat.ctimeMs) return true;
  } catch (e) {}

  return false;
}

function compileToDir(srcDir, destDir, opts = {}) {
  const entryPoints = [];
  /** @type {Map<string, string[]>} Map<entryPoint, htmlFile> */
  const entryPointDependencies = new Map();
  function handle(src, dest) {
    const stat = fs.statSync(src, {throwIfNoEntry: false});
    if (!stat) return 0;
  
    if (stat.isDirectory()) {
      const files = fs.readdirSync(src);
      let total = 0;
      for (const file of files) {
        if (file.startsWith('.')) continue;
        total += handle(path.join(src, file), path.join(dest, file));
      }
      return total;
    } else {
      return handleFile(src, dest);
    }
  }
  
  function handleFile(src, dest) {
    if (dest.endsWith('.html') || dest.endsWith('.html')) {
      return handleHTML(src, dest);
    }

    if (opts.incremental && noRebuildNeeded(src, dest)) return 0;

    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, fs.statSync(src).mode);
    return 1;
  }

  function getCachebuster(src) {
    try {
      const contents = fs.readFileSync(src);
      return '?' + crypto.createHash('md5').update(contents).digest('hex').slice(0, 8);
    } catch {
      return '';
    }
  }

  function handleHTML(src, dest = path.join(destDir, path.relative(srcDir, src))) {
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    let contents = '' + fs.readFileSync(src);
    contents = contents.replace(/<script src="([^"]*.tsx?)">/i, (substring, ePath) => {
      let entryPoint;
      if (/^[A-Za-z0-9]*:/.test(ePath)) {
        throw new Error(`External path to "${ePath}" can't be compiled; please replace it with a relative path`);
      }
      if (ePath.startsWith('/')) {
        // absolute path; treat it as relative to `srcDir`
        entryPoint = ePath.slice(1);
      } else {
        // relative path
        entryPoint = path.relative(srcDir, path.join(path.dirname(src), ePath));
      }
      entryPoints.push(entryPoint);
      let deps = entryPointDependencies.get(entryPoint);
      if (!deps) {
        deps = [];
        entryPointDependencies.set(entryPoint, deps);
      }
      if (!deps.includes(src)) deps.push(src);
      const cachebuster = getCachebuster(src);
      return `<script src="${compiledEntryPoint(ePath) + cachebuster}">`;
    });

    try {
      const oldContents = fs.readFileSync(dest);
      if (oldContents === contents) return 0;
    } catch {}
    console.log(`${src} -> ${dest}`);
    fs.writeFileSync(dest, contents);
    return 1;
  }

  function compiledEntryPoint(ePath) {
    const ePathNoExt = ePath.slice(0, ePath.endsWith('.tsx') ? -4 : -3);
    return ePathNoExt + '.js';
  }

  const results = handle(srcDir, destDir);

  const esbuilds = [];
  for (const entryPoint of entryPoints) {
    esbuilds.push(esbuild.build({
      entryPoints: [path.join(srcDir, entryPoint)],
      bundle: true,
      outfile: path.join(destDir, compiledEntryPoint(entryPoint)),
      watch: opts.watch ? {
        onRebuild: (error, result) => {
          console.log(`rebuilt ${entryPoint}`);
          const deps = entryPointDependencies.get(entryPoint);
          for (const dep of deps) {
            handleHTML(dep);
          }
        },
      } : false,
      format: 'esm',
      minify: true,
      target: 'es6',
      sourcemap: true,
    }));
  }

  Promise.all(esbuilds).then(() => {
    // cachebust compiled entry points
    const htmlEntryPoints = new Set();
    for (const points of entryPointDependencies.values()) {
      for (const point of points) {
        htmlEntryPoints.add(point);
      }
    }
    for (const point of htmlEntryPoints) {
      handleHTML(point);
    }
  });

  return results;
}

exports.compileToDir = compileToDir;
