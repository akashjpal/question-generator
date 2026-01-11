import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    JoinQuizRequest,
    QuizSession,
    StudentQuestion,
    SubmitQuizRequest,
    SubmitQuizResponse,
    StudentResult,
    Answer
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class QuizService {
    private readonly API_URL = '/api/quiz';

    constructor(private http: HttpClient) { }

    /**
     * POST /api/quiz/join
     * Join a quiz session using a 6-digit code
     */
    joinQuiz(code: string, studentName: string, studentEmail?: string): Observable<QuizSession> {
        const request: JoinQuizRequest = { code, studentName, studentEmail };
        return this.http.post<QuizSession>(`${this.API_URL}/join`, request);
    }

    /**
     * GET /api/quiz/:sessionId/questions
     * Fetch questions for the quiz session (without correct answers)
     */
    getQuestions(sessionId: string): Observable<StudentQuestion[]> {
        return this.http.get<StudentQuestion[]>(`${this.API_URL}/${sessionId}/questions`);
    }

    /**
     * POST /api/quiz/submit
     * Submit quiz answers and receive results
     */
    submitQuiz(sessionId: string, answers: Answer[]): Observable<SubmitQuizResponse> {
        const request: SubmitQuizRequest = {
            sessionId,
            answers: answers.map(a => ({
                questionId: a.questionId,
                selectedOptionIndex: a.selectedOptionIndex
            }))
        };
        return this.http.post<SubmitQuizResponse>(`${this.API_URL}/submit`, request);
    }

    /**
     * GET /api/quiz/:sessionId/result
     * Get result for a previously submitted quiz
     */
    getResult(sessionId: string): Observable<StudentResult> {
        return this.http.get<StudentResult>(`${this.API_URL}/${sessionId}/result`);
    }

    /**
     * Validate quiz code format (6 alphanumeric characters)
     */
    validateCode(code: string): boolean {
        return /^[A-Z0-9]{6}$/i.test(code);
    }
}
