import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

/**
 * Automatically attaches the Supabase Bearer token to every outgoing
 * request that targets the Question Generator API.
 * Skips Supabase, Reports, and Attempt API calls — they handle auth separately.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiRequest =
    req.url.includes(environment.questionGeneratorApiUrl) ||
    req.url.startsWith('/api');

  if (!isApiRequest) {
    return next(req);
  }

  const authService = inject(AuthService);

  return from(authService.getAccessToken()).pipe(
    switchMap(token => {
      if (!token) {
        return next(req);
      }
      const authReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      return next(authReq);
    })
  );
};
