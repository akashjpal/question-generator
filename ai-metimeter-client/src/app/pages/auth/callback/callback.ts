import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

/**
 * AuthCallback Component
 *
 * Supabase redirects here after Google OAuth completes.
 * The URL contains tokens in the hash fragment (#access_token=...&refresh_token=...).
 * Supabase's onAuthStateChange listener in AuthService automatically picks these up
 * and sets the session, so this component simply waits then redirects.
 */
@Component({
    selector: 'app-auth-callback',
    standalone: true,
    template: `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: #09090b;
            gap: 16px;
        ">
            <div style="
                width: 48px;
                height: 48px;
                border: 3px solid rgba(139, 92, 246, 0.2);
                border-top-color: #8b5cf6;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            "></div>
            <p style="
                color: #a1a1aa;
                font-family: 'Inter', sans-serif;
                font-size: 0.95rem;
                margin: 0;
            ">Completing sign-in...</p>
        </div>

        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    `
})
export class AuthCallback implements OnInit {
    private router = inject(Router);
    private authService = inject(AuthService);

    async ngOnInit(): Promise<void> {
        // Give Supabase a moment to process the URL hash tokens
        // onAuthStateChange in AuthService fires immediately when tokens are parsed
        setTimeout(async () => {
            const session = await this.authService.getSession();
            if (session) {
                this.router.navigate(['/dashboard']);
            } else {
                // No valid session after OAuth — something went wrong
                this.router.navigate(['/auth/login']);
            }
        }, 1000);
    }
}
