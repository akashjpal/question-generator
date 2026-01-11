import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';

@Component({
    selector: 'app-join-quiz',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        RouterModule
    ],
    templateUrl: './join-quiz.html',
    styleUrls: ['./join-quiz.scss']
})
export class JoinQuiz {
    studentName: string = '';
    quizCode: string = '';

    constructor(private router: Router) { }

    isValid(): boolean {
        return this.studentName.trim().length > 0 && this.quizCode.length === 6;
    }

    joinQuiz() {
        if (this.isValid()) {
            console.log('Joining quiz:', { name: this.studentName, code: this.quizCode });
            // Navigate to quiz page (mock ID for now)
            this.router.navigate(['/student/quiz', this.quizCode]);
        }
    }
}
