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

interface Question {
    question_text: string;
    options: string;
    correct_options: string; // Index of correct option
    correctAnswer: number;
    filteredOptions: string[];
    explanation: string;
}

export type AssessmentStatus = 'draft' | 'published' | 'archived';
