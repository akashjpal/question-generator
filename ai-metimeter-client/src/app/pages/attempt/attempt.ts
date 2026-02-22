import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AssessmentService } from '../../services/assessment.service';
import { Assessment } from '../../models';
import { CountdownTimerComponent } from '../../components/countdown-timer/countdown-timer';

@Component({
    selector: 'app-attempt',
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        FormsModule,
        RouterModule,
        CountdownTimerComponent
    ],
    templateUrl: './attempt.html',
    styleUrls: ['./attempt.scss']
})
export class AttemptScreen implements OnInit, OnDestroy {
    assessmentId: string | null = null;
    assessment: Assessment | null = null;
    isLoading = true;
    error = '';

    // Join Step
    participantName = '';
    accessCode = '';
    isVerified = false;

    // Quiz Step
    currentQuestionIndex = 0;
    answers: number[] = [];
    flaggedQuestions: Set<number> = new Set();
    timeLeft = 0;
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

    ngOnDestroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    loadAssessment(id: string) {
        // TODO: Uncomment when backend is available
        // this.assessmentService.getAssessment(id).pipe(
        //     timeout(3000),
        //     catchError(err => {
        //         console.warn('API unavailable, loading dummy data', err);
        //         return of(this.getDummyAssessment());
        //     })
        // ).subscribe({
        //     next: (data) => {
        //         this.initAssessment(data);
        //     }
        // });

        // Load dummy data directly (no backend needed)
        this.initAssessment(this.getDummyAssessment());
    }

    private initAssessment(data: Assessment) {
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
    }

    private getDummyAssessment(): Assessment {
        return {
            id: '34',
            title: 'Mid-Term Physics Assessment',
            subject: 'Physics',
            topic: 'Kinematics',
            difficulty: 'medium',
            description: 'Section 2: Kinematics — Projectile Motion & Newton\'s Laws',
            questionsCount: 5,
            status: 'published',
            code: '123456',
            timeLimit: 30,
            createdBy: 'instructor',
            updatedAt: new Date().toISOString(),
            questions: [
                {
                    question_text: 'A projectile is launched at an angle of 45° relative to the horizontal plane with an initial velocity of 20 m/s. Which vector component remains constant throughout the flight (ignoring air resistance)?',
                    options: '[]',
                    correct_options: 'A',
                    correctAnswer: 0,
                    explanation: 'The horizontal component of velocity remains constant when air resistance is ignored.',
                    filteredOptions: [
                        'Horizontal velocity',
                        'Vertical velocity',
                        'Net acceleration',
                        'Displacement magnitude'
                    ]
                },
                {
                    question_text: 'An object is thrown vertically upward with an initial velocity of 30 m/s. What is the maximum height reached? (g = 10 m/s²)',
                    options: '[]',
                    correct_options: 'B',
                    correctAnswer: 1,
                    explanation: 'Using v² = u² − 2gh, h = u²/(2g) = 900/20 = 45 m.',
                    filteredOptions: [
                        '30 m',
                        '45 m',
                        '60 m',
                        '90 m'
                    ]
                },
                {
                    question_text: 'Newton\'s Third Law states that for every action there is an equal and opposite reaction. Which scenario best illustrates this law?',
                    options: '[]',
                    correct_options: 'C',
                    correctAnswer: 2,
                    explanation: 'A swimmer pushes water backward and the water pushes them forward — action/reaction pair.',
                    filteredOptions: [
                        'A ball rolling down a hill',
                        'A car accelerating on a highway',
                        'A swimmer pushing water backward to move forward',
                        'A satellite orbiting the Earth'
                    ]
                },
                {
                    question_text: 'A 5 kg block is placed on a frictionless surface and a force of 20 N is applied horizontally. What is the acceleration of the block?',
                    options: '[]',
                    correct_options: 'B',
                    correctAnswer: 1,
                    explanation: 'F = ma → a = F/m = 20/5 = 4 m/s².',
                    filteredOptions: [
                        '2 m/s²',
                        '4 m/s²',
                        '5 m/s²',
                        '10 m/s²'
                    ]
                },
                {
                    question_text: 'Two objects of masses 2 kg and 4 kg are dropped from the same height in vacuum. Which statement is correct?',
                    options: '[]',
                    correct_options: 'A',
                    correctAnswer: 0,
                    explanation: 'In a vacuum, all objects fall with the same acceleration regardless of mass.',
                    filteredOptions: [
                        'Both reach the ground at the same time',
                        'The heavier object reaches first',
                        'The lighter object reaches first',
                        'They reach at different times depending on shape'
                    ]
                }
            ]
        };
    }

    verifyCode() {
        if (!this.assessment) return;
        if (!this.participantName.trim() || !this.accessCode.trim()) return;

        if (this.accessCode === this.assessment.code) {
            this.startQuiz();
        } else {
            alert('Invalid Access Code. Please check and try again.');
        }
    }

    startQuiz() {
        this.isVerified = true;
        this.isSubmitted = false;

        // Initialize answers array
        this.answers = new Array(this.assessment?.questions.length || 0).fill(-1);

        // Set timer seconds (CountdownTimerComponent handles the countdown)
        if (this.assessment?.timeLimit) {
            this.timeLeft = this.assessment.timeLimit * 60;
        }
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

    goToQuestion(index: number) {
        this.currentQuestionIndex = index;
    }

    isQuestionAnswered(index: number): boolean {
        return this.answers[index] !== undefined && this.answers[index] !== -1;
    }

    get answeredCount(): number {
        return this.answers.filter(a => a !== -1).length;
    }

    toggleFlag(index?: number) {
        const idx = index !== undefined ? index : this.currentQuestionIndex;
        if (this.flaggedQuestions.has(idx)) {
            this.flaggedQuestions.delete(idx);
        } else {
            this.flaggedQuestions.add(idx);
        }
    }

    isQuestionFlagged(index: number): boolean {
        return this.flaggedQuestions.has(index);
    }

    get flaggedCount(): number {
        return this.flaggedQuestions.size;
    }

    submitQuiz() {
        clearInterval(this.timerInterval);
        this.isSubmitted = true;
    }

    get score(): number {
        if (!this.assessment) return 0;
        let correct = 0;
        this.assessment.questions.forEach((q, index) => {
            const correctIndex = this.getCorrectOptionIndex(q);
            if (this.answers[index] === correctIndex) {
                correct++;
            }
        });
        return correct;
    }

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
