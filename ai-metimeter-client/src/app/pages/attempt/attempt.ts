import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { AssessmentService } from '../../services/assessment.service';
import { Assessment } from '../../models';
import { CountdownTimerComponent } from '../../components/countdown-timer/countdown-timer';
import { ReportService } from '../../services/report.service';
import { interval, Subject, switchMap, takeUntil, takeWhile } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

export enum AttemptStatus {
    NOT_STARTED = 0,
    IN_PROGRESS = 1,
    COMPLETED = 2,
    ERROR = 3
};
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
    interval: any;

    // Join Step
    participantName = '';
    participantUniqueCode = '';
    accessCode = '';
    isVerified = false;

    // Quiz Step
    currentQuestionIndex = 0;
    answers: number[] = [];
    flaggedQuestions: Set<number> = new Set();
    timeLeft = 0;
    timerInterval: any;
    isSubmitted = false;
    private destroy$ = new Subject<void>();
    private manualSubmit$ = new Subject<void>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private assessmentService: AssessmentService,
        private cdr: ChangeDetectorRef,
        private reportService: ReportService
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
        this.manualSubmit$.next();
        this.manualSubmit$.complete();
        this.destroy$.next();
        this.destroy$.complete();
    }

    loadAssessment(id: string) {
        // TODO: Uncomment when backend is available
        this.assessmentService.getAssessment(id).subscribe({
            next: (data) => {
                this.initAssessment(data);
                this.isLoading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Failed to load assessment:', err);
                this.error = 'We could not load this assessment. It may not exist or is no longer available.';
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
        // Load dummy data directly (no backend needed)
        // this.initAssessment(this.getDummyAssessment());
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

    verifyCode() {
        if (!this.assessment) return;
        if (!this.participantName.trim() || !this.accessCode.trim()) return;

        if (this.accessCode === this.assessment.code) {
            const storageKey = `participantUniqueCode_${this.assessmentId}`;
            if (localStorage.getItem(storageKey)) {
                alert('You have already attempted this assessment');
                return;
            }
            this.participantUniqueCode = this.participantName + '-' + this.assessment.code + '-' + uuidv4();
            localStorage.setItem(storageKey, this.participantUniqueCode);
            this.startQuiz();
            this.startPollSaveQuiz();
        } else {
            alert('Invalid Access Code. Please check and try again.');
        }
    }

    startPollSaveQuiz() {
        interval(5000).pipe(
            takeUntil(this.destroy$),              // cleanup on component destroy
            takeUntil(this.manualSubmit$),         // cleanup on manual submit
            takeWhile(() => !this.isSubmitted),     // stop when submitted
            switchMap(() => this.reportService.saveQuiz(this.assessmentId!, {
                id: parseInt(this.assessmentId!, 10),
                participantUniqueCode: this.participantUniqueCode,
                answers: this.answers,
                flaggedQuestions: Array.from(this.flaggedQuestions),
                score: this.score,
                timeTaken: ((this.assessment?.timeLimit ?? 0) * 60 - this.timeLeft),
                timeLimit: (this.assessment?.timeLimit ?? 0) * 60,
                attemptStatus: AttemptStatus.IN_PROGRESS,
                totalScore: this.answers.length ?? 1
            }).pipe(
                catchError(err => {
                    console.error('Auto-save failed:', err);
                    return of(null);
                })
            )
            )).subscribe({
                next: (data) => console.log(data),
                error: (err) => console.error('Auto-save failed:', err)
            });
    }

    saveQuiz() {
        this.reportService.saveQuiz(this.assessmentId!, {
            id: parseInt(this.assessmentId!, 10),
            participantUniqueCode: this.participantUniqueCode,
            answers: this.answers,
            flaggedQuestions: Array.from(this.flaggedQuestions),
            score: this.score,
            timeTaken: ((this.assessment?.timeLimit ?? 0) * 60 - this.timeLeft),
            timeLimit: (this.assessment?.timeLimit ?? 0) * 60,
            attemptStatus: AttemptStatus.IN_PROGRESS,
            totalScore: this.answers.length ?? 1
        }).subscribe({
            next: (data) => {
                console.log(data);
            }
        });
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
        this.manualSubmit$.next();
        this.isSubmitted = true;
        this.reportService.submitQuiz(this.assessmentId!, {
            id: parseInt(this.assessmentId!, 10),
            participantUniqueCode: this.participantUniqueCode,
            answers: this.answers,
            flaggedQuestions: Array.from(this.flaggedQuestions),
            score: this.score,
            timeTaken: ((this.assessment?.timeLimit ?? 0) * 60 - this.timeLeft),
            timeLimit: (this.assessment?.timeLimit ?? 0) * 60,
            attemptStatus: AttemptStatus.COMPLETED,
            totalScore: this.answers.length ?? 1
        }).subscribe({
            next: (data) => {
                console.log(data);
                this.isSubmitted = true;
            }
        });
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
