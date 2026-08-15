import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, Renderer2, ViewChildren } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { Subject, interval, firstValueFrom } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { AssessmentService } from '../../../services/assessment.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Assessment, AssessmentStatus } from '../../../models';
import { Question } from '../../../models';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-create-assessment',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatInputModule,
        MatButtonModule,
        MatSelectModule,
        MatIconModule,
        MatFormFieldModule,
        FormsModule,
        ReactiveFormsModule,
        MatStepperModule,
        MatExpansionModule,
        MatCheckboxModule,
        MatRadioModule,
        MatProgressSpinnerModule,
        MatSnackBarModule
    ],
    templateUrl: './create-assessment.html',
    styleUrls: ['./create-assessment.scss']
})
export class CreateAssessment implements OnInit, OnDestroy, AfterViewInit {
    isEditMode = false;
    editId: number | null = null;

    private destroy$ = new Subject<void>();
    isSaving = false;
    lastSaved: Date | null = null;
    private readonly questionGeneratorApiUrl = environment.questionGeneratorApiUrl;
    private accessToken: string | null = null;

    // Each mat-radio-button host carries a [attr.data-radio-testid] marker (see
    // template) since Angular Material's mat-radio-button doesn't forward
    // arbitrary attributes to the native <input> it renders internally — only
    // the host element receives template attribute bindings. We resolve these
    // markers to their real <input> here and stamp the actual data-testid onto
    // it, so Playwright locators (which need the real input for
    // toBeChecked()/toBeChecked-style assertions) resolve correctly.
    @ViewChildren('radioBtn', { read: ElementRef }) private radioButtons!: QueryList<ElementRef<HTMLElement>>;

    constructor(
        private assessmentService: AssessmentService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar,
        private router: Router,
        private route: ActivatedRoute,
        private authService: AuthService,
        private renderer: Renderer2
    ) { }

