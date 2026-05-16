import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import {
    createClient,
    SupabaseClient,
    Session,
    User as SupabaseUser
} from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

// ─────────────────────────────────────────
// App-level user model (mapped from Supabase)
// ─────────────────────────────────────────
export interface AppUser {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private supabase: SupabaseClient;

    // Reactive state — emits whenever the user changes (login / logout / refresh)
    private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();

    constructor(private router: Router) {
        // 1️⃣ Initialize Supabase client using environment credentials
        this.supabase = createClient(
            environment.supabaseUrl,
            environment.supabaseAnonKey
        );

        // 2️⃣ Listen for auth state changes (login, logout, token refresh, OAuth redirect)
        this.supabase.auth.onAuthStateChange((_event, session) => {
            this.currentUserSubject.next(
                session?.user ? this.mapUser(session.user) : null
            );
        });

        // 3️⃣ Restore any existing session from Supabase's storage on app startup
        this.loadSession();
    }

    // ─────────────────────────────────────
    // Email / Password Auth
    // ─────────────────────────────────────

    /**
     * Sign up with email, password and display name.
     * If email confirmation is OFF → user is auto-logged in and redirected.
     * If email confirmation is ON  → session will be null; caller shows "check email".
     */
    async signup(name: string, email: string, password: string): Promise<void> {
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: name }   // stored in user_metadata
            }
        });

        if (error) {
            throw error;
        }

        // Detect if email was already registered (Supabase security feature returns empty identities)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error('User already registered');
        }

        if (data.session) {
            // Email confirmation disabled → immediately logged in
            this.currentUserSubject.next(this.mapUser(data.user!));
            this.router.navigate(['/dashboard']);
        }
        // If no session → confirmation email sent; component handles the UI
    }

    /**
     * Sign in with email and password.
     */
    async login(email: string, password: string): Promise<void> {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        this.currentUserSubject.next(this.mapUser(data.user));
        this.router.navigate(['/dashboard']);
    }

    /**
     * Send a password-reset email.
     * The link in the email redirects to /auth/reset-password.
     */
    async forgotPassword(email: string): Promise<void> {
        const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${this.getAppOrigin()}/auth/reset-password`
        });

        if (error) throw error;
    }

    // ─────────────────────────────────────
    // Google OAuth
    // ─────────────────────────────────────

    /**
     * Redirect the user to Google's consent screen.
     * After approval, Google → Supabase → /auth/callback.
     */
    async loginWithGoogle(): Promise<void> {
        const { error } = await this.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${this.getAppOrigin()}/auth/callback`
            }
        });

        if (error) throw error;
    }

    // ─────────────────────────────────────
    // Session Management
    // ─────────────────────────────────────

    /**
     * Sign out the current user and redirect to login.
     */
    async logout(): Promise<void> {
        await this.supabase.auth.signOut();
        this.currentUserSubject.next(null);
        this.router.navigate(['/auth/login']);
    }

    /**
     * Get the active Supabase session (contains the JWT access token).
     */
    async getSession(): Promise<Session | null> {
        const { data } = await this.supabase.auth.getSession();
        return data.session;
    }

    /**
     * Get the raw JWT access token for use in API request headers.
     */
    async getAccessToken(): Promise<string | null> {
        const session = await this.getSession();
        return session?.access_token ?? null;
    }

    /**
     * Synchronous check — true if a user is in memory.
     */
    isAuthenticated(): boolean {
        return this.currentUserSubject.value !== null;
    }

    /**
     * Get the current app-level user synchronously.
     */
    getCurrentUser(): AppUser | null {
        return this.currentUserSubject.value;
    }

    // ─────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────

    /** Restore persisted session on service init. */
    private async loadSession(): Promise<void> {
        const { data } = await this.supabase.auth.getSession();
        if (data.session?.user) {
            this.currentUserSubject.next(this.mapUser(data.session.user));
        }
    }

    /** Map a raw Supabase user object to the app's AppUser model. */
    private mapUser(user: SupabaseUser): AppUser {
        return {
            id: user.id,
            name: user.user_metadata?.['full_name']
                || user.user_metadata?.['name']
                || user.email?.split('@')[0]
                || 'User',
            email: user.email || '',
            avatarUrl: user.user_metadata?.['avatar_url']
                || user.user_metadata?.['picture']
                || undefined
        };
    }

    private getAppOrigin(): string {
        return environment.appOrigin || window.location.origin;
    }
}
