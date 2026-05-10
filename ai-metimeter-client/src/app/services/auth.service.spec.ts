import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

// vi.hoisted() ensures these values are available inside the vi.mock() factory (which is hoisted before imports)
const mockSupabaseAuth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  resetPasswordForEmail: vi.fn(),
  onAuthStateChange: vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: mockSupabaseAuth })),
}));

describe('AuthService', () => {
  let service: AuthService;
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRouter = { navigate: vi.fn() };

    // Reset all Supabase auth mocks to clean state
    mockSupabaseAuth.signUp.mockReset();
    mockSupabaseAuth.signInWithPassword.mockReset();
    mockSupabaseAuth.signInWithOAuth.mockReset();
    mockSupabaseAuth.signOut.mockReset();
    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockSupabaseAuth.resetPasswordForEmail.mockReset();
    mockSupabaseAuth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    TestBed.configureTestingModule({
      providers: [AuthService, { provide: Router, useValue: mockRouter }],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isAuthenticated() returns false when no session is loaded', () => {
    expect(service.isAuthenticated()).toBe(false);
  });

  it('getCurrentUser() returns null before login', () => {
    expect(service.getCurrentUser()).toBeNull();
  });

  it('login() calls signInWithPassword and navigates to /dashboard', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'teacher@school.com',
      user_metadata: { full_name: 'Alice' },
    };
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    await service.login('teacher@school.com', 'secret');

    expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'teacher@school.com',
      password: 'secret',
    });
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('login() throws when Supabase returns an error', async () => {
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      data: null,
      error: new Error('Invalid login credentials'),
    });

    await expect(service.login('bad@email.com', 'wrong')).rejects.toThrow(
      'Invalid login credentials'
    );
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('logout() calls signOut and navigates to /auth/login', async () => {
    mockSupabaseAuth.signOut.mockResolvedValue({ error: null });

    await service.logout();

    expect(mockSupabaseAuth.signOut).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('getSession() returns the session from Supabase', async () => {
    const mockSession = { access_token: 'tok-xyz', user: { id: 'u1' } };
    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: mockSession } });

    const session = await service.getSession();

    expect(session).toEqual(mockSession);
  });

  it('getAccessToken() returns null when there is no active session', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({ data: { session: null } });

    const token = await service.getAccessToken();

    expect(token).toBeNull();
  });

  it('signup() throws when email is already registered (empty identities)', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', email: 'x@x.com', identities: [] }, session: null },
      error: null,
    });

    await expect(service.signup('Bob', 'x@x.com', 'pass')).rejects.toThrow(
      'User already registered'
    );
  });
});
