import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
    AssessmentStats,
    StudentResult,
    DashboardStats,
    PaginatedResponse
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class ReportService {
    private readonly API_URL = '/api';

    constructor(private http: HttpClient) { }

    /**
     * GET /api/assessments/:id/stats
     * Get high-level statistics for an assessment
     */
    getAssessmentStats(assessmentId: string): Observable<AssessmentStats> {
        return this.http.get<AssessmentStats>(`${this.API_URL}/assessments/${assessmentId}/stats`);
    }

    /**
     * GET /api/assessments/:id/results
     * Get list of all student attempts for an assessment
     */
    getStudentResults(assessmentId: string, options?: {
        page?: number;
        limit?: number;
        sortBy?: 'score' | 'submittedAt';
        sortOrder?: 'asc' | 'desc';
    }): Observable<PaginatedResponse<StudentResult>> {
        let params = new HttpParams();
        if (options?.page) params = params.set('page', options.page.toString());
        if (options?.limit) params = params.set('limit', options.limit.toString());
        if (options?.sortBy) params = params.set('sortBy', options.sortBy);
        if (options?.sortOrder) params = params.set('sortOrder', options.sortOrder);

        return this.http.get<PaginatedResponse<StudentResult>>(
            `${this.API_URL}/assessments/${assessmentId}/results`,
            { params }
        );
    }

    /**
     * GET /api/assessments/:id/results/:resultId
     * Get detailed result for a specific student attempt
     */
    getStudentResultDetail(assessmentId: string, resultId: string): Observable<StudentResult> {
        return this.http.get<StudentResult>(
            `${this.API_URL}/assessments/${assessmentId}/results/${resultId}`
        );
    }

    /**
     * GET /api/dashboard/stats
     * Get teacher dashboard summary statistics
     */
    getDashboardStats(): Observable<DashboardStats> {
        return this.http.get<DashboardStats>(`${this.API_URL}/dashboard/stats`);
    }

    /**
     * GET /api/assessments/:id/export/csv
     * Export assessment results as CSV (returns blob)
     */
    exportResultsCsv(assessmentId: string): Observable<Blob> {
        return this.http.get(`${this.API_URL}/assessments/${assessmentId}/export/csv`, {
            responseType: 'blob'
        });
    }

    /**
     * GET /api/assessments/:id/export/pdf
     * Export assessment report as PDF (returns blob)
     */
    exportResultsPdf(assessmentId: string): Observable<Blob> {
        return this.http.get(`${this.API_URL}/assessments/${assessmentId}/export/pdf`, {
            responseType: 'blob'
        });
    }
}
