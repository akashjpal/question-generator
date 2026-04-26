import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        RouterModule
    ],
    templateUrl: './login.html',
    styleUrl: './login.scss'
})
export class Login {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    hidePassword = true;
    emailFocused = false;
    passwordFocused = false;
    isLoading = signal(false);
    errorMessage = signal('');

    loginForm: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]]
    });

    async onSubmit(): Promise<void> {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        try {
            const { email, password } = this.loginForm.value;
            await this.authService.login(email, password);
            // Navigation to /dashboard is handled inside AuthService
        } catch (err: any) {
            let msg = err?.message || 'Invalid email or password. Please try again.';
            if (msg === 'Invalid login credentials') {
                msg = 'Invalid credentials. If you previously signed up with Google, please use "Continue with Google" above.';
            }
            this.errorMessage.set(msg);
        } finally {
            this.isLoading.set(false);
        }
    }

    async loginWithGoogle(): Promise<void> {
        this.isLoading.set(true);
        this.errorMessage.set('');
        try {
            await this.authService.loginWithGoogle();
            // Page will redirect to Google — isLoading stays true intentionally
        } catch (err: any) {
            this.errorMessage.set(err?.message || 'Google sign-in failed. Please try again.');
            this.isLoading.set(false);
        }
    }
}
