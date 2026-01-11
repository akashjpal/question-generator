/**
 * Report & Analytics Models
 * Interfaces for assessment analytics and student results
 */

import { AnswerResult } from './question.model';

// ============ Statistics Models ============

/**
 * High-level assessment statistics
 * GET /api/assessments/:id/stats
 */
export interface AssessmentStats {
    assessmentId: string;
    totalParticipants: number;
    completedCount: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    averageTimeSeconds: number;
    completionRate: number; // Percentage
    questionStats: QuestionStats[];
}

/**
 * Per-question statistics
 */
export interface QuestionStats {
    questionId: string;
    questionText: string;
    correctCount: number;
    incorrectCount: number;
    correctPercentage: number;
    averageTimeSeconds: number;
    mostSelectedOptionIndex: number;
}

// ============ Student Result Models ============

/**
 * Individual student quiz attempt/result
 * GET /api/assessments/:id/results returns array of these
 */
export interface StudentResult {
    id: string;
    assessmentId: string;
    studentName: string;
    studentEmail?: string;
    score: number;
    totalPoints: number;
    percentage: number;
    correctAnswers: number;
    totalQuestions: number;
    timeTakenSeconds: number;
    submittedAt: string;
    answers?: AnswerResult[]; // Detailed answers (optional)
}

/**
 * Quiz session info (returned when student joins)
 * POST /api/quiz/join
 */
export interface QuizSession {
    sessionId: string;
    assessmentId: string;
    assessmentTitle: string;
    subject: string;
    questionsCount: number;
    timeLimit?: number; // in minutes
    startedAt: string;
    expiresAt?: string;
}

// ============ Request Models ============

/**
 * POST /api/quiz/join
 */
export interface JoinQuizRequest {
    code: string;
    studentName: string;
    studentEmail?: string;
}

/**
 * POST /api/quiz/submit
 */
export interface SubmitQuizRequest {
    sessionId: string;
    answers: {
        questionId: string;
        selectedOptionIndex: number;
    }[];
}

// ============ Response Models ============

/**
 * Response after quiz submission
 */
export interface SubmitQuizResponse {
    result: StudentResult;
    correctAnswers: AnswerResult[];
}

/**
 * Dashboard summary for teacher home
 */
export interface DashboardStats {
    totalAssessments: number;
    totalParticipants: number;
    avgPerformance: number;
    completionRate: number;
    recentActivity: RecentActivityItem[];
}

/**
 * Recent activity item for dashboard
 */
export interface RecentActivityItem {
    id: string;
    type: 'quiz_completed' | 'assessment_created' | 'assessment_published';
    title: string;
    description: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
