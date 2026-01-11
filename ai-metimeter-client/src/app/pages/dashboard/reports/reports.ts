import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterModule } from '@angular/router';

interface ReportItem {
    id: string;
    title: string;
    subject: string;
    score: number;
    participants: number;
    date: string;
    icon: string;
}

@Component({
    selector: 'app-reports',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatButtonModule,
        MatListModule,
        MatProgressBarModule,
        RouterModule
    ],
    templateUrl: './reports.html',
    styleUrl: './reports.scss'
})
export class Reports {
    activeFilter: 'all' | 'week' | 'month' = 'all';

    stats = {
        totalAssessments: 24,
        totalParticipants: 156,
        avgPerformance: 82,
        completionRate: 94
    };

    recentReports: ReportItem[] = [
        {
            id: '1',
            title: 'Biology Quiz 101',
            subject: 'Biology',
            score: 85,
            participants: 32,
            date: '2 hours ago',
            icon: 'biotech'
        },
        {
            id: '2',
            title: 'History Mid-Term',
            subject: 'History',
            score: 92,
            participants: 28,
            date: '1 day ago',
            icon: 'history_edu'
        },
        {
            id: '3',
            title: 'Math Basics',
            subject: 'Mathematics',
            score: 78,
            participants: 45,
            date: '2 days ago',
            icon: 'calculate'
        },
        {
            id: '4',
            title: 'Physics Fundamentals',
            subject: 'Physics',
            score: 88,
            participants: 22,
            date: '3 days ago',
            icon: 'speed'
        },
        {
            id: '5',
            title: 'Chemistry Lab Quiz',
            subject: 'Chemistry',
            score: 91,
            participants: 29,
            date: '5 days ago',
            icon: 'science'
        }
    ];

    get filteredReports(): ReportItem[] {
        // In a real app, this would filter based on actual dates
        // For demo purposes, we'll show different subsets based on filter
        switch (this.activeFilter) {
            case 'week':
                // Show only first 3 (simulating this week's reports)
                return this.recentReports.slice(0, 3);
            case 'month':
                // Show first 4 (simulating this month's reports)
                return this.recentReports.slice(0, 4);
            default:
                return this.recentReports;
        }
    }

    setFilter(filter: 'all' | 'week' | 'month'): void {
        this.activeFilter = filter;
    }

    getScoreClass(score: number): string {
        if (score >= 90) return 'excellent';
        if (score >= 80) return 'good';
        if (score >= 70) return 'average';
        return 'needs-improvement';
    }

    getSubjectClass(subject: string): string {
        return subject.toLowerCase().replace(/\s+/g, '-');
    }
}
