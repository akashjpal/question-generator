import { Component, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { PublishedQuizSummary } from '../../../../models';

@Component({
    selector: 'app-published-quiz-card',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatButtonModule],
    templateUrl: './published-quiz-card.html',
    styleUrl: './published-quiz-card.scss'
})
export class PublishedQuizCard {
    quiz = input.required<PublishedQuizSummary>();

    copiedLink = signal(false);
    copiedCode = signal(false);

    copyLink(): void {
        navigator.clipboard.writeText(this.quiz().attempt_link).then(() => {
            this.copiedLink.set(true);
            setTimeout(() => this.copiedLink.set(false), 2000);
        });
    }

    copyCode(): void {
        navigator.clipboard.writeText(this.quiz().code).then(() => {
            this.copiedCode.set(true);
            setTimeout(() => this.copiedCode.set(false), 2000);
        });
    }

    open(): void {
        window.open(this.quiz().attempt_link, '_blank');
    }
}
