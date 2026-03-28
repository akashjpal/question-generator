import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterModule } from '@angular/router';
import { DashboardStats, RecentAssessmentReport } from '../../../models/report.model';
import { ReportService } from '../../../services/report.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { interval, Subscription, switchMap } from 'rxjs';

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
        RouterModule,
        MatProgressSpinnerModule,
        MatSlideToggleModule
    ],
    templateUrl: './reports.html',
    styleUrl: './reports.scss'
})
export class Reports implements OnDestroy {
    activeFilter: 'all' | 'week' | 'month' = 'all';
    isAutoRefresh = false;
    private autoRefreshSub?: Subscription;

    stats: DashboardStats = {
        totalAssessments: 0,
        totalParticipants: 0,
        averagePerformance: 0,
        completionRate: 0,
        recentActivity: []
    };

    recentReports: RecentAssessmentReport[] = [];

    isLoading = false;

    constructor(
        private reportService: ReportService,
        private cdr: ChangeDetectorRef
    ) {
        this.isLoading = true;
    }

    ngOnInit(): void {
        this.getReports();
    }

    getReports(): void {
        this.reportService.getDashboardStats().subscribe((reports) => {
            this.mapToStats(reports);
            this.recentReports = reports.recentActivity;
            this.isLoading = false;
            this.cdr.detectChanges();
        });
    }

    mapToStats(reports: DashboardStats): void {
        console.log(reports);
        this.stats.totalAssessments = reports.totalAssessments;
        this.stats.totalParticipants = reports.totalParticipants;
        this.stats.averagePerformance = reports.averagePerformance;
        this.stats.completionRate = reports.completionRate;
    }

    get filteredReports(): RecentAssessmentReport[] {
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

    getSubjectIcon(subject: string): string {
        const icons: Record<string, string> = {
            'biology': 'biotech',
            'history': 'history_edu',
            'mathematics': 'calculate',
            'physics': 'speed',
            'chemistry': 'science'
        };
        return icons[subject.toLowerCase()] || 'quiz';
    }

    toggleAutoRefresh(): void {
        this.isAutoRefresh = !this.isAutoRefresh;
        if (this.isAutoRefresh) {
            this.autoRefreshSub = interval(5000).pipe(
                switchMap(() => this.reportService.getDashboardStats())
            ).subscribe((reports) => {
                this.mapToStats(reports);
                this.recentReports = reports.recentActivity;
                this.cdr.detectChanges();
            });
        } else {
            this.autoRefreshSub?.unsubscribe();
        }
    }

    ngOnDestroy(): void {
        this.autoRefreshSub?.unsubscribe();
    }
}
