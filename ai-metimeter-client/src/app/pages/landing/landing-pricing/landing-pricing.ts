import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface Plan {
    name: string;
    monthlyPrice: number;
    yearlyPrice: number;
    description: string;
    features: string[];
    highlight: boolean;
    cta: string;
}

@Component({
    selector: 'app-landing-pricing',
    standalone: true,
    imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
    templateUrl: './landing-pricing.html',
    styleUrl: './landing-pricing.scss'
})
export class LandingPricing {
    isYearly = false;

    plans: Plan[] = [
        {
            name: 'Starter',
            monthlyPrice: 0,
            yearlyPrice: 0,
            description: 'Perfect for trying out our AI assessment tools.',
            features: [
                '5 AI Quizzes per month',
                'Basic Analytics',
                'PDF Export',
                'Email Support',
                'Up to 30 students'
            ],
            highlight: false,
            cta: 'Get Started Free'
        },
        {
            name: 'Pro',
            monthlyPrice: 29,
            yearlyPrice: 24,
            description: 'For educators who need power and flexibility.',
            features: [
                'Unlimited AI Quizzes',
                'Advanced Analytics',
                'Custom Branding',
                'Priority Support',
                'Team Collaboration',
                'API Access',
                'Unlimited students'
            ],
            highlight: true,
            cta: 'Start Free Trial'
        },
        {
            name: 'Enterprise',
            monthlyPrice: -1,
            yearlyPrice: -1,
            description: 'Tailored solutions for large institutions.',
            features: [
                'Everything in Pro',
                'SSO Integration',
                'Dedicated Success Manager',
                'SLA Guarantee',
                'Custom AI Models',
                'Audit Logs',
                'On-premise option'
            ],
            highlight: false,
            cta: 'Contact Sales'
        }
    ];

    toggleBilling() {
        this.isYearly = !this.isYearly;
    }

    getPrice(plan: Plan): string {
        if (plan.monthlyPrice === -1) {
            return 'Custom';
        }
        const price = this.isYearly ? plan.yearlyPrice : plan.monthlyPrice;
        return `$${price}`;
    }

    getPeriod(plan: Plan): string {
        if (plan.monthlyPrice === -1) {
            return '';
        }
        return this.isYearly ? '/mo, billed yearly' : '/month';
    }

    getSavings(): number {
        return 17; // Percentage saved with yearly billing
    }
}
