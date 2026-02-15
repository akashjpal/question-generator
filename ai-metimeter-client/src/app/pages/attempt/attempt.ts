import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AssessmentService } from '../../services/assessment.service';
import { Assessment } from '../../models';

@Component({
    selector: 'app-attempt',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        FormsModule,
        MatProgressSpinnerModule
    ],
    templateUrl: './attempt.html',
    styleUrls: ['./attempt.scss']
})
export class AttemptScreen implements OnInit {
    assessmentId: string | null = null;
    assessment: Assessment | null = null;
    isLoading = true;
    error = '';

    // Auth Step
    accessCode = '';
    isVerified = false;

    // Quiz Step
    currentQuestionIndex = 0;
    answers: number[] = []; // Store selected option index
    timeLeft = 0; // in seconds
    timerInterval: any;
    isSubmitted = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private assessmentService: AssessmentService
    ) { }

    ngOnInit() {
        this.assessmentId = this.route.snapshot.paramMap.get('id');
        if (this.assessmentId) {
            this.loadAssessment(this.assessmentId);
        } else {
            this.error = 'Invalid Assessment ID';
            this.isLoading = false;
        }
    }

    loadAssessment(id: string) {
        this.assessmentService.getAssessment(id).subscribe({
            next: (data) => {
                this.assessment = data;
                this.isLoading = false;

                // Parse questions if needed
                if (typeof this.assessment.questions === 'string') {
                    try {
                        this.assessment.questions = JSON.parse(this.assessment.questions as any);
                    } catch (e) {
                        console.error('Failed to parse questions');
                        this.assessment.questions = [];
                    }
                }

                // Ensure filteredOptions are available for all questions
                if (this.assessment.questions && Array.isArray(this.assessment.questions)) {
                    this.assessment.questions.forEach(q => {
                        if (!q.filteredOptions) {
                            q.filteredOptions = this.parseOptions(q.options || '[]');
                        }
                    });
                }
            },
            error: (err) => {
                console.error('Failed to load assessment', err);
                this.error = 'Failed to load assessment';
                this.isLoading = false;
            }
        });
    }

    verifyCode() {
        if (!this.assessment) return;

        if (this.accessCode === this.assessment.code) {
            this.startQuiz();
        } else {
            alert('Invalid Access Code');
        }
    }

    startQuiz() {
        this.isVerified = true;
        this.isSubmitted = false;

        // Initialize answers array
        this.answers = new Array(this.assessment?.questions.length || 0).fill(-1);

        // Start Timer
        if (this.assessment?.timeLimit) {
            this.timeLeft = this.assessment.timeLimit * 60;
            this.startTimer();
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.timeLeft > 0) {
                this.timeLeft--;
            } else {
                this.submitQuiz();
            }
        }, 1000);
    }

    formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    selectOption(optionIndex: number) {
        this.answers[this.currentQuestionIndex] = optionIndex;
    }

    nextQuestion() {
        if (this.currentQuestionIndex < (this.assessment?.questions.length || 0) - 1) {
            this.currentQuestionIndex++;
        }
    }

    prevQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
        }
    }

    submitQuiz() {
        clearInterval(this.timerInterval);
        this.isSubmitted = true;
        // Logic to calculate score or save attempt would go here
    }

    get score(): number {
        if (!this.assessment) return 0;
        let correct = 0;
        this.assessment.questions.forEach((q, index) => {
            // Need to parse correct answer index from string/number
            const correctIndex = this.getCorrectOptionIndex(q);
            if (this.answers[index] === correctIndex) {
                correct++;
            }
        });
        return correct;
    }

    // Helper from create-assessment (should be shared utility in future)
    getCorrectOptionIndex(question: any): number {
        if (typeof question.correctAnswer === 'number') return question.correctAnswer;

        const map: any = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        return map[question.correct_options] ?? 0;
    }

    parseOptions(options: string | string[]) {
        if (Array.isArray(options)) {
            return options.map((opt: string) => this.stripOptionPrefix(opt));
        }

        if (typeof options === 'string') {
            try {
                const parsed = JSON.parse(options);
                if (Array.isArray(parsed)) {
                    return parsed.map((opt: string) => this.stripOptionPrefix(opt));
                }
                return [];
            } catch {
                console.error('Invalid options format');
                return [];
            }
        }

        return [];
    }

    stripOptionPrefix(option: string): string {
        return option.replace(/^[A-D]\.\s*/, '');
    }
}
