/**
 * Authentication Models
 * Request and response interfaces for auth endpoints
 */

// ============ Request Models ============

/**
 * POST /api/auth/login
 */
export interface LoginRequest {
    email: string;
    password: string;
}

/**
 * POST /api/auth/signup
 */
export interface SignupRequest {
    name: string;
    email: string;
    password: string;
}

/**
 * POST /api/auth/forgot-password
 */
export interface ForgotPasswordRequest {
    email: string;
}

/**
 * POST /api/auth/reset-password
 */
export interface ResetPasswordRequest {
    token: string;
    newPassword: string;
}

// ============ Response Models ============

/**
 * User profile data
 */
export interface User {
    id: string;
    name: string;
    email: string;
    role: 'teacher' | 'student' | 'admin';
    avatarUrl?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Authentication response with JWT tokens
 */
export interface AuthResponse {
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number; // Token expiration in seconds
}

/**
 * Token refresh response
 */
export interface RefreshTokenResponse {
    accessToken: string;
    expiresIn: number;
}
