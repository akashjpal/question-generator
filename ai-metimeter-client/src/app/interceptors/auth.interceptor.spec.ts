import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let mockAuthService: { getAccessToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuthService = { getAccessToken: vi.fn().mockResolvedValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should pass through non-API requests without adding an Authorization header', async () => {
    // Non-API URL — interceptor takes the synchronous path and calls next(req) directly
    mockAuthService.getAccessToken.mockResolvedValue('some-token');

    let completed = false;
    httpClient.get('https://external.example.com/data').subscribe(() => (completed = true));

    const req = httpMock.expectOne('https://external.example.com/data');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should attach Bearer token to /api requests when token is available', async () => {
    mockAuthService.getAccessToken.mockResolvedValue('jwt-token-abc');

    httpClient.get('/api/assessments').subscribe();

    // Flush the microtask queue so the getAccessToken() Promise resolves
    await Promise.resolve();

    const req = httpMock.expectOne('/api/assessments');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-token-abc');
    req.flush({});
  });

  it('should not add Authorization header when getAccessToken returns null', async () => {
    mockAuthService.getAccessToken.mockResolvedValue(null);

    httpClient.get('/api/assessments').subscribe();

    await Promise.resolve();

    const req = httpMock.expectOne('/api/assessments');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should attach Bearer token to requests targeting the question generator API URL', async () => {
    mockAuthService.getAccessToken.mockResolvedValue('gen-api-token');

    // environment.questionGeneratorApiUrl = 'http://localhost:3000'
    httpClient.get('http://localhost:3000/api/generate').subscribe();

    await Promise.resolve();

    const req = httpMock.expectOne('http://localhost:3000/api/generate');
    expect(req.request.headers.get('Authorization')).toBe('Bearer gen-api-token');
    req.flush({});
  });
});
