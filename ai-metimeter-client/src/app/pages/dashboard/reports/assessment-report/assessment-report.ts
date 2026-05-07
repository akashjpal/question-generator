import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportService } from '../../../../services/report.service';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, Subscription, switchMap } from 'rxjs';
import { error } from 'console';

interface AssessmentDetails {
    title: string;
    subject: string;
    date: string;
    participants: number;
    avgScore: number;
    highestScore: number;
    lowestScore: number;
}

interface StudentRow {
    student: string;
    score: number;
    time: string;
    status: string;
}

@Component({
    selector: 'app-assessment-report',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatTableModule,
        MatButtonModule,
        RouterModule,
        MatProgressSpinner,
        MatSlideToggleModule
    ],
    templateUrl: './assessment-report.html',
    styleUrls: ['./assessment-report.scss']
})
export class AssessmentReport {
    private readonly route = inject(ActivatedRoute);
    private readonly reportsService = inject(ReportService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly destroyRef = inject(DestroyRef);

    readonly assessmentId: string | null = this.route.snapshot.paramMap.get('id');
    isAutoRefresh = false;
    isLoading = false;
    private autoRefreshSub?: Subscription;

    assessmentDetails: AssessmentDetails = {
        title: '', subject: '', date: '',
        participants: 0, avgScore: 0, highestScore: 0, lowestScore: 0
    };
    displayedColumns = ['student', 'score', 'time', 'status'];
    studentResults: StudentRow[] = [];

    constructor() {
        if (this.assessmentId) {
            this.isLoading = true;
            this.reportsService.getDashboardStatsOfAssessment(this.assessmentId)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                    next: (data) => {
                        console.log('Received assessment stats:', data);

                        this.applyResponse(data);
                        this.isLoading = false;

                        this.cdr.markForCheck();
                    },

                    error: (err) => {
                        console.error('Failed to fetch assessment stats:', err);

                        this.isLoading = false;

                        // show toast/snackbar/message
                        // example:
                        // this.toastService.error('Failed to load assessment stats');

                        this.cdr.markForCheck();
                    }
                });
        }
    }

    private applyResponse(data: any): void {
        this.assessmentDetails = {
            title: data.title,
            subject: data.subject,
            date: data.date,
            participants: data.participants,
            avgScore: data.avgScore,
            highestScore: data.highestScore,
            lowestScore: data.lowestScore
        };
        this.studentResults = (data.studentResults ?? []).map((s: any) => ({
            ...s,
            student: s.student.split('-')[0] + '.'
        }));
    }

    toggleAutoRefresh(): void {
        this.isAutoRefresh = !this.isAutoRefresh;

        if (this.isAutoRefresh && this.assessmentId) {
            this.autoRefreshSub = interval(5000).pipe(
                switchMap(() => this.reportsService.getDashboardStatsOfAssessment(this.assessmentId!)),
                takeUntilDestroyed(this.destroyRef)
            ).subscribe((data) => {
                this.applyResponse(data);
                this.cdr.markForCheck();
            });
        } else {
            this.autoRefreshSub?.unsubscribe();
        }
    }

    exportCSV(): void {
        const headers = ['Student Name', 'Score', 'Time Taken', 'Status'];
        const rows = this.studentResults.map(s => [s.student, `${s.score}%`, s.time, s.status]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `assessment_report_${this.assessmentId ?? 'results'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    downloadPDF(): void {
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text(this.assessmentDetails.title, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${this.assessmentDetails.subject} • ${this.assessmentDetails.date}`, 14, 30);
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Participants: ${this.assessmentDetails.participants}`, 14, 45);
        doc.text(`Average Score: ${this.assessmentDetails.avgScore}%`, 14, 52);
        autoTable(doc, {
            head: [['Student Name', 'Score', 'Time Taken', 'Status']],
            body: this.studentResults.map(s => [s.student, `${s.score}%`, s.time, s.status]),
            startY: 60,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246] }
        });
        doc.save(`assessment_report_${this.assessmentId ?? 'results'}.pdf`);
    }
}
