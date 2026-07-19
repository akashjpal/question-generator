import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';

/**
 * Rewrites relative API URLs to absolute backend URLs during SSR.
 * Reads targets from env vars (same ones used by the Express proxy in server.ts).
 * Defaults match local dev; Docker/prod overrides via env vars.
 */
const SERVER_URL_MAP: Record<string, string> = {
  '/api':          process.env['API_URL']         || 'http://localhost:3000',
  '/reports-api':  process.env['REPORTS_API_URL']  || 'http://localhost:5082',
  '/attempt-api':  process.env['ATTEMPT_API_URL']  || 'http://localhost:5136',
  '/agent-api':    process.env['AGENT_API_URL']     || 'http://localhost:8010',
};

export const serverUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isPlatformServer(inject(PLATFORM_ID))) {
    return next(req);
  }

  // Only rewrite relative URLs (no host)
  if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
    return next(req);
  }

  for (const [prefix, internalBase] of Object.entries(SERVER_URL_MAP)) {
    if (req.url.startsWith(prefix)) {
      const rewritten = req.clone({
        url: internalBase + req.url.slice(prefix.length),
      });
      return next(rewritten);
    }
  }

  return next(req);
};
