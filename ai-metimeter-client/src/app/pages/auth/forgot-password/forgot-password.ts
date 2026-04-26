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
    selector: 'app-forgot-password',
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
    templateUrl: './forgot-password.html',
    styleUrl: './forgot-password.scss'
})
export class ForgotPassword {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    emailFocused = false;
    isLoading = signal(false);
    errorMessage = signal('');
    successMessage = signal('');
    emailSent = signal(false);

    forgotForm: FormGroup = this.fb.group({
        email: ['', [Validators.required, Validators.email]]
    });

    async onSubmit(): Promise<void> {
        if (this.forgotForm.invalid) {
            this.forgotForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.errorMessage.set('');
        this.successMessage.set('');

        try {
            const email = this.forgotForm.get('email')?.value;
            await this.authService.forgotPassword(email);
            this.emailSent.set(true);
            this.successMessage.set(
                `Password reset link sent to ${email}. Please check your inbox.`
            );
        } catch (err: any) {
            this.errorMessage.set(err?.message || 'Unable to send reset email. Please try again.');
        } finally {
            this.isLoading.set(false);
        }
    }

    resendEmail(): void {
        this.emailSent.set(false);    // Reset to form view before resubmitting
        this.onSubmit();
    }
}
