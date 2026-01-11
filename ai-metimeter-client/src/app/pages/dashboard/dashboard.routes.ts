import { Routes } from '@angular/router';
import { DashboardLayout } from './dashboard-layout/dashboard-layout';
import { MyQuizzes } from './my-quizzes/my-quizzes';
import { Reports } from './reports/reports';
import { Settings } from './settings/settings';
import { CreateAssessment } from './create-assessment/create-assessment';
import { AssessmentReport } from './reports/assessment-report/assessment-report';

export const DASHBOARD_ROUTES: Routes = [
    {
        path: '',
        component: DashboardLayout,
        children: [
            { path: '', redirectTo: 'my-quizzes', pathMatch: 'full' },
            { path: 'my-quizzes', component: MyQuizzes },
            { path: 'reports', component: Reports },
            { path: 'reports/:id', component: AssessmentReport },
            { path: 'settings', component: Settings },
            { path: 'create-assessment', component: CreateAssessment },
        ]
    }
];
