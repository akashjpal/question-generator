import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
import { AssessmentService } from '../../../services/assessment.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Assessment } from '../../../models';
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
export class CreateAssessment implements OnInit {
    isEditMode = false;
    editId: string | null = null;
    private readonly questionGeneratorApiUrl = environment.questionGeneratorApiUrl;
    private accessToken: string | null = null;

    constructor(
        private assessmentService: AssessmentService,
        private cdr: ChangeDetectorRef,
        private snackBar: MatSnackBar,
        private router: Router,
        private route: ActivatedRoute,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.isEditMode = true;
                this.editId = id;
                this.loadAssessment(id);
            }
        });
        this.initAccessToken();
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
                    return q;
                });

                this.assessmentData.questions = this.questions;
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
    difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];

    // Step 1 Data
    public assessmentData: Assessment = {
        title: '',
        subject: '',
        topic: '',
        questionsCount: 5,
        id: '',
        difficulty: 'easy',
        questions: [],
        code: '',
        timeLimit: 15,
        status: 'draft',
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

    fileId: string = '';
    fileName: string = '';

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
        await this.uploadFile();
    }

    async uploadFile() {
        if (!this.selectedFile) return;
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
            question_text: 'New Question',
            options: '',
            correctAnswer: 0,
            correct_options: '',
            filteredOptions: [],
            explanation: ''
        });
    }

    removeQuestion(index: number) {
        this.questions.splice(index, 1);
    }

    async publishAssessment() {
        console.log('Publishing assessment:', {
            meta: this.assessmentData,
            questions: this.questions
        });

        try {
            if (this.isEditMode && this.editId) {
                await this.updateAssessment();
                // Show success message and navigate to my-quizzes
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
            console.log("res ", res);
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

            // Show success message and navigate to my-quizzes
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

        const dataToUpdate: any = {
            title: this.assessmentData.title,
            subject: this.assessmentData.subject,
            topic: this.assessmentData.topic,
            difficulty: this.assessmentData.difficulty as any,
            questions: this.questions,
            timeLimit: this.assessmentData.timeLimit || 15,
            code: this.assessmentData.code
        };

        this.assessmentService.updateAssessment(this.editId, this.assessmentData).subscribe({
            next: () => {
                console.log('Assessment updated');
            },
            error: (err) => console.error(err)
        });
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
                console.log("parsed");
                console.log(parsed);
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

    getCorrectOption(questio: Question): number {
        const correctOption = questio.correct_options;
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
