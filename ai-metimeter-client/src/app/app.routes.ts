import { Routes } from '@angular/router';
import { Landing } from './pages/landing/landing';
import { authenticationGuardGuard } from './authentication-guard-guard';
export const routes: Routes = [
    { path: '', component: Landing, pathMatch: 'full' },
    {
        path: 'dashboard',
        loadChildren: () => import('./pages/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES),
        canActivate : [authenticationGuardGuard]
    },
    {
        path: 'student',
        loadChildren: () => import('./pages/student/student.routes').then(m => m.STUDENT_ROUTES)
    },
    {
        path: 'auth',
        loadChildren: () => import('./pages/auth/auth.routes').then(m => m.AUTH_ROUTES)
    },
    {
        path: 'attempt/:id',
        loadComponent: () => import('./pages/attempt/attempt').then(m => m.AttemptScreen)
    },
    { path: '**', redirectTo: '' }
];
