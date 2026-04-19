import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Backend URLs read from environment variables.
 * Defaults work for local dev; Docker/prod overrides via env vars.
 *
 * Local dev:  API_URL=http://localhost:3000
 * Docker:     API_URL=http://question-generator-api:3000
 */
const PROXY_ROUTES: { prefix: string; target: string; strip: boolean }[] = [
  {
    prefix: '/api',
    target: process.env['API_URL'] || 'http://localhost:3000',
    strip: true,   // /api/foo → /foo
  },
  {
    prefix: '/reports-api',
    target: process.env['REPORTS_API_URL'] || 'http://localhost:5082',
    strip: true,   // /reports-api/foo → /foo
  },
  {
    prefix: '/attempt-api',
    target: process.env['ATTEMPT_API_URL'] || 'http://localhost:5136',
    strip: true,   // /attempt-api/foo → /foo
  },
];

/**
 * Lightweight reverse proxy using Node built-in http module.
 * No external dependencies required.
 */
function setupProxy(expressApp: express.Express) {
  for (const route of PROXY_ROUTES) {
    expressApp.use(route.prefix, (req, res) => {
      const targetPath = route.strip
        ? req.originalUrl.slice(route.prefix.length) || '/'
        : req.originalUrl;

      const targetUrl = new URL(targetPath, route.target);

      const proxyReq = httpRequest(
        targetUrl,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: targetUrl.host,
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 500, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        },
      );

      proxyReq.on('error', (err) => {
        console.error(`Proxy error [${route.prefix}]:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Bad Gateway', detail: err.message });
        }
      });

      req.pipe(proxyReq, { end: true });
    });
  }
}

/**
 * API proxy — must be registered BEFORE static files and Angular handler
 */
setupProxy(app);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
