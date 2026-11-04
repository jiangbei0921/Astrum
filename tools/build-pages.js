/* ASTRUM · GitHub Pages 发布目录构建（零依赖）
 *
 * 目的：把运行所需的静态文件白名单复制到 `_site/`，供 GitHub Pages Actions
 *       以 artifact 方式发布；避免把 tools/、docs/、dev/、worker/ 等开发文件
 *       暴露到公开站点。
 *
 * 不重复实现 standalone：单文件产物仍由 tools/build-standalone.js 负责，
 * 本脚本只负责多文件发布目录。
 *
 * 用法：node tools/build-pages.js
 * 输出：_site/（已 gitignore）
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, '_site');
var INDEX = path.join(ROOT, 'index.html');

var ROOT_FILES = ['index.html', 'privacy.html', '.nojekyll'];
var RUNTIME_DIRS = ['assets', 'core', 'data'];

/* 真实密钥形态；只匹配足以判定为凭据的长字符串，避免把字段名当密钥。 */
var SECRET_RULES = [
 { name: 'OpenAI/通用 sk-', re: /sk-[A-Za-z0-9_-]{20,}/ },
 { name: 'GitHub ghp_', re: /ghp_[A-Za-z0-9]{20,}/ },
 { name: 'GitHub fine-grained PAT', re: /github_pat_[A-Za-z0-9_]{20,}/ },
 { name: 'Google API Key', re: /AIza[0-9A-Za-z_-]{30,}/ },
 { name: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
 { name: 'Slack Token', re: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
 { name: '私钥块', re: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/ },
 { name: 'Bearer 凭据', re: /Bearer\s+[A-Za-z0-9._-]{20,}/ }
];

var ABS_RULES = [
 { name: 'Windows 用户路径', re: /[A-Za-z]:\\Users\\/ },
 { name: 'Windows 项目绝对路径', re: /[A-Za-z]:\\Projects\\/ },
 { name: 'file:// 绝对路径', re: /file:\/\/\/[A-Za-z]:/ },
 { name: 'Unix 用户绝对路径', re: /\/home\/[A-Za-z0-9._-]+\// },
 { name: 'macOS 用户绝对路径', re: /\/Users\/[A-Za-z0-9._-]+\// }
];

function fail(msg) {
  throw new Error('[pages] ' + msg);
}

function readIndexRefs() {
  var html = fs.readFileSync(INDEX, 'utf8');
  var refs = [];
  var re = /<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g, m;
  while ((m = re.exec(html))) refs.push({ kind: 'script', rel: m[1] });
  var link = /<link\s+rel="stylesheet"\s+href="([^"]+)"/g;
  while ((m = link.exec(html))) refs.push({ kind: 'style', rel: m[1] });
  return refs;
}

/* GitHub Pages 在 Linux 上区分大小写；Windows 开发机不区分。
   逐段用 readdir 的原始文件名比对，提前发现只在 Windows 能通过的引用。 */
function exactPathExists(rel) {
  var parts = rel.split('/');
  var cur = ROOT;
  for (var i = 0; i < parts.length; i++) {
    var names;
    try { names = fs.readdirSync(cur); } catch (e) { return false; }
    if (names.indexOf(parts[i]) < 0) return false;
    cur = path.join(cur, parts[i]);
  }
  return fs.existsSync(cur);
}

function validateRefs(refs) {
  var seen = {};
  refs.forEach(function (r) {
    var rel = r.rel;
    if (seen[rel]) return;
    seen[rel] = true;
    if (/^\/|^[A-Za-z]:\\|^https?:|^#|^data:|\\/.test(rel) || /\.\.\//.test(rel)) {
      fail('资源引用不是安全相对路径: ' + rel);
    }
    if (r.kind === 'script' && !/^(core|data)\/[A-Za-z0-9._-]+\.js$/.test(rel)) {
      fail('脚本路径不在 core/data 白名单: ' + rel);
    }
    if (r.kind === 'style' && !/^assets\/[A-Za-z0-9._-]+\.css$/.test(rel)) {
      fail('样式路径不在 assets 白名单: ' + rel);
    }
    if (!exactPathExists(rel)) {
      fail('资源不存在或大小写不匹配: ' + rel);
    }
  });
  return Object.keys(seen);
}

function copyDir(rel) {
  var src = path.join(ROOT, rel);
  var dst = path.join(OUT, rel);
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).sort(function (a, b) {
    return a.name < b.name ? -1 : 1;
  }).forEach(function (e) {
    var childRel = rel + '/' + e.name;
    if (e.isSymbolicLink()) fail('发布目录不允许符号链接: ' + childRel);
    if (e.isDirectory()) {
      copyDir(childRel);
      return;
    }
    if (!e.isFile()) fail('发布目录只允许普通文件: ' + childRel);
    fs.copyFileSync(path.join(ROOT, childRel), path.join(OUT, childRel));
  });
}

function walk(dir, base, out) {
  base = base || '';
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).sort(function (a, b) {
    return a.name < b.name ? -1 : 1;
  }).forEach(function (e) {
    var rel = base ? base + '/' + e.name : e.name;
    var full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, rel, out);
    else out.push({ rel: rel, full: full, size: fs.statSync(full).size });
  });
  return out;
}

