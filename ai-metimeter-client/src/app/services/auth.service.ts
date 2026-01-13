import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import {
    LoginRequest,
    SignupRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthResponse,
    User,
    RefreshTokenResponse,
    ApiResponse
} from '../models';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly API_URL = '/api/auth';
    private readonly TOKEN_KEY = 'access_token';
    private readonly REFRESH_TOKEN_KEY = 'refresh_token';
    private readonly USER_KEY = 'current_user';

    private currentUserSubject = new BehaviorSubject<User | null>(this.getStoredUser());
    public currentUser$ = this.currentUserSubject.asObservable();

    constructor(private http: HttpClient) { }

    /**
     * POST /api/auth/login
     * Authenticate user and receive JWT tokens
     */
    login(credentials: LoginRequest): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.API_URL}/login`, credentials).pipe(
            tap(response => this.handleAuthResponse(response))
        );
    }

    /**
     * POST /api/auth/signup
     * Register a new user account
     */
    signup(data: SignupRequest): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.API_URL}/signup`, data).pipe(
            tap(response => this.handleAuthResponse(response))
        );
    }

    /**
     * POST /api/auth/forgot-password
     * Initiate password reset flow (sends email)
     */
    forgotPassword(data: ForgotPasswordRequest): Observable<ApiResponse<void>> {
        return this.http.post<ApiResponse<void>>(`${this.API_URL}/forgot-password`, data);
    }

    /**
     * POST /api/auth/reset-password
     * Complete password reset with token
     */
    resetPassword(data: ResetPasswordRequest): Observable<ApiResponse<void>> {
        return this.http.post<ApiResponse<void>>(`${this.API_URL}/reset-password`, data);
    }

    /**
     * POST /api/auth/refresh
     * Refresh access token using refresh token
     */
    refreshToken(): Observable<RefreshTokenResponse> {
        const refreshToken = this.getRefreshToken();
        return this.http.post<RefreshTokenResponse>(`${this.API_URL}/refresh`, { refreshToken }).pipe(
            tap(response => {
                localStorage.setItem(this.TOKEN_KEY, response.accessToken);
            })
        );
    }

    /**
     * Logout user and clear stored tokens
     */
    logout(): void {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.REFRESH_TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        this.currentUserSubject.next(null);
    }

    /**
     * Get current user from memory
     */
    getCurrentUser(): User | null {
        return this.currentUserSubject.value;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return !!this.getAccessToken();
    }

    /**
     * Get stored access token
     */
    getAccessToken(): string | null {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    /**
     * Get stored refresh token
     */
    getRefreshToken(): string | null {
        return localStorage.getItem(this.REFRESH_TOKEN_KEY);
    }

    // ============ Private Helpers ============

    private handleAuthResponse(response: AuthResponse): void {
        localStorage.setItem(this.TOKEN_KEY, response.accessToken);
        localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
        localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
        this.currentUserSubject.next(response.user);
    }

    private getStoredUser(): User | null {
        const userJson = localStorage.getItem(this.USER_KEY);
        return userJson ? JSON.parse(userJson) : null;
    }
}
