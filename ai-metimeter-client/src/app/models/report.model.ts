/**
 * Report & Analytics Models
 * Interfaces for assessment analytics and student results
 */

import { AttemptStatus } from '../pages/attempt/attempt';
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

export interface AssessmentResult {
    id: string,
    participantUniqueCode: string,
    answers: number[],
    flaggedQuestions: number[],
    score: number,
    timeTaken: number, // in seconds
    timeLimit: number // in seconds,
    attemptStatus: AttemptStatus,
    totalScore: number
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
    averagePerformance: number;
    completionRate: number;
    recentActivity: RecentAssessmentReport[];
}

/**
 * Recent assessment report — assessments that have student attempts
 * Used in the Reports dashboard list
 */
export interface RecentAssessmentReport {
    id: number;            // assessmentId
    title: string;         // assessment title
    subject: string;       // subject name
    participants: number;  // total students who attempted
    avgScore: number;      // average score percentage
    createdAt: string;     // ISO 8601 timestamp
}
