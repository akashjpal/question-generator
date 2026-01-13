import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    Assessment,
    AssessmentSummary,
    CreateAssessmentRequest,
    UpdateAssessmentRequest,
    GenerateAssessmentResponse,
    ApiResponse,
    PaginatedResponse
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class AssessmentService {
    private readonly API_URL = '/api/assessments';

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
     * GET /api/assessments/:id
     * Get full assessment details including questions
     */
    getAssessment(id: string): Observable<Assessment> {
        return this.http.get<Assessment>(`${this.API_URL}/${id}`);
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
}
