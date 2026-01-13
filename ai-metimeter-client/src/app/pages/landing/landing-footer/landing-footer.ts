import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing-footer',
    standalone: true,
    imports: [CommonModule, MatIconModule, RouterLink],
    templateUrl: './landing-footer.html',
    styleUrl: './landing-footer.scss'
})
export class LandingFooter {
    currentYear = new Date().getFullYear();

    footerLinks = {
        product: [
            { label: 'Features', href: '#features' },
            { label: 'Pricing', href: '#pricing' },
            { label: 'How it Works', href: '#how-it-works' },
            { label: 'Changelog', href: '#' }
        ],
        company: [
            { label: 'About', href: '#' },
            { label: 'Blog', href: '#' },
            { label: 'Careers', href: '#' },
            { label: 'Contact', href: '#' }
        ],
        resources: [
            { label: 'Documentation', href: '#' },
            { label: 'Help Center', href: '#' },
            { label: 'Community', href: '#' },
            { label: 'API', href: '#' }
        ],
        legal: [
            { label: 'Privacy', href: '#' },
            { label: 'Terms', href: '#' },
            { label: 'Cookie Policy', href: '#' }
        ]
    };

    socialLinks = [
        { icon: 'code', href: 'https://github.com', label: 'GitHub' },
        { icon: 'share', href: 'https://twitter.com', label: 'Twitter' },
        { icon: 'groups', href: 'https://linkedin.com', label: 'LinkedIn' }
    ];
}
