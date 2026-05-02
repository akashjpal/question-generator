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
    updatedAt: string;
    publishedAt?: string;
    fileId?: string;
}

export interface AssessmentPublishModel {
    id?: string;
    title: string;
    subject: string;
    topic?: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    description?: string;
    questions: string[];
    questionsCount: number;
    status: AssessmentStatus;
    code?: string; // 6-digit join code (only when published)
    timeLimit?: number; // in minutes
    createdBy: string;
    updatedAt: string;
    publishedAt?: string;
    fileId?: string;
}

export interface PublishQuestionModel {
    id?: string;
    question_text: string;
    options: string;
    correct_options: string; // Index of correct option
    explanation: string;
    jobId?: string;
    normalized_questions?: string;
}

export interface Question {
    id: string;
    question_text: string;
    options: string;
    correct_options: string; // Index of correct option
    correctAnswer: number;
    filteredOptions: string[];
    explanation: string;
}

export type AssessmentStatus = 0 | 1 | 2 | 3;
