import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
    selector: 'app-assessment-report',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatTableModule,
        MatButtonModule,
        RouterModule
    ],
    templateUrl: './assessment-report.html',
    styleUrls: ['./assessment-report.scss']
})
export class AssessmentReport {
    assessmentId: string | null = null;

    // Mock Data
    assessmentDetails = {
        title: 'Introduction to Photosynthesis',
        subject: 'Biology',
        date: 'Dec 24, 2024',
        participants: 24,
        avgScore: 85,
        highestScore: 100,
        lowestScore: 65
    };

    displayedColumns: string[] = ['student', 'score', 'time', 'status'];
    studentResults = [
        { student: 'Alice Johnson', score: 95, time: '12m', status: 'Passed' },
        { student: 'Bob Smith', score: 82, time: '15m', status: 'Passed' },
        { student: 'Charlie Brown', score: 65, time: '18m', status: 'Failed' },
        { student: 'Diana Prince', score: 100, time: '10m', status: 'Passed' },
        { student: 'Evan Wright', score: 88, time: '14m', status: 'Passed' }
    ];

    constructor(private route: ActivatedRoute) {
        this.assessmentId = this.route.snapshot.paramMap.get('id');
        // In a real app, use this ID to fetch data
    }

    exportCSV() {
        const headers = ['Student Name', 'Score', 'Time Taken', 'Status'];
        const rows = this.studentResults.map(student => [
            student.student,
            `${student.score}%`,
            student.time,
            student.status
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `assessment_report_${this.assessmentId || 'results'}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    downloadPDF() {
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text(this.assessmentDetails.title, 14, 22);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`${this.assessmentDetails.subject} • ${this.assessmentDetails.date}`, 14, 30);

        // Stats Summary
        doc.setFontSize(12);
        doc.setTextColor(0);
        doc.text(`Participants: ${this.assessmentDetails.participants}`, 14, 45);
        doc.text(`Average Score: ${this.assessmentDetails.avgScore}%`, 14, 52);

        // Table
        const tableBody = this.studentResults.map(student => [
            student.student,
            `${student.score}%`,
            student.time,
            student.status
        ]);

        autoTable(doc, {
            head: [['Student Name', 'Score', 'Time Taken', 'Status']],
            body: tableBody,
            startY: 60,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246] } // Violet Theme
        });

        doc.save(`assessment_report_${this.assessmentId || 'results'}.pdf`);
    }
}
