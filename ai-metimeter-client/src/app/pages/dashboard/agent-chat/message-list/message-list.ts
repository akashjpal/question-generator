import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AgentChatBubble } from '../../../../models';
import { PublishedQuizCard } from '../published-quiz-card/published-quiz-card';

@Component({
    selector: 'app-agent-message-list',
    standalone: true,
    imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, PublishedQuizCard],
    templateUrl: './message-list.html',
    styleUrl: './message-list.scss'
})
export class MessageList {
    bubbles = input.required<AgentChatBubble[]>();
}
