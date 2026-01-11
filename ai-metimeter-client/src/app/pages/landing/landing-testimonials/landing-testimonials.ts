import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

interface Testimonial {
    name: string;
    role: string;
    avatar: string;
    quote: string;
    rating: number;
}

@Component({
    selector: 'app-landing-testimonials',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './landing-testimonials.html',
    styleUrl: './landing-testimonials.scss'
})
export class LandingTestimonials implements OnInit, OnDestroy {
    private autoplayInterval: any;
    private isBrowser: boolean;
    currentIndex = 0;

    testimonials: Testimonial[] = [
        {
            name: 'Dr. Sarah Chen',
            role: 'Professor at Stanford University',
            avatar: 'SC',
            quote: 'AI Quick Analysis has revolutionized how I create assessments. What used to take hours now takes minutes. The AI-generated questions are surprisingly accurate and relevant.',
            rating: 5
        },
        {
            name: 'Michael Torres',
            role: 'High School Teacher',
            avatar: 'MT',
            quote: 'My students are more engaged than ever. The real-time feedback feature helps me identify struggling students immediately and adjust my teaching on the fly.',
            rating: 5
        },
        {
            name: 'Emily Watson',
            role: 'Corporate Trainer at Google',
            avatar: 'EW',
            quote: 'We use AI Quick Analysis for all our internal training assessments. The analytics dashboard gives us invaluable insights into our team\'s learning progress.',
            rating: 5
        },
        {
            name: 'Prof. James Liu',
            role: 'Department Head, MIT',
            avatar: 'JL',
            quote: 'The quality of AI-generated questions rivals those created by experienced educators. This tool has become essential for our large-scale courses.',
            rating: 5
        }
    ];

    constructor(@Inject(PLATFORM_ID) platformId: Object) {
        this.isBrowser = isPlatformBrowser(platformId);
    }

    ngOnInit() {
        if (this.isBrowser) {
            this.startAutoplay();
        }
    }

    ngOnDestroy() {
        this.stopAutoplay();
    }

    private startAutoplay() {
        this.autoplayInterval = setInterval(() => {
            this.next();
        }, 5000);
    }

    private stopAutoplay() {
        if (this.autoplayInterval) {
            clearInterval(this.autoplayInterval);
        }
    }

    next() {
        this.currentIndex = (this.currentIndex + 1) % this.testimonials.length;
    }

    prev() {
        this.currentIndex = (this.currentIndex - 1 + this.testimonials.length) % this.testimonials.length;
    }

    goTo(index: number) {
        this.currentIndex = index;
        this.stopAutoplay();
        this.startAutoplay();
    }

    getStars(rating: number): number[] {
        return Array(rating).fill(0);
    }
}
