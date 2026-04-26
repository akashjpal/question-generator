import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
    selector: 'app-signup',
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
    templateUrl: './signup.html',
    styleUrl: './signup.scss'
})
export class Signup {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    hidePassword = true;
    nameFocused = false;
    emailFocused = false;
    passwordFocused = false;
    isLoading = signal(false);
    errorMessage = signal('');
    emailConfirmationRequired = signal(false);  // shown when Supabase email confirm is ON

    signupForm: FormGroup = this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8)]]
    });

    // ── Password strength getters ─────────────────────
    get passwordControl(): AbstractControl | null {
        return this.signupForm.get('password');
    }

    get passwordValue(): string {
        return this.passwordControl?.value || '';
    }

    get hasMinLength(): boolean { return this.passwordValue.length >= 8; }
    get hasUppercase(): boolean { return /[A-Z]/.test(this.passwordValue); }
    get hasNumber(): boolean    { return /[0-9]/.test(this.passwordValue); }
    get hasSpecial(): boolean   { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.passwordValue); }

    // ─────────────────────────────────────────────────

    async onSubmit(): Promise<void> {
        if (this.signupForm.invalid) {
            this.signupForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');

        try {
            const { name, email, password } = this.signupForm.value;
            await this.authService.signup(name, email, password);

            // If AuthService didn't navigate → email confirmation is required
            // (signup() only navigates when session is immediately available)
            this.emailConfirmationRequired.set(true);
        } catch (err: any) {
            let msg = err?.message || 'Registration failed. Please try again.';
            if (msg === 'User already registered') {
                msg = 'This email is already registered. If you used Google originally, please click "Continue with Google".';
            }
            this.errorMessage.set(msg);
        } finally {
            this.isLoading.set(false);
        }
    }

    async signupWithGoogle(): Promise<void> {
        this.isLoading.set(true);
        this.errorMessage.set('');
        try {
            await this.authService.loginWithGoogle();
            // Page will redirect to Google — isLoading stays true intentionally
        } catch (err: any) {
            this.errorMessage.set(err?.message || 'Google sign-up failed. Please try again.');
            this.isLoading.set(false);
        }
    }
}
