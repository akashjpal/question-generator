import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-landing-how-it-works',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    templateUrl: './landing-how-it-works.html',
    styleUrl: './landing-how-it-works.scss'
})
export class LandingHowItWorks {
    steps = [
        {
            number: '01',
            icon: 'cloud_upload',
            title: 'Upload Your Content',
            description: 'Simply drag and drop your PDFs, images, or documents. Our system accepts files up to 5MB.',
            color: '#60a5fa'
        },
        {
            number: '02',
            icon: 'psychology',
            title: 'AI Analysis',
            description: 'Our advanced AI reads and understands your content, identifying key concepts and learning objectives.',
            color: '#8b5cf6'
        },
        {
            number: '03',
            icon: 'edit_note',
            title: 'Review & Customize',
            description: 'Edit generated questions, adjust difficulty, add your own questions, or regenerate with different parameters.',
            color: '#f472b6'
        },
        {
            number: '04',
            icon: 'rocket_launch',
            title: 'Launch & Engage',
            description: 'Share your quiz with students instantly. Watch real-time responses and engagement analytics.',
            color: '#34d399'
        }
    ];
}
