import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-countdown-timer',
    standalone: true,
    imports: [CommonModule, MatIconModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="timer-pill" [class.timer-warning]="timeLeft < 60">
            <mat-icon>timer</mat-icon>
            <span>{{ display }}</span>
        </div>
    `,
    styles: [`
        .timer-pill {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 99px;
            background: var(--bg-card-hover);
            border: 1px solid var(--border-subtle);
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.9375rem;
            font-weight: 600;
            color: var(--text-primary);
            transition: all 0.2s ease;
        }

        .timer-pill mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            color: var(--text-secondary);
        }

        .timer-warning {
            background: rgba(239, 68, 68, 0.15);
            border-color: rgba(239, 68, 68, 0.4);
            color: #ef4444;
            animation: pulse-glow 1.5s ease-in-out infinite;
        }

        .timer-warning mat-icon {
            color: #ef4444;
        }

        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
            50% { box-shadow: 0 0 12px 2px rgba(239, 68, 68, 0.3); }
        }
    `]
})
export class CountdownTimerComponent implements OnInit, OnDestroy {
    @Input() totalSeconds = 0;
    @Output() timerEnd = new EventEmitter<void>();
    @Output() timeUpdate = new EventEmitter<number>();

    timeLeft = 0;
    display = '00:00:00';
    private intervalId: any;

    constructor(private cdr: ChangeDetectorRef) { }

    ngOnInit() {
        this.timeLeft = this.totalSeconds;
        this.updateDisplay();
        this.intervalId = setInterval(() => {
            if (this.timeLeft > 0) {
                this.timeLeft--;
                this.updateDisplay();
                this.timeUpdate.emit(this.timeLeft);
                this.cdr.markForCheck();
            } else {
                clearInterval(this.intervalId);
                this.timerEnd.emit();
                this.cdr.markForCheck();
            }
        }, 1000);
    }

    ngOnDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    private updateDisplay() {
        const hrs = Math.floor(this.timeLeft / 3600);
        const mins = Math.floor((this.timeLeft % 3600) / 60);
        const secs = this.timeLeft % 60;
        this.display = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}
