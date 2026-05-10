import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { serverUrlInterceptor } from './server-url.interceptor';

function setupTestBed(platformId: string) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([serverUrlInterceptor])),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });
}

describe('serverUrlInterceptor', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  describe('browser platform', () => {
    it('should pass through relative /api URLs unchanged in the browser', () => {
      setupTestBed('browser');
      const httpClient = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      httpClient.get('/api/assessments').subscribe();

      const req = httpMock.expectOne('/api/assessments');
      expect(req.request.url).toBe('/api/assessments');
      req.flush({});
    });
  });

  describe('server platform (SSR)', () => {
    it('should rewrite /api/* to http://localhost:3000/* in SSR', () => {
      setupTestBed('server');
      const httpClient = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      httpClient.get('/api/assessments').subscribe();

      const req = httpMock.expectOne('http://localhost:3000/assessments');
      expect(req.request.url).toBe('http://localhost:3000/assessments');
      req.flush({});
    });

    it('should rewrite /reports-api/* to http://localhost:5082/* in SSR', () => {
      setupTestBed('server');
      const httpClient = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      httpClient.get('/reports-api/dashboard/stats').subscribe();

      const req = httpMock.expectOne('http://localhost:5082/dashboard/stats');
      expect(req.request.url).toBe('http://localhost:5082/dashboard/stats');
      req.flush({});
    });

    it('should pass through absolute HTTPS URLs even in SSR', () => {
      setupTestBed('server');
      const httpClient = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);

      httpClient.get('https://supabase.example.com/storage/v1/object').subscribe();

      const req = httpMock.expectOne('https://supabase.example.com/storage/v1/object');
      expect(req.request.url).toBe('https://supabase.example.com/storage/v1/object');
      req.flush({});
    });
  });
});
