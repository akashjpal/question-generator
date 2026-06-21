import { ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
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
        MatTableModule,
        MatSortModule,
        MatPaginatorModule,
        RouterModule,
        MatProgressSpinnerModule,
        MatSlideToggleModule
    ],
    templateUrl: './reports.html',
    styleUrl: './reports.scss'
})
export class Reports implements OnDestroy {
    private sort?: MatSort;
    paginator?: MatPaginator;

    @ViewChild(MatSort)
    set matSort(sort: MatSort | undefined) {
        this.sort = sort;
        this.dataSource.sort = sort ?? null;
    }

    @ViewChild(MatPaginator)
    set matPaginator(paginator: MatPaginator | undefined) {
        this.paginator = paginator;
        this.dataSource.paginator = paginator ?? null;
    }

    isAutoRefresh = false;
    private autoRefreshSub?: Subscription;

    readonly displayedColumns = ['index', 'title', 'subject', 'participants', 'avgScore', 'createdAt', 'action'];
    readonly pageSize = 5;

    dataSource = new MatTableDataSource<RecentAssessmentReport>([]);

    stats: DashboardStats = {
        totalAssessments: 0,
        totalParticipants: 0,
        averagePerformance: 0,
        completionRate: 0,
        recentActivity: []
    };

    isLoading = false;

    constructor(
        private reportService: ReportService,
        private cdr: ChangeDetectorRef
    ) {
        this.isLoading = true;
        this.dataSource.sortingDataAccessor = (item, property) => (item as any)[property];
    }

    ngOnInit(): void {
        this.getReports();
    }

    getReports(): void {
        this.reportService.getDashboardStats().subscribe((reports) => {
            this.mapToStats(reports);
            this.dataSource.data = reports.recentActivity;
            this.isLoading = false;
            this.cdr.detectChanges();
            // After detectChanges the *ngIf renders paginator/sort into the DOM.
            // The @ViewChild setter fires in the same CD pass, but we re-assign
            // here as a safety net for cases where the setter fires before data loads.
            setTimeout(() => {
                if (this.paginator) this.dataSource.paginator = this.paginator;
                if (this.sort) this.dataSource.sort = this.sort;
            });
        });
    }

    mapToStats(reports: DashboardStats): void {
        this.stats.totalAssessments = reports.totalAssessments;
        this.stats.totalParticipants = reports.totalParticipants;
        this.stats.averagePerformance = reports.averagePerformance;
        this.stats.completionRate = reports.completionRate;
    }

    get rowCount(): number {
        return this.dataSource.data.length;
    }

    get paginatorOffset(): number {
        return this.paginator ? this.paginator.pageIndex * this.paginator.pageSize : 0;
    }

    getScoreClass(score: number): string {
        if (score >= 90) return 'score-excellent';
        if (score >= 80) return 'score-good';
        if (score >= 70) return 'score-average';
        return 'score-low';
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
                this.dataSource.data = reports.recentActivity;
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
