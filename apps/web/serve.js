const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = path.join(__dirname, 'dist');
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://orchestrator:3001';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'content-type': mime, 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(data);
  } catch {
    // SPA fallback
    const index = fs.readFileSync(path.join(STATIC_DIR, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-cache' });
    res.end(index);
  }
}

async function proxyToOrchestrator(req, res) {
  const targetPath = req.url.replace(/^\/api/, '');
  const targetUrl = `${ORCHESTRATOR_URL}${targetPath}`;

  try {
    const headers = { ...req.headers, host: new URL(ORCHESTRATOR_URL).host };
    delete headers['connection'];

    const fetchOpts = {
      method: req.method,
      headers,
    };

    // Forward body for non-GET requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      fetchOpts.body = Buffer.concat(chunks);
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    // Check if this is an SSE response
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      res.writeHead(upstream.status, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
      });

      const reader = upstream.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch {
          // Client disconnected
        } finally {
          res.end();
        }
      };
      pump();

      req.on('close', () => {
        reader.cancel().catch(() => {});
      });
      return;
    }

    // Regular response
    const respHeaders = {};
    upstream.headers.forEach((v, k) => { respHeaders[k] = v; });
    res.writeHead(upstream.status, respHeaders);
    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  // API proxy
  if (req.url.startsWith('/api/') || req.url === '/api') {
    return proxyToOrchestrator(req, res);
  }

  // Static files
  const safePath = path.normalize(req.url.split('?')[0]);
  const filePath = path.join(STATIC_DIR, safePath);

  // Security: ensure we don't serve files outside STATIC_DIR
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`obsLab web serving on 0.0.0.0:${PORT}`);
});
