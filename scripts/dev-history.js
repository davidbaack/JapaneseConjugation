import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export const DEV_HISTORY_PREFIX = '/__dev-history';
export const DEV_HISTORY_API_PREFIX = `${DEV_HISTORY_PREFIX}/api`;
export const DEV_HISTORY_PREVIEW_PREFIX = `${DEV_HISTORY_PREFIX}/preview`;

const LOG_FIELD = '\x1f';
const MAX_LOG_LIMIT = 100;
const DEFAULT_LOG_LIMIT = 30;
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function isValidCommitSha(value) {
  return SHA_RE.test(String(value || '').trim());
}

export function boundedLogLimit(value) {
  const limit = Number(value || DEFAULT_LOG_LIMIT);
  if (!Number.isFinite(limit)) return DEFAULT_LOG_LIMIT;
  return Math.max(1, Math.min(MAX_LOG_LIMIT, Math.round(limit)));
}

export function safeResolveUnder(parent, ...segments) {
  const root = path.resolve(parent);
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to use path outside ${root}`);
  }
  return resolved;
}

export function historyRootFor(projectRoot) {
  return safeResolveUnder(projectRoot, 'temp-vite', 'history');
}

export function previewUrlForSha(sha) {
  return `${DEV_HISTORY_PREVIEW_PREFIX}/${sha}/`;
}

export function parseGitLog(output, { headSha = '', dirty = false } = {}) {
  return String(output || '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, committedAt, relativeTime, refs, ...subjectParts] =
        line.split(LOG_FIELD);
      const subject = subjectParts.join(LOG_FIELD);
      return {
        sha,
        shortSha,
        committedAt,
        relativeTime,
        refs,
        subject,
        current: sha === headSha,
        dirty: dirty && sha === headSha,
      };
    });
}

export function previewStatusFromCache(projectRoot, sha) {
  const cacheRoot = safeResolveUnder(historyRootFor(projectRoot), sha);
  const distDir = safeResolveUnder(cacheRoot, 'dist');
  return {
    sha,
    previewUrl: previewUrlForSha(sha),
    cacheRoot,
    distDir,
    indexPath: safeResolveUnder(distDir, 'index.html'),
  };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const message = stderr.trim() || stdout.trim() || `${command} exited with ${code}`;
      reject(new Error(message));
    });
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function summarizeError(error) {
  return String(error?.message || error || 'Unknown error')
    .split(/\r?\n/)
    .slice(0, 8)
    .join('\n');
}

async function resolveCommitSha(projectRoot, sha) {
  if (!isValidCommitSha(sha)) {
    throw new Error('Expected a 7-40 character commit SHA.');
  }
  const { stdout } = await runCommand('git', ['rev-parse', '--verify', `${sha}^{commit}`], {
    cwd: projectRoot,
  });
  const fullSha = stdout.trim();
  if (!/^[0-9a-f]{40}$/i.test(fullSha)) {
    throw new Error(`Could not resolve commit ${sha}.`);
  }
  return fullSha.toLowerCase();
}

async function ensureNodeModulesLink(projectRoot, sourceDir) {
  const rootNodeModules = path.join(projectRoot, 'node_modules');
  const target = path.join(sourceDir, 'node_modules');
  if (await fileExists(target)) return;
  if (!(await fileExists(rootNodeModules))) {
    throw new Error('node_modules is missing. Run npm install before building history previews.');
  }
  await fs.symlink(rootNodeModules, target, process.platform === 'win32' ? 'junction' : 'dir');
}

async function extractCommit(projectRoot, sha, sourceDir, cacheRoot) {
  const archivePath = safeResolveUnder(cacheRoot, `${sha}.tar`);
  await fs.mkdir(sourceDir, { recursive: true });
  await runCommand('git', ['archive', '--format=tar', '-o', archivePath, sha], {
    cwd: projectRoot,
  });
  try {
    await runCommand('tar', ['-xf', archivePath, '-C', sourceDir], { cwd: projectRoot });
  } finally {
    await fs.rm(archivePath, { force: true });
  }
}

async function buildPreview(projectRoot, sha, sourceDir, distDir) {
  const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!(await fileExists(viteBin))) {
    throw new Error('Vite is missing from node_modules. Run npm install before building previews.');
  }
  await ensureNodeModulesLink(projectRoot, sourceDir);
  await runCommand(
    process.execPath,
    [viteBin, 'build', '--base', previewUrlForSha(sha), '--outDir', distDir, '--emptyOutDir'],
    {
      cwd: sourceDir,
      env: {
        ...process.env,
        DEV_HISTORY_PREVIEW: '1',
        NODE_ENV: 'production',
      },
    },
  );
}

export async function listDevHistoryRevisions(projectRoot, limit = DEFAULT_LOG_LIMIT) {
  const boundedLimit = boundedLogLimit(limit);
  const [{ stdout: logOutput }, { stdout: headOutput }, { stdout: statusOutput }] =
    await Promise.all([
      runCommand(
        'git',
        [
          'log',
          `-n${boundedLimit}`,
          '--date=iso-strict',
          `--pretty=format:%H${LOG_FIELD}%h${LOG_FIELD}%cI${LOG_FIELD}%cr${LOG_FIELD}%D${LOG_FIELD}%s`,
        ],
        { cwd: projectRoot },
      ),
      runCommand('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }),
      runCommand('git', ['status', '--porcelain'], { cwd: projectRoot }),
    ]);
  const headSha = headOutput.trim().toLowerCase();
  const dirty = statusOutput.trim().length > 0;
  return {
    dirty,
    generatedAt: new Date().toISOString(),
    headSha,
    revisions: parseGitLog(logOutput, { dirty, headSha }),
  };
}

export async function getPreviewStatus(projectRoot, sha) {
  const fullSha = await resolveCommitSha(projectRoot, sha);
  const status = previewStatusFromCache(projectRoot, fullSha);
  const ready = await fileExists(status.indexPath);
  let metadata = {};
  try {
    metadata = JSON.parse(
      await fs.readFile(safeResolveUnder(status.cacheRoot, 'metadata.json'), 'utf8'),
    );
  } catch {}
  return {
    ...metadata,
    sha: fullSha,
    previewUrl: status.previewUrl,
    status: ready ? 'ready' : metadata.status || 'missing',
  };
}

export async function ensureDevHistoryPreview(projectRoot, sha) {
  const fullSha = await resolveCommitSha(projectRoot, sha);
  const status = previewStatusFromCache(projectRoot, fullSha);
  const metadataPath = safeResolveUnder(status.cacheRoot, 'metadata.json');

  if (await fileExists(status.indexPath)) {
    return getPreviewStatus(projectRoot, fullSha);
  }

  await fs.rm(status.cacheRoot, { recursive: true, force: true });
  await fs.mkdir(status.cacheRoot, { recursive: true });

  const sourceDir = safeResolveUnder(status.cacheRoot, 'source');
  try {
    await fs.writeFile(
      metadataPath,
      JSON.stringify({ sha: fullSha, status: 'building', startedAt: new Date().toISOString() }),
    );
    await extractCommit(projectRoot, fullSha, sourceDir, status.cacheRoot);
    await buildPreview(projectRoot, fullSha, sourceDir, status.distDir);
    const metadata = {
      sha: fullSha,
      shortSha: fullSha.slice(0, 7),
      status: 'ready',
      previewUrl: status.previewUrl,
      builtAt: new Date().toISOString(),
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    return metadata;
  } catch (error) {
    const metadata = {
      sha: fullSha,
      shortSha: fullSha.slice(0, 7),
      status: 'error',
      error: summarizeError(error),
      failedAt: new Date().toISOString(),
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    throw error;
  }
}

function serveStaticPreview(projectRoot, req, res, url) {
  const match = url.pathname.match(/^\/__dev-history\/preview\/([0-9a-f]{40})\/?(.*)$/i);
  if (!match) return false;
  const [, sha, rawAssetPath] = match;
  const status = previewStatusFromCache(projectRoot, sha.toLowerCase());
  const assetPath = rawAssetPath ? decodeURIComponent(rawAssetPath) : 'index.html';
  const requestedPath = safeResolveUnder(status.distDir, assetPath);
  const hasExtension = path.extname(requestedPath).length > 0;

  Promise.resolve()
    .then(async () => {
      let filePath = requestedPath;
      if (!(await fileExists(filePath))) {
        filePath = hasExtension ? requestedPath : status.indexPath;
      }
      if (!(await fileExists(filePath))) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader(
        'Content-Type',
        CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      );
      createReadStream(filePath).pipe(res);
    })
    .catch((error) => sendJson(res, 500, { error: summarizeError(error) }));
  return true;
}

export function devHistoryPlugin(options = {}) {
  let projectRoot = options.root || process.cwd();
  const inFlightBuilds = new Map();

  return {
    name: 'katachiya-dev-history',
    apply: 'serve',
    configResolved(config) {
      projectRoot = options.root || config.root;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://dev.local');
        if (!url.pathname.startsWith(DEV_HISTORY_PREFIX)) {
          next();
          return;
        }

        if (serveStaticPreview(projectRoot, req, res, url)) return;

        Promise.resolve()
          .then(async () => {
            if (req.method === 'GET' && url.pathname === `${DEV_HISTORY_API_PREFIX}/revisions`) {
              const limit = boundedLogLimit(url.searchParams.get('limit'));
              sendJson(res, 200, await listDevHistoryRevisions(projectRoot, limit));
              return;
            }

            const statusMatch = url.pathname.match(
              /^\/__dev-history\/api\/previews\/([0-9a-f]{7,40})$/i,
            );
            if (req.method === 'GET' && statusMatch) {
              sendJson(res, 200, await getPreviewStatus(projectRoot, statusMatch[1]));
              return;
            }

            if (req.method === 'POST' && url.pathname === `${DEV_HISTORY_API_PREFIX}/previews`) {
              const body = await readRequestJson(req);
              const sha = String(body.sha || '').trim();
              const fullSha = await resolveCommitSha(projectRoot, sha);
              if (!inFlightBuilds.has(fullSha)) {
                inFlightBuilds.set(
                  fullSha,
                  ensureDevHistoryPreview(projectRoot, fullSha).finally(() =>
                    inFlightBuilds.delete(fullSha),
                  ),
                );
              }
              sendJson(res, 200, await inFlightBuilds.get(fullSha));
              return;
            }

            sendJson(res, 404, { error: 'Unknown dev-history route.' });
          })
          .catch((error) => sendJson(res, 500, { error: summarizeError(error) }));
      });
    },
  };
}