function mask(s) {
  if (!s) return '';
  return s.slice(0, 6) + '…(' + s.length + ')';
}

function scanFiles(files) {
  var secrets = [], abs = [];
  files.forEach(function (f) {
    if (!/\.(html|js|css|json|md|txt)$/.test(f.rel) && f.rel !== '.nojekyll') return;
    var text;
    try { text = fs.readFileSync(f.full, 'utf8'); } catch (e) { return; }
    var lines = text.split(/\r?\n/);
    SECRET_RULES.forEach(function (rule) {
      for (var i = 0; i < lines.length; i++) {
        var m = rule.re.exec(lines[i]);
        if (m) secrets.push({ rel: f.rel, line: i + 1, rule: rule.name, sample: mask(m[0]) });
      }
    });
    ABS_RULES.forEach(function (rule) {
      for (var j = 0; j < lines.length; j++) {
        if (rule.re.test(lines[j])) abs.push({ rel: f.rel, line: j + 1, rule: rule.name });
      }
    });
  });
  return { secrets: secrets, abs: abs };
}

function git(args) {
  try {
    return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim();
  } catch (e) { return null; }
}

function readAppVersion() {
  try {
    var app = fs.readFileSync(path.join(ROOT, 'core/app.js'), 'utf8');
    var m = app.match(/var APP_VERSION\s*=\s*'([^']+)'/);
    return m ? m[1] : null;
  } catch (e) { return null; }
}

function normalizeRepo(url) {
  if (!url) return null;
  return url.replace(/^git@github\.com:/, 'https://github.com/').replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
}

function buildVersion() {
  var commit = process.env.BUILD_COMMIT || process.env.GITHUB_SHA || git(['rev-parse', 'HEAD']);
  var status = git(['status', '--porcelain']);
  var dirty = status == null ? null : status.length > 0;
  var repo = process.env.GITHUB_REPOSITORY || normalizeRepo(git(['remote', 'get-url', 'origin']));
  return {
    app: 'ASTRUM',
    appVersion: readAppVersion(),
    releaseVersion: 'V1.4',
    featureVersion: 'V1.14',
    buildTime: new Date().toISOString(),
    buildMode: 'static-pages',
    deployEnv: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local',
    repository: repo || null,
    commit: commit || null,
    commitShort: commit ? commit.slice(0, 7) : null,
    dirty: dirty,
    branch: process.env.GITHUB_REF_NAME || git(['branch', '--show-current']) || null,
    runId: process.env.GITHUB_RUN_ID || null,
    features: ['V1', 'V1.1', 'V1.2', 'V1.3', 'V1.4', 'V1.5', 'V1.6', 'V1.7', 'V1.8', 'V1.9', 'V1.10', 'V1.11', 'V1.12', 'V1.13', 'V1.14']
  };
}

