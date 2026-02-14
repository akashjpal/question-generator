import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timer, fromEvent, throwError } from 'rxjs';
import { switchMap, takeWhile, retryWhen, delayWhen, tap, map } from 'rxjs/operators';
import {
    Assessment,
    AssessmentSummary,
    AssessmentListItem,
    CreateAssessmentRequest,
    UpdateAssessmentRequest,
    GenerateAssessmentResponse,
    GenerationStatusResponse,
    GetAssessmentsResponse,
    ApiResponse,
    PaginatedResponse
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class AssessmentService {
    private readonly API_URL = 'http://localhost:3000/api/assessments';

    constructor(private http: HttpClient) { }

    /**
     * POST /api/assessments/generate
     * Generate a new assessment using AI
     * @param data Assessment metadata
     * @param file Optional PDF file for context
     */
    generateAssessment(data: CreateAssessmentRequest, file?: File): Observable<GenerateAssessmentResponse> {
        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('subject', data.subject);
        formData.append('topic', data.topic);
        formData.append('difficulty', data.difficulty);
        formData.append('questionsCount', data.questionsCount.toString());

        if (data.content) {
            formData.append('content', data.content);
        }

        if (file) {
            formData.append('file', file, file.name);
        }

        return this.http.post<GenerateAssessmentResponse>(`${this.API_URL}/generate`, formData);
    }

    /**
     * GET /api/assessments
     * List all assessments created by the authenticated user
     */
    getAssessments(options?: {
        status?: 'draft' | 'published' | 'archived';
        page?: number;
        limit?: number;
    }): Observable<PaginatedResponse<AssessmentSummary>> {
        let params = new HttpParams();
        if (options?.status) params = params.set('status', options.status);
        if (options?.page) params = params.set('page', options.page.toString());
        if (options?.limit) params = params.set('limit', options.limit.toString());

        return this.http.get<PaginatedResponse<AssessmentSummary>>(this.API_URL, { params });
    }

    /**
     * GET /get-assessments
     * Get all assessments from the backend
     */
    getAllAssessments(): Observable<GetAssessmentsResponse> {
        return this.http.get<GetAssessmentsResponse>('http://localhost:3000/get-assessments');
    }

    /**
     * GET /api/assessments/:id
     * Get full assessment details including questions
     */
    getAssessment(id: string): Observable<Assessment> {
        return this.http.get<{ assessment: Assessment }>(`${this.API_URL}/${id}`).pipe(
            map(response => response.assessment)
        );
    }

    /**
     * PUT /api/assessments/:id
     * Update an existing assessment
     */
    updateAssessment(id: string, data: UpdateAssessmentRequest): Observable<Assessment> {
        return this.http.put<Assessment>(`${this.API_URL}/${id}`, data);
    }

    /**
     * DELETE /api/assessments/:id
     * Delete an assessment
     */
    deleteAssessment(id: string): Observable<ApiResponse<void>> {
        return this.http.delete<ApiResponse<void>>(`${this.API_URL}/${id}`);
    }

    /**
     * POST /api/assessments/:id/publish
     * Publish an assessment and generate a join code
     */
    publishAssessment(id: string, timeLimit?: number): Observable<Assessment> {
        return this.http.post<Assessment>(`${this.API_URL}/${id}/publish`, { timeLimit });
    }

    /**
     * POST /api/assessments/:id/unpublish
     * Unpublish an assessment (revert to draft)
     */
    unpublishAssessment(id: string): Observable<Assessment> {
        return this.http.post<Assessment>(`${this.API_URL}/${id}/unpublish`, {});
    }

    /**
     * POST /api/assessments/:id/duplicate
     * Create a copy of an existing assessment
     */
    duplicateAssessment(id: string, newTitle?: string): Observable<Assessment> {
        return this.http.post<Assessment>(`${this.API_URL}/${id}/duplicate`, { title: newTitle });
    }

    /**
     * Poll for question generation status
     * Status 2 (Completed) or 3 (Failed) will stop the polling
     * @param jobId The job ID to poll for
     */
    pollGenerationStatus(jobId: string): Observable<GenerationStatusResponse> {
        return timer(0, 2000).pipe(
            switchMap(() => this.http.get<GenerationStatusResponse>(`http://localhost:3000/generate-questions-status/${jobId}`)),
            retryWhen(errors =>
                errors.pipe(
                    // Log the error to let the user know we act upon it
                    tap(err => console.log('Polling failed (offline?), retrying when online...', err)),
                    // Wait for the online event to trigger a retry
                    delayWhen(() => {
                        // If already online, just wait a bit (2s) to avoid spamming if server is down
                        if (navigator.onLine) {
                            return timer(2000);
                        }
                        // If offline, wait until the 'online' event fires
                        return fromEvent(window, 'online');
                    })
                )
            ),
            takeWhile(response => response.status !== 2 && response.status !== 3, true)
        );
    }
}
