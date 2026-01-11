import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';

interface Question {
    text: string;
    options: string[];
    selectedAnswer?: number;
}

@Component({
    selector: 'app-take-quiz',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatButtonModule,
        MatRadioModule,
        MatProgressBarModule,
        MatIconModule
    ],
    templateUrl: './take-quiz.html',
    styleUrls: ['./take-quiz.scss']
})
export class TakeQuiz implements OnInit {
    quizId: string | null = null;
    currentQuestionIndex = 0;

    questions: Question[] = [
        {
            text: 'What is the powerhouse of the cell?',
            options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi Apparatus']
        },
        {
            text: 'Which process converts light energy into chemical energy?',
            options: ['Respiration', 'Photosynthesis', 'Fermentation', 'Oxidation']
        },
        {
            text: 'What is the basic unit of life?',
            options: ['Tissue', 'Organ', 'Cell', 'Organism']
        }
    ];

    get currentQuestion(): Question {
        return this.questions[this.currentQuestionIndex];
    }

    get progress(): number {
        return ((this.currentQuestionIndex + 1) / this.questions.length) * 100;
    }

    constructor(private route: ActivatedRoute, private router: Router) { }

    ngOnInit() {
        this.quizId = this.route.snapshot.paramMap.get('id');
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
        }
    }

    submitQuiz() {
        console.log('Submitting quiz...', this.questions);
        // Navigate to results
        this.router.navigate(['/student/result']);
    }
}