function verifyTopLevel() {
  var names = fs.readdirSync(OUT).sort();
  var allowed = ROOT_FILES.concat(RUNTIME_DIRS, ['version.json']).sort();
  if (JSON.stringify(names) !== JSON.stringify(allowed)) {
    fail('发布目录顶层不在白名单: ' + JSON.stringify(names));
  }
  ['tools', 'docs', 'dev', 'worker', 'astrum-standalone.html'].forEach(function (bad) {
    if (fs.existsSync(path.join(OUT, bad))) fail('发布目录包含开发文件: ' + bad);
  });
}

function main() {
  if (!fs.existsSync(INDEX)) fail('缺少 index.html');

  var refs = readIndexRefs();
  if (refs.length < 40) fail('入口脚本数量异常: ' + refs.length);
  var uniqueRefs = validateRefs(refs);
  if (!uniqueRefs.length) fail('未发现任何可发布资源');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  ROOT_FILES.forEach(function (rel) {
    var src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) fail('缺少运行文件: ' + rel);
    if (rel === 'index.html') {
      /* 线上 53 个外部脚本串行阻塞，跨区访问时首屏会被逐个请求拖慢；
       * 仅在 Pages 产物里加 defer，并行下载且保持执行顺序。
       * 源码保持阻塞加载，file:// 与 CI selftest 行为不变。 */
      var html = fs.readFileSync(src, 'utf8').replace(
        /<script src="([^"]+)"><\/script>/g,
        '<script defer src="$1"></script>'
      );
      fs.writeFileSync(path.join(OUT, rel), html, 'utf8');
    } else {
      fs.copyFileSync(src, path.join(OUT, rel));
    }
  });
  RUNTIME_DIRS.forEach(copyDir);

  var version = buildVersion();
  fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify(version, null, 2) + '\n', 'utf8');

  verifyTopLevel();

  var files = walk(OUT);
  var scan = scanFiles(files);
  if (scan.secrets.length) {
    scan.secrets.forEach(function (s) {
      console.error('[pages] 疑似密钥: ' + s.rel + ':' + s.line + ' ' + s.rule + ' ' + s.sample);
    });
    fail('发布目录疑似包含密钥，已停止构建');
  }
  if (scan.abs.length) {
    scan.abs.forEach(function (a) {
      console.error('[pages] 绝对路径: ' + a.rel + ':' + a.line + ' ' + a.rule);
    });
    fail('发布目录包含本地绝对路径，已停止构建');
  }

  var total = files.reduce(function (n, f) { return n + f.size; }, 0);
  var coreCount = files.filter(function (f) { return f.rel.indexOf('core/') === 0; }).length;
  var dataCount = files.filter(function (f) { return f.rel.indexOf('data/') === 0; }).length;

  console.log('[astrum] Pages 发布目录构建完成');
  console.log('  输出: ' + OUT);
  console.log('  文件: ' + files.length + ' 个（core ' + coreCount + ' / data ' + dataCount + '）');
  console.log('  体积: ' + (total / 1024).toFixed(0) + ' KB（' + total + ' B）');
  console.log('  资源引用: ' + uniqueRefs.length + ' 个，全部存在且大小写一致');
  console.log('  版本: ' + version.releaseVersion + ' / app ' + (version.appVersion || '?') +
    ' / commit ' + (version.commitShort || 'unknown') + ' / dirty=' + String(version.dirty));
  console.log('  安全: 密钥 0，本地绝对路径 0');

  return { out: OUT, files: files, bytes: total, version: version, refs: uniqueRefs };
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e && e.message || e);
    process.exit(1);
  }
}

module.exports = {
  build: main,
  validateRefs: validateRefs,
  scanFiles: scanFiles,
  exactPathExists: exactPathExists
};
