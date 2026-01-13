import { Component } from '@angular/core';
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

interface Question {
    text: string;
    options: string[];
    correctAnswer: number; // Index of correct option
}

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
        MatRadioModule
    ],
    templateUrl: './create-assessment.html',
    styleUrls: ['./create-assessment.scss']
})
export class CreateAssessment {
    subjects = ['Biology', 'History', 'Mathematics', 'Physics', 'Chemistry', 'Literature', 'General Knowledge'];
    difficulties = ['Easy', 'Medium', 'Hard', 'Expert'];

    // Step 1 Data
    assessmentData = {
        title: '',
        subject: '',
        difficulty: '',
        topic: '',
        questionsCount: 5
    };

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
        const res = await fetch('http://localhost:3000/file-upload', {
            method: 'POST',
            body: this.selectedFile,
            headers: {
                'Content-Type': this.selectedFile.type,
                'x-filename': this.selectedFile.name,
                'content-length': this.selectedFile.size.toString()
            }
        });

        console.log(res);
        if (res.ok) {
            const data = await res.json();
            this.fileId = data.fileId;
            this.fileName = this.selectedFile.name;
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

        const res = await fetch('http://localhost:3000/generate-questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileId: this.fileId,
                fileName: this.fileName,
                noOfQuestion: this.assessmentData.questionsCount,
            })
        });

        console.log(res);
        console.log('Generating with:', {
            ...this.assessmentData,
            file: this.selectedFile ? this.selectedFile.name : 'No file'
        });

        // Mock API delay
        setTimeout(() => {
            this.questions = Array.from({ length: this.assessmentData.questionsCount }).map((_, i) => ({
                text: `Generated Question ${i + 1} about ${this.assessmentData.subject}`,
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctAnswer: 0
            }));
            this.isGenerating = false;
        }, 1500);
    }

    addQuestion() {
        this.questions.push({
            text: 'New Question',
            options: ['', '', '', ''],
            correctAnswer: 0
        });
    }

    removeQuestion(index: number) {
        this.questions.splice(index, 1);
    }

    publishAssessment() {
        console.log('Publishing assessment:', {
            meta: this.assessmentData,
            questions: this.questions
        });
        // TODO: Call backend to save
    }
}
