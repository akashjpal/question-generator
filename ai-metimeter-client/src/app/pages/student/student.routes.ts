import { Routes } from '@angular/router';
import { JoinQuiz } from './join-quiz/join-quiz';
import { TakeQuiz } from './take-quiz/take-quiz';
import { QuizResult } from './quiz-result/quiz-result';

export const STUDENT_ROUTES: Routes = [
    {
        path: '',
        redirectTo: 'join',
        pathMatch: 'full'
    },
    {
        path: 'join',
        component: JoinQuiz
    },
    {
        path: 'quiz/:id',
        component: TakeQuiz
    },
    {
        path: 'result',
        component: QuizResult
    }
];
