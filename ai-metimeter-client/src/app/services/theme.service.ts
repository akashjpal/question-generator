import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly STORAGE_KEY = 'ai-quick-analysis-theme';

    // Signal for reactive theme state
    currentTheme = signal<Theme>(this.getInitialTheme());

    constructor() {
        // Apply theme whenever it changes
        effect(() => {
            this.applyTheme(this.currentTheme());
        });
    }

    /**
     * Get initial theme from localStorage or system preference
     */
    private getInitialTheme(): Theme {
        // Check localStorage first
        const stored = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
        if (stored === 'dark' || stored === 'light') {
            return stored;
        }

        // Fall back to system preference
        if (typeof window !== 'undefined' && window.matchMedia) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            return prefersDark ? 'dark' : 'light';
        }

        // Default to dark
        return 'dark';
    }

    /**
     * Apply theme class to document body
     */
    private applyTheme(theme: Theme): void {
        if (typeof document !== 'undefined') {
            const body = document.body;
            body.classList.remove('dark-theme', 'light-theme');
            body.classList.add(`${theme}-theme`);

            // Store preference
            localStorage.setItem(this.STORAGE_KEY, theme);
        }
    }

    /**
     * Set specific theme
     */
    setTheme(theme: Theme): void {
        this.currentTheme.set(theme);
    }

    /**
     * Toggle between dark and light
     */
    toggleTheme(): void {
        const newTheme = this.currentTheme() === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    /**
     * Check if current theme is dark
     */
    isDarkMode(): boolean {
        return this.currentTheme() === 'dark';
    }
}
