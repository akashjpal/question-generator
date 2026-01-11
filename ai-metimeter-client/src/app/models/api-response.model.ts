/**
 * Generic API Response Models
 * Standard wrappers for all API responses
 */

/**
 * Standard success response wrapper
 */
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
    timestamp?: string;
}

/**
 * Standard error response structure
 */
export interface ApiError {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, string[]>;
    };
    timestamp?: string;
}

/**
 * Paginated response wrapper for list endpoints
 */
export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}
