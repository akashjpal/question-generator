import { Injectable, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Controls whether the dashboard shows the normal routed pages or the
 * agentic chat interface. Mirrors ThemeService's signal + localStorage +
 * effect pattern.
 */
@Injectable({
    providedIn: 'root'
})
export class AgenticModeService {
    private readonly STORAGE_KEY = 'ai-quick-analysis-agentic-mode';
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    enabled = signal<boolean>(this.getInitialValue());

    constructor() {
        effect(() => {
            this.persist(this.enabled());
        });
    }

    private getInitialValue(): boolean {
        if (!this.isBrowser) {
            return false;
        }
        return localStorage.getItem(this.STORAGE_KEY) === 'true';
    }

    private persist(value: boolean): void {
        if (!this.isBrowser) {
            return;
        }
        localStorage.setItem(this.STORAGE_KEY, String(value));
    }

    set(value: boolean): void {
        this.enabled.set(value);
    }

    toggle(): void {
        this.enabled.set(!this.enabled());
    }
}
