import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Auth-gated: session lives in browser localStorage only, so the route guard can
  // never see it during SSR — server-rendering these forces every hard navigation
  // back to /auth/login even with a valid session. No SEO value behind a login wall.
  {
    path: 'dashboard/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'attempt/**',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Server
  }
];
