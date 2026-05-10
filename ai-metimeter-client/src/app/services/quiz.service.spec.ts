import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QuizService } from './quiz.service';
import type { QuizSession, StudentQuestion, SubmitQuizResponse, StudentResult, Answer } from '../models';

describe('QuizService', () => {
  let service: QuizService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [QuizService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuizService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('joinQuiz() should POST code and studentName to /api/quiz/join', () => {
    const mockSession: QuizSession = {
      sessionId: 'sess-1',
      assessmentId: 'assess-1',
      assessmentTitle: 'Math Quiz',
      subject: 'Math',
      questionsCount: 10,
      startedAt: new Date().toISOString(),
    };

    service.joinQuiz('ABC123', 'Alice', 'alice@school.com').subscribe(res =>
      expect(res).toEqual(mockSession)
    );

    const req = httpMock.expectOne('/api/quiz/join');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      code: 'ABC123',
      studentName: 'Alice',
      studentEmail: 'alice@school.com',
    });
    req.flush(mockSession);
  });

  it('getQuestions() should GET questions for a session', () => {
    const mockQuestions: StudentQuestion[] = [
      { id: 'q1', text: 'What is 2+2?', options: [{ id: 'o1', text: '4' }] },
    ];

    service.getQuestions('sess-1').subscribe(res => expect(res).toEqual(mockQuestions));

    const req = httpMock.expectOne('/api/quiz/sess-1/questions');
    expect(req.request.method).toBe('GET');
    req.flush(mockQuestions);
  });

  it('submitQuiz() should POST answers formatted correctly', () => {
    const answers: Answer[] = [
      { questionId: 'q1', selectedOptionIndex: 2 },
      { questionId: 'q2', selectedOptionIndex: 0 },
    ];
    const mockResponse: SubmitQuizResponse = {
      result: {} as StudentResult,
      correctAnswers: [],
    };

    service.submitQuiz('sess-1', answers).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/quiz/submit');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sessionId: 'sess-1',
      answers: [
        { questionId: 'q1', selectedOptionIndex: 2 },
        { questionId: 'q2', selectedOptionIndex: 0 },
      ],
    });
    req.flush(mockResponse);
  });

  it('getResult() should GET result for a session', () => {
    const mockResult: StudentResult = {
      id: 'r1',
      assessmentId: 'a1',
      studentName: 'Alice',
      score: 80,
      totalPoints: 100,
      percentage: 80,
      correctAnswers: 8,
      totalQuestions: 10,
      timeTakenSeconds: 300,
      submittedAt: new Date().toISOString(),
    };

    service.getResult('sess-1').subscribe(res => expect(res).toEqual(mockResult));

    const req = httpMock.expectOne('/api/quiz/sess-1/result');
    expect(req.request.method).toBe('GET');
    req.flush(mockResult);
  });

  describe('validateCode()', () => {
    it('should return true for a valid 6-char alphanumeric code', () => {
      expect(service.validateCode('ABC123')).toBe(true);
      expect(service.validateCode('abcdef')).toBe(true);
      expect(service.validateCode('123456')).toBe(true);
    });

    it('should return false for invalid codes', () => {
      expect(service.validateCode('ABC12')).toBe(false);   // 5 chars
      expect(service.validateCode('ABC1234')).toBe(false); // 7 chars
      expect(service.validateCode('ABC-12')).toBe(false);  // special char
      expect(service.validateCode('')).toBe(false);        // empty
    });
  });
});
