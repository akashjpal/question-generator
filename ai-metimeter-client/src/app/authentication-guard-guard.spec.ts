import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { authenticationGuardGuard } from './authentication-guard-guard';
import { AuthService } from './services/auth.service';

describe('authenticationGuardGuard', () => {
  let mockAuthService: { getSession: ReturnType<typeof vi.fn> };
  let mockRouter: { createUrlTree: ReturnType<typeof vi.fn> };

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authenticationGuardGuard(...guardParameters));

  beforeEach(() => {
    mockAuthService = { getSession: vi.fn() };
    mockRouter = {
      createUrlTree: vi.fn().mockReturnValue({ toString: () => '/auth/login' } as UrlTree),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should return true when a valid session exists', async () => {
    mockAuthService.getSession.mockResolvedValue({ access_token: 'tok', user: { id: 'u1' } });

    const result = await executeGuard({} as any, {} as any);

    expect(result).toBe(true);
    expect(mockRouter.createUrlTree).not.toHaveBeenCalled();
  });

  it('should return a UrlTree to /auth/login when session is null', async () => {
    mockAuthService.getSession.mockResolvedValue(null);

    const result = await executeGuard({} as any, {} as any);

    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/auth/login']);
    expect(result).not.toBe(true);
  });

  it('should redirect unauthenticated user to /auth/login', async () => {
    mockAuthService.getSession.mockResolvedValue(null);

    const result = await executeGuard({} as any, {} as any);

    // A UrlTree is returned (not `true`), indicating a redirect
    expect(typeof result).not.toBe('boolean');
  });
});