    ngAfterViewInit(): void {
        this.syncRadioTestIds();
        this.radioButtons.changes
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => this.syncRadioTestIds());
    }

    private syncRadioTestIds(): void {
        this.radioButtons?.forEach(ref => {
            const hostEl = ref.nativeElement;
            const key = hostEl.getAttribute('data-radio-testid');
            if (!key) return;
            const inputEl = hostEl.querySelector('input');
            if (inputEl && inputEl.getAttribute('data-testid') !== key) {
                this.renderer.setAttribute(inputEl, 'data-testid', key);
            }
        });
    }

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.isEditMode = true;
                this.editId = parseInt(id);
                this.loadAssessment(id);
                console.log("Edit mode for assessment ID:", id);
            }
        });
        this.initAccessToken();
        this.startAutoSave();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private startAutoSave(): void {
        interval(5000).pipe(
            takeUntil(this.destroy$),
            filter(() => !this.isGenerating && !!this.assessmentData.title)
        ).subscribe(() => this.autoSave());
    }

    private autoSave(): void {
        this.syncOptionsFromFiltered();
        const snapshot: any = {
            ...this.assessmentData,
            id: this.editId ?? this.assessmentData.id,
            questions: this.questions,
            status: this.assessmentData.status ?? AssessmentStatus.draft
        };

        this.isSaving = true;
        this.assessmentService.saveAssessmentDraft(snapshot).subscribe({
            next: (res) => {
                this.isSaving = false;
                this.lastSaved = new Date();
                // Capture the id from the first INSERT so subsequent saves UPDATE the same row
                if (!this.editId && res.data?.[0]?.id) {
                    this.editId = res.data[0].id;
                    this.assessmentData.id = this.editId!;
                }
            },
            error: () => { this.isSaving = false; }
        });
    }

    private async initAccessToken(): Promise<void> {
        try {
            this.accessToken = await this.authService.getAccessToken();
        } catch (error) {
            console.error('Failed to retrieve access token:', error);
            this.router.navigate(['/auth/login']);
        }
    }

    loadAssessment(id: string) {
        this.assessmentService.getAssessment(id).subscribe({
            next: (data) => {
                this.assessmentData = data;
                console.log('Loaded assessment data:', this.assessmentData);
                // Handle questions parsing
                let parsedQuestions: any[] = [];
                if (typeof data.questions === 'string') {
                    try {
                        parsedQuestions = JSON.parse(data.questions);
                    } catch (e) {
                        console.error('Error parsing questions', e);
                    }
                } else if (Array.isArray(data.questions)) {
                    parsedQuestions = data.questions;
                }

                // Map to Question type and ensure filteredOptions
                this.questions = parsedQuestions.map((q: any) => {
                    // Ensure each question has filteredOptions
                    if (!q.filteredOptions) {
                        q.filteredOptions = this.parseOptions(q.options || '[]');
                    }
                    // Ensure explanation exists
                    if (!q.explanation) q.explanation = '';
                    q.correctAnswer = this.getCorrectOption(q);
                    return q;
                });

                this.assessmentData.questions = this.questions;
                console.log("this.assessmentData", this.assessmentData);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Failed to load assessment', err);
                this.snackBar.open('Failed to load assessment', 'Close');
                this.router.navigate(['/dashboard/my-quizzes']); // Redirect on error
            }
        });
    }

    subjects = ['Biology', 'History', 'Mathematics', 'Physics', 'Chemistry', 'Literature', 'General Knowledge'];
    difficulties = ['easy', 'medium', 'hard', 'expert'];

    // Step 1 Data
    public assessmentData: Assessment = {
        title: '',
        subject: '',
        topic: '',
        questionsCount: 5,
        id: crypto.getRandomValues(new Uint32Array(1))[0],
        difficulty: 'easy',
        questions: [],
        code: '',
        timeLimit: 15,
        status: AssessmentStatus.draft,
        createdBy: '',
        updatedAt: ''
    };

    generateCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        this.assessmentData.code = result;
    }

    // Step 2 Data
    questions: Question[] = [];

    selectedFile: File | null = null;
    fileError: string = '';

    isGenerating = false;
    isUploading = false;

    fileId: string = '';
    fileName: string = '';

    // Tracks the in-flight /file-upload request so generateQuestions() can
    // wait for it to resolve instead of racing it (fileId is only populated
    // once uploadFile() completes).
    private fileUploadPromise: Promise<void> | null = null;

    async onFileSelected(event: any) {
        const file: File = event.target.files[0];
        this.fileError = '';

        if (file) {
            // Validation: PDF only
            if (file.type !== 'application/pdf') {
                this.fileError = 'Only PDF files are allowed.';
                return;
            }

            // Validation: Max 5MB
            if (file.size > 5 * 1024 * 1024) {
                this.fileError = 'File size must be less than 5MB.';
                return;
            }

            this.selectedFile = file;
        }
        // Assigned synchronously (before any await) so that a Generate click
        // firing immediately after file selection can still find and await
        // this promise rather than racing ahead with an empty fileId.
        this.fileUploadPromise = this.uploadFile();
        await this.fileUploadPromise;
    }

    async uploadFile() {
        if (!this.selectedFile) return;
        this.isUploading = true;
        this.cdr.detectChanges();
        try {
            const res = await fetch(`${this.questionGeneratorApiUrl}/file-upload`, {
                method: 'POST',
                body: this.selectedFile,
                headers: {
                    'Content-Type': this.selectedFile.type,
                    'x-filename': this.selectedFile.name,
                    'content-length': this.selectedFile.size.toString(),
                    "authorization": `Bearer ${this.accessToken}`
                }
            });

            console.log(res);
            if (res.ok) {
                const data = await res.json();
                this.fileId = data.fileId;
                this.fileName = this.selectedFile.name;
                this.assessmentData.fileId = this.fileId;
                console.log('File uploaded with ID:', this.fileId);
            }
        } finally {
            this.isUploading = false;
            this.cdr.detectChanges();
        }
    }

    removeFile() {
        this.selectedFile = null;
        this.fileError = '';
    }

    // Simulation of AI Generation
    async generateQuestions() {
        if (this.assessmentData.questionsCount > 10) {
            this.assessmentData.questionsCount = 10;
        }

        this.isGenerating = true;

        try {
            // A file may still be uploading (fileId is only populated once
            // uploadFile() resolves) — wait for it so we never dispatch a
            // generate-questions job with an empty fileId.
            if (this.fileUploadPromise) {
                await this.fileUploadPromise;
            }

            const res = await fetch(`${this.questionGeneratorApiUrl}/generate-questions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    "authorization": `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({
                    fileId: this.fileId,
                    fileName: this.fileName,
                    noOfQuestion: this.assessmentData.questionsCount,
                    difficulty: this.assessmentData.difficulty,
                    topic: this.assessmentData.topic
                })
            });


            if (!res.ok) {
                throw new Error(`Question generation request failed with status ${res.status}`);
            }

            const data = await res.json();
            console.log('Job Started:', data);

            if (data.jobId) {
                this.assessmentService.pollGenerationStatus(data.jobId, this.accessToken).subscribe({
                    next: async (statusRes) => {
                        console.log('Polling Status:', statusRes);
                        if (statusRes.status === 2) {
                            this.isGenerating = false;
                            console.log('Generation Completed!');
                            this.questions = await this.getGeneratedQuestions(data.jobId);
                            this.assessmentData.questions = this.questions;
                            this.cdr.detectChanges();
                        } else if (statusRes.status === 3) {
                            this.isGenerating = false;
                            console.error('Generation Failed:', statusRes.message);
                            this.snackBar.open(
                                'Generation failed. Please try changing the PDF content.',
                                'Close',
                                { duration: 5000, panelClass: ['error-snackbar'] }
                            );
                            this.cdr.detectChanges();
                        }
                    },
                    error: (err) => {
                        this.isGenerating = false;
                        console.error('Polling Error:', err);
                    }
                });
            } else {
                this.isGenerating = false;
                console.error('No Job ID received');
            }
        } catch (error) {
            this.isGenerating = false;
            console.error('Error starting question generation:', error);
            this.snackBar.open(
                'Unable to start question generation. Please try again.',
                'Close',
                { duration: 5000, panelClass: ['error-snackbar'] }
            );
        }

        this.cdr.detectChanges();
    }

    addQuestion() {
        this.questions.push({
            id: crypto.randomUUID(),
            question_text: 'New Question',
            options: '["","","",""]',
            correctAnswer: 0,
            correct_options: '',
            filteredOptions: ['', '', '', ''],
            explanation: ''
        });
    }

    removeQuestion(index: number) {
        this.questions.splice(index, 1);
    }

    trackByIndex(index: number): number {
        return index;
    }

    setCorrectAnswer(question: Question, optionIndex: number): void {
        question.correctAnswer = optionIndex;
    }

    updateOption(question: Question, optionIndex: number, value: string): void {
        const updated = [...question.filteredOptions];
        updated[optionIndex] = value;
        question.filteredOptions = updated;
    }

    private syncOptionsFromFiltered() {
        const letters = ['A', 'B', 'C', 'D'];
        this.questions.forEach(q => {
            q.options = JSON.stringify(q.filteredOptions);
            q.correct_options = letters[q.correctAnswer] ?? 'A';
        });
        this.assessmentData.questions = this.questions;
    }

    async publishAssessment() {
        this.syncOptionsFromFiltered();

        try {
            if (this.isEditMode && this.editId) {
                await this.updateAssessment();
                this.snackBar.open('Assessment updated successfully!', 'Close', {
                    duration: 3000,
                    panelClass: ['success-snackbar']
                });
                this.router.navigate(['/dashboard/my-quizzes']);
                return; // Exit after update
            }
            const data = await fetch(`${this.questionGeneratorApiUrl}/publish-assessment`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "authorization": `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({
                    assessment: this.assessmentData
                })
            })
            
            const res = await data.json();
            if(data.ok) {
                this.snackBar.open('Assessment published successfully!', 'Close', {
                    duration: 3000,
                    panelClass: ['success-snackbar']
                });
                this.router.navigate(['/dashboard/my-quizzes']);
            } else {
                this.snackBar.open(res.message || 'Failed to publish assessment.', 'Close', {
                    duration: 3000,
                    panelClass: ['error-snackbar']
                });
            }
        } catch (error) {
            console.error('Error publishing assessment:', error);
            this.snackBar.open('Failed to publish assessment. Please try again.', 'Close', {
                duration: 5000,
                panelClass: ['error-snackbar']
            });
        }
        // TODO: Call backend to save
    }

    async updateAssessment() {
        if (!this.editId) return;

        // Previously this called .subscribe(...) without awaiting the Observable,
        // so the async function resolved immediately (there was no `await`
        // inside it) instead of waiting for the PUT to actually complete. That
        // let publishAssessment() show the "updated successfully" toast and
        // navigate to /dashboard/my-quizzes before the write had landed,
        // causing an intermittent race: the quiz list would sometimes reload
        // before the backend update was persisted. firstValueFrom() makes this
        // genuinely await completion (and rejects on error so the existing
        // try/catch in publishAssessment() handles failures correctly).
        await firstValueFrom(this.assessmentService.updateAssessment(this.editId, this.assessmentData));
        console.log('Assessment updated');
    }

    async getGeneratedQuestions(jobId: string): Promise<Question[]> {
        try {
            const data = await fetch(`${this.questionGeneratorApiUrl}/generated-questions/${jobId}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });

            if (!data.ok) {
                throw new Error(`Generated questions request failed with status ${data.status}`);
            }

            const questions = await data.json();
            return this.filterGeneratedQuestions(questions.questions);
        } catch (error) {
            console.error('Error fetching generated questions:', error);
            return [];
        }
    }

    filterGeneratedQuestions(questions: Question[]) {
        questions.map((question) => {
            const options = question.options;
            const filteredOptions: string[] = this.parseOptions(options);
            question.filteredOptions = filteredOptions;
            question.explanation = question.explanation;
            question.correctAnswer = this.getCorrectOption(question);
        })
        return questions;
    }

    parseOptions(options: string) {
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

    /**
     * Removes leading option prefixes like "A. ", "B. ", "C. ", "D. " from option text
     */
    stripOptionPrefix(option: string): string {
        return option.replace(/^[A-D]\.\s*/, '');
    }

    getCorrectOption(question: Question): number {
        const correctOption = question.correct_options;
        if (correctOption === 'A') {
            return 0;
        } else if (correctOption === 'B') {
            return 1;
        } else if (correctOption === 'C') {
            return 2;
        } else if (correctOption === 'D') {
            return 3;
        }
        return 0;
    }

}
