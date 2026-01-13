import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

interface Stat {
    value: number;
    suffix: string;
    label: string;
    currentValue: number;
}

@Component({
    selector: 'app-landing-stats',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './landing-stats.html',
    styleUrl: './landing-stats.scss'
})
export class LandingStats implements OnInit, OnDestroy {
    private animationInterval: any;
    private isBrowser: boolean;

    stats: Stat[] = [
        { value: 50000, suffix: '+', label: 'Active Users', currentValue: 0 },
        { value: 1, suffix: 'M+', label: 'Quizzes Created', currentValue: 0 },
        { value: 99, suffix: '%', label: 'Satisfaction Rate', currentValue: 0 },
        { value: 150, suffix: '+', label: 'Countries', currentValue: 0 }
    ];

    trustedBy = [
        'Stanford University',
        'MIT',
        'Google',
        'Microsoft',
        'Harvard'
    ];

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    ngOnInit() {
        if (this.isBrowser) {
            this.animateNumbers();
        }
    }

    ngOnDestroy() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }
    }

    private animateNumbers() {
        const duration = 2000;
        const steps = 60;
        const stepDuration = duration / steps;
        let currentStep = 0;

        this.animationInterval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;
            const easeOut = 1 - Math.pow(1 - progress, 3);

            this.stats = this.stats.map(stat => ({
                ...stat,
                currentValue: Math.round(stat.value * easeOut)
            }));

            if (currentStep >= steps) {
                clearInterval(this.animationInterval);
            }
        }, stepDuration);
    }
}
