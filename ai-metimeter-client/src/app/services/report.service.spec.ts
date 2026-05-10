import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportService } from './report.service';
import { environment } from '../../environments/environment';
import type { AssessmentStats, DashboardStats, AssessmentResult } from '../models';
import { AttemptStatus } from '../pages/attempt/attempt';

describe('ReportService', () => {
  let service: ReportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ReportService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAssessmentStats() should GET stats for an assessment', () => {
    const mockStats: AssessmentStats = {
      assessmentId: 'a1',
      totalParticipants: 30,
      completedCount: 25,
      averageScore: 72,
      highestScore: 100,
      lowestScore: 40,
      averageTimeSeconds: 420,
      completionRate: 83,
      questionStats: [],
    };

    service.getAssessmentStats('a1').subscribe(res => expect(res).toEqual(mockStats));

    const req = httpMock.expectOne('/api/assessments/a1/stats');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
  });

  it('getStudentResults() should GET paginated results with query params', () => {
    service
      .getStudentResults('a1', { page: 2, limit: 5, sortBy: 'score', sortOrder: 'desc' })
      .subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/assessments/a1/results');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('sortBy')).toBe('score');
    req.flush({ success: true, data: [], pagination: {} });
  });

  it('getDashboardStats() should GET from the ReportsAPI URL', () => {
    const mockDashboard: DashboardStats = {
      totalAssessments: 10,
      totalParticipants: 100,
      averagePerformance: 75,
      completionRate: 90,
      recentActivity: [],
    };

    service.getDashboardStats().subscribe(res => expect(res).toEqual(mockDashboard));

    const req = httpMock.expectOne(`${environment.reportsApiUrl}/api/dashboard/stats`);
    expect(req.request.method).toBe('GET');
    req.flush(mockDashboard);
  });

  it('exportResultsCsv() should GET response as Blob', () => {
    service.exportResultsCsv('a1').subscribe(blob => {
      expect(blob instanceof Blob).toBe(true);
    });

    const req = httpMock.expectOne('/api/assessments/a1/export/csv');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['id,score'], { type: 'text/csv' }));
  });

  it('submitQuiz() should POST to the AttemptAPI URL', () => {
    const result: AssessmentResult = {
      id: 7,
      participantUniqueCode: 'STU-001',
      answers: [1, 2, 0],
      flaggedQuestions: [],
      score: 3,
      timeTaken: 200,
      timeLimit: 600,
      attemptStatus: AttemptStatus.COMPLETED,
      totalScore: 10,
    };

    service.submitQuiz('a1', { ...result }).subscribe(res => expect(res).toBeTruthy());

    const req = httpMock.expectOne(`${environment.attemptApiUrl}/api/attempts/submit`);
    expect(req.request.method).toBe('POST');
    req.flush(result);
  });
});
