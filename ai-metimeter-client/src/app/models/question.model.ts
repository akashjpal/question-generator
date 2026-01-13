/**
 * Question Models
 * Interfaces for quiz questions and answers
 */

/**
 * Question option structure
 */
export interface QuestionOption {
    id: string;
    text: string;
    isCorrect?: boolean; // Only visible to teachers
}

/**
 * Full question with correct answer (Teacher view)
 */
export interface Question {
    id: string;
    text: string;
    options: QuestionOption[];
    correctAnswerIndex: number;
    explanation?: string;
    difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
    points?: number;
}

/**
 * Question without correct answer (Student view during quiz)
 */
export interface StudentQuestion {
    id: string;
    text: string;
    options: Omit<QuestionOption, 'isCorrect'>[];
    points?: number;
}

/**
 * Student answer submission
 */
export interface Answer {
    questionId: string;
    selectedOptionIndex: number;
    timeTakenSeconds?: number;
}

/**
 * Answer with correctness feedback (after submission)
 */
export interface AnswerResult {
    questionId: string;
    selectedOptionIndex: number;
    correctOptionIndex: number;
    isCorrect: boolean;
    pointsEarned: number;
    explanation?: string;
}

/**
 * Request model for AI question generation
 */
export interface GenerateQuestionsRequest {
    topic: string;
    subject: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert';
    count: number;
    content?: string; // Text content to base questions on
}
