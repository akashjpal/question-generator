import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssessmentService } from './assessment.service';
import { environment } from '../../environments/environment';
import type { Assessment, CreateAssessmentRequest, GenerationStatusResponse, PaginatedResponse, AssessmentSummary } from '../models';

const API_URL = `${environment.questionGeneratorApiUrl}/api/assessments`;

describe('AssessmentService', () => {
  let service: AssessmentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AssessmentService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssessmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('generateAssessment() should POST FormData to /generate', () => {
    const request: CreateAssessmentRequest = {
      title: 'Test Quiz',
      subject: 'Math',
      topic: 'Algebra',
      difficulty: 'medium',
      questionsCount: 5,
    };
    const mockResponse = { assessment: {} as Assessment, generatedQuestions: [] };

    service.generateAssessment(request).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(`${API_URL}/generate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect(req.request.body.get('title')).toBe('Test Quiz');
    expect(req.request.body.get('questionsCount')).toBe('5');
    req.flush(mockResponse);
  });

  it('generateAssessment() should append file to FormData when provided', () => {
    const request: CreateAssessmentRequest = {
      title: 'Quiz',
      subject: 'Science',
      topic: 'Physics',
      difficulty: 'hard',
      questionsCount: 10,
    };
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

    service.generateAssessment(request, file).subscribe();

    const req = httpMock.expectOne(`${API_URL}/generate`);
    expect(req.request.body.get('file')).toBeTruthy();
    req.flush({});
  });

  it('getAssessments() should GET with status query param', () => {
    const mockPaged: PaginatedResponse<AssessmentSummary> = {
      success: true,
      data: [],
      pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    };

    service.getAssessments({ status: 'published', page: 1, limit: 10 }).subscribe(res =>
      expect(res).toEqual(mockPaged)
    );

    const req = httpMock.expectOne(r => r.url === API_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('published');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(mockPaged);
  });

  it('getAssessment() should GET by id and unwrap .assessment', () => {
    const mockAssessment = { id: 42, title: 'My Quiz' } as Assessment;

    service.getAssessment('42').subscribe(res => expect(res).toEqual(mockAssessment));

    const req = httpMock.expectOne(`${API_URL}/42`);
    expect(req.request.method).toBe('GET');
    req.flush({ assessment: mockAssessment });
  });

  it('updateAssessment() should PUT to /:id', () => {
    const data = { id: 1, title: 'Updated' } as Assessment;

    service.updateAssessment(1, data).subscribe(res => expect(res).toEqual(data));

    const req = httpMock.expectOne(`${API_URL}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(data);
    req.flush(data);
  });

  it('deleteAssessment() should DELETE /:id', () => {
    service.deleteAssessment('5').subscribe(res => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${API_URL}/5`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });

  it('publishAssessment() should POST to /:id/publish with timeLimit', () => {
    const mockResult = { id: 1, code: 'ABC123' } as Assessment;

    service.publishAssessment('1', 30).subscribe(res => expect(res).toEqual(mockResult));

    const req = httpMock.expectOne(`${API_URL}/1/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ timeLimit: 30 });
    req.flush(mockResult);
  });

  it('unpublishAssessment() should POST to /:id/unpublish', () => {
    service.unpublishAssessment('2').subscribe();

    const req = httpMock.expectOne(`${API_URL}/2/unpublish`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('saveAssessmentDraft() should POST to /update-assessment', () => {
    const draft = { id: 0, title: 'Draft' } as Assessment;
    const mockResponse = { message: 'Saved', data: [{ id: 99 }] };

    service.saveAssessmentDraft(draft).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(`${environment.questionGeneratorApiUrl}/update-assessment`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ assessment: draft });
    req.flush(mockResponse);
  });

  it('pollGenerationStatus() should emit and complete when status is 2', () => {
    vi.useFakeTimers();
    const jobId = 'job-abc';
    const completedResponse: GenerationStatusResponse = { jobId, status: 2, message: 'Done' };

    return new Promise<void>(resolve => {
      service.pollGenerationStatus(jobId).subscribe({
        next: res => expect(res.status).toBe(2),
        complete: () => {
          vi.useRealTimers();
          resolve();
        },
      });

      // Advance fake clock so timer(0, 2000) fires its first emission
      vi.advanceTimersByTime(0);
      httpMock
        .expectOne(`${environment.questionGeneratorApiUrl}/generate-questions-status/${jobId}`)
        .flush(completedResponse);
    });
  });
});
