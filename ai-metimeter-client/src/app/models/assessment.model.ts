/**
 * Assessment/Quiz Models
 * Interfaces for assessments created by teachers
 */

import { Question, StudentQuestion } from './question.model';

// ============ Core Models ============

/**
 * Assessment status
 */
export type AssessmentStatus = 'draft' | 'published' | 'archived';

/**
 * Complete assessment with all questions (Teacher view)
 */
export interface Assessment {
    id: string;
    title: string;
    subject: string;
    topic?: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    description?: string;
    questions: Question[];
    questionsCount: number;
    status: AssessmentStatus;
    code?: string; // 6-digit join code (only when published)
    timeLimit?: number; // in minutes
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    publishedAt?: string;
}

/**
 * Assessment summary for list views (without questions)
 */
export interface AssessmentSummary {
    id: string;
    title: string;
    subject: string;
    questionsCount: number;
    status: AssessmentStatus;
    code?: string;
    participantsCount: number;
    avgScore?: number;
    createdAt: string;
    updatedAt: string;
}

// ============ Request Models ============

/**
 * POST /api/assessments/generate - AI generation with file upload
 * Note: Use FormData for file uploads
 */
export interface CreateAssessmentRequest {
    title: string;
    subject: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    questionsCount: number;
    content?: string; // Text content if no file
    // file: File - handled via FormData
}

/**
 * PUT /api/assessments/:id - Update assessment
 */
export interface UpdateAssessmentRequest {
    title?: string;
    subject?: string;
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
    description?: string;
    questions?: Question[];
    timeLimit?: number;
}

/**
 * POST /api/assessments/:id/publish
 */
export interface PublishAssessmentRequest {
    timeLimit?: number;
    scheduledAt?: string; // ISO date for scheduled publishing
}

// ============ Response Models ============

/**
 * Response after AI generates questions
 */
export interface GenerateAssessmentResponse {
    assessment: Assessment;
    generatedQuestions: Question[];
    suggestedTitle?: string;
}
