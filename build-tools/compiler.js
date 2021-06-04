/**
 * Tiny wrapper around babel/core to do most of the things babel-cli does,
 * plus incremental compilation
 *
 * Adds one option in addition to babel's built-in options: `incremental`
 *
 * Heavily copied from `babel-cli`: https://github.com/babel/babel/tree/main/packages/babel-cli
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license MIT
 */
'use strict';

const babel = require('@babel/core');
const fs = require('fs');
const path = require('path');
const sourceMap = require('source-map');

const VERBOSE = false;

function outputFileSync(filePath, res, opts) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});

  // we've requested explicit sourcemaps to be written to disk
  if (
    res.map &&
    opts.sourceMaps &&
    opts.sourceMaps !== "inline"
  ) {
    const mapLoc = filePath + ".map";
    res.code += "\n//# sourceMappingURL=" + path.basename(mapLoc);
    res.map.file = path.basename(filePath);
    fs.writeFileSync(mapLoc, JSON.stringify(res.map));
  }

  fs.writeFileSync(filePath, res.code);
}

function slash(path) {
  const isExtendedLengthPath = /^\\\\\?\\/.test(path);
  const hasNonAscii = /[^\u0000-\u0080]+/.test(path);

  if (isExtendedLengthPath || hasNonAscii) {
    return path;
  }

  return path.replace(/\\/g, '/');
}

function combineResults(fileResults, sourceMapOptions, opts) {
  let map = null;
  if (fileResults.some(result => result?.map)) {
    map = new sourceMap.SourceMapGenerator(sourceMapOptions);
  }

  let code = "";
  let offset = 0;

  for (const result of fileResults) {
    if (!result) continue;

    code += result.code + "\n";

    if (result.map) {
      const consumer = new sourceMap.SourceMapConsumer(result.map);
      const sources = new Set();

      consumer.eachMapping(function (mapping) {
        if (mapping.source != null) sources.add(mapping.source);

        map.addMapping({
          generated: {
            line: mapping.generatedLine + offset,
            column: mapping.generatedColumn,
          },
          source: mapping.source,
          original:
            mapping.source == null
              ? null
              : {
                  line: mapping.originalLine,
                  column: mapping.originalColumn,
                },
        });
      });

      for (const source of sources) {
        const content = consumer.sourceContentFor(source, true);
        if (content !== null) {
          map.setSourceContent(source, content);
        }
      }

      offset = code.split("\n").length - 1;
    }
  }

  if (opts.sourceMaps === "inline") {
    const json = JSON.stringify(map);
    const base64 = Buffer.from(json, 'utf8').toString('base64');
    code += "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," + base64;
  }

  return {
    map: map,
    code: code,
  };
}

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
  const babelOpts = {...opts};
  delete babelOpts.incremental;
  delete babelOpts.watch;

  function handleFile(src, base) {
    let relative = path.relative(base, src);

    if (!relative.endsWith('.ts') && !relative.endsWith('.tsx')) {
      const dest = path.join(destDir, relative);
      if (opts.incremental && noRebuildNeeded(src, dest)) return 0;
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, fs.statSync(src).mode);
      return 1;
    }
    if (relative.endsWith('.d.ts')) return 0;

    relative = relative.slice(0, relative.endsWith('.tsx') ? -4 : -3) + '.js';

    const dest = path.join(destDir, relative);

    if (opts.incremental && noRebuildNeeded(src, dest)) return 0;

    const res = babel.transformFileSync(src, {
      ...babelOpts,
      sourceFileName: slash(path.relative(dest + "/..", src)),
    });

    if (!res) return 0;

    outputFileSync(dest, res, opts);
    fs.chmodSync(dest, fs.statSync(src).mode);

    if (VERBOSE) {
      console.log(src + " -> " + dest);
    }

    return 1;
  }

  function handle(src, base) {
    const stat = fs.statSync(src, {throwIfNoEntry: false});

    if (!stat) return 0;

    if (stat.isDirectory()) {
      if (!base) base = src;

      let count = 0;

      const files = fs.readdirSync(src);
      for (const filename of files) {
        if (filename.startsWith('.')) continue;

        const srcFile = path.join(src, filename);

        count += handle(srcFile, base);
      }

      return count;
    } else {
      if (!base) base = path.dirname(src);
      return handleFile(src, base);
    }
  }

  let total = 0;
  fs.mkdirSync(destDir, {recursive: true});
  const srcDirs = typeof srcDir === 'string' ? [srcDir] : srcDir;
  for (const dir of srcDirs) total += handle(dir);

  if (opts.watch) {
    const chokidar = require('chokidar');

    for (const dir of srcDirs) {
      const watcher = chokidar.watch(dir, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 50,
          pollInterval: 10,
        },
      });
  
      for (const type of ["add", "change"]) {
        watcher.on(type, (filepath) => {
          let updated;
          try {
            updated = handleFile(filepath, dir);
          } catch (err) {
            console.error(err);
          }
          if (updated) console.log(`Updated ${filepath}`);
        });
      }
    }
  }

  return total;
}

function compileToFile(srcFile, destFile, opts) {
  const babelOpts = {...opts};
  delete babelOpts.incremental;
  delete babelOpts.watch;

  const srcFiles = typeof srcFile === 'string' ? [srcFile] : srcFile;

  if (opts.incremental && srcFiles.every(src => noRebuildNeeded(src, destFile))) {
    return 0;
  }

  const results = [];

  for (const src of srcFiles) {
    if (!fs.existsSync(src)) continue;

    const res = babel.transformFileSync(src, babelOpts);

    if (res) results.push(res);

    if (VERBOSE) console.log(src + " ->");
  }

  const combined = combineResults(results, {
    file: path.basename(destFile),
    sourceRoot: opts.sourceRoot,
  }, opts);
  outputFileSync(destFile, combined, opts);

  if (VERBOSE) console.log("-> " + destFile);
  return results.length;
}

exports.compileToDir = compileToDir;

exports.compileToFile = compileToFile;
