import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router } from '@angular/router';
import { AssessmentService } from '../../../services/assessment.service';
import { AssessmentListItem } from '../../../models';

interface Quiz {
    id: string;
    title: string;
    subject: string;
    createdAt: string;
    questionsCount: number;
    status: 'Published' | 'Draft';
    difficulty: string;
    thumbnailUrl?: string;
    timelimit?: number;
    attempts?: number;
    code?: string;
}

@Component({
    selector: 'app-my-quizzes',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatMenuModule,
        MatDividerModule,
        RouterModule,
        MatProgressSpinnerModule
    ],
    templateUrl: './my-quizzes.html',
    styleUrl: './my-quizzes.scss'
})
export class MyQuizzes implements OnInit {
    viewMode: 'grid' | 'list' = 'grid';
    itemsPerPage = 10;
    displayedItems = 10;
    isLoading = true;

    quizzes: Quiz[] = [];

    constructor(
        private assessmentService: AssessmentService,
        private cdr: ChangeDetectorRef,
        private router: Router
    ) { }

    ngOnInit(): void {
        this.loadAssessments();
    }

    loadAssessments(): void {
        this.isLoading = true;
        this.assessmentService.getAllAssessments().subscribe({
            next: (response) => {
                this.quizzes = response.data.map((item: AssessmentListItem) => this.mapToQuiz(item));
                this.isLoading = false;
                console.log('Loaded assessments:', this.quizzes);
                this.cdr.detectChanges();
            },
            error: (err) => {
                console.error('Failed to load assessments:', err);
                this.isLoading = false;
                this.cdr.detectChanges();
            }
        });
    }

    private mapToQuiz(item: AssessmentListItem): Quiz {
        // Parse questions JSON to get count
        let questionsCount = 0;
        try {
            const questions = JSON.parse(item.questions);
            questionsCount = Array.isArray(questions) ? questions.length : 0;
        } catch {
            questionsCount = 0;
        }

        return {
            id: item.id.toString(),
            title: item.title,
            subject: item.subject,
            createdAt: new Date().toISOString().split('T')[0], // Use current date if not available
            questionsCount: questionsCount,
            status: item.status === 1 ? 'Published' : 'Draft',
            difficulty: item.difficulty,
            timelimit: item.timeLimit ?? 0,
            attempts: item.attemptsCount ?? 0,
            code: item.code ?? ""
        };
    }

    selectedFilter: 'All' | 'Draft' | 'Published' = 'All';

    get filteredQuizzes(): Quiz[] {
        let filtered = this.quizzes;
        if (this.selectedFilter !== 'All') {
            filtered = this.quizzes.filter(quiz => quiz.status === this.selectedFilter);
        }
        return filtered;
    }

    get displayedQuizzes(): Quiz[] {
        return this.filteredQuizzes.slice(0, this.displayedItems);
    }

    get hasMoreQuizzes(): boolean {
        return this.displayedItems < this.filteredQuizzes.length;
    }

    get remainingCount(): number {
        return this.filteredQuizzes.length - this.displayedItems;
    }

    setFilter(filter: 'All' | 'Draft' | 'Published') {
        this.selectedFilter = filter;
        this.displayedItems = this.itemsPerPage; // Reset pagination when filter changes
    }

    loadMore() {
        this.displayedItems += this.itemsPerPage;
    }

    publishQuiz(quiz: Quiz) {
        if (confirm(`Are you sure you want to publish "${quiz.title}"?`)) {
            this.assessmentService.publishAssessment(quiz.id).subscribe({
                next: () => {
                    // quiz.status = 'Published';
                    // this.cdr.detectChanges();
                    this.loadAssessments();
                    this.cdr.detectChanges();
                },
                error: (err) => console.error('Failed to publish quiz:', err)
            });
        }
    }

    deleteQuiz(quiz: Quiz) {
        if (confirm(`Are you sure you want to delete "${quiz.title}"? This action cannot be undone.`)) {
            this.assessmentService.deleteAssessment(quiz.id).subscribe({
                next: () => {
                    this.loadAssessments(); // Reload list
                    // Alternatively, remove locally:
                    // this.quizzes = this.quizzes.filter(q => q.id !== quiz.id);
                    // this.cdr.detectChanges();
                },
                error: (err) => {
                    console.error('Failed to delete quiz:', err);
                    alert('Failed to delete assessment');
                }
            });
        }
    }

    editQuiz(quiz: Quiz) {
        this.router.navigate(['/dashboard/create-assessment', quiz.id]);
    }

    setViewMode(mode: 'grid' | 'list') {
        this.viewMode = mode;
    }

    getPublishedCount(): number {
        return this.quizzes.filter(q => q.status === 'Published').length;
    }

    getDraftCount(): number {
        return this.quizzes.filter(q => q.status === 'Draft').length;
    }

    getSubjectIcon(subject: string): string {
        const icons: Record<string, string> = {
            'Biology': 'biotech',
            'History': 'history_edu',
            'Mathematics': 'calculate',
            'Science': 'science',
            'Chemistry': 'science',
            'Physics': 'speed',
            'English': 'menu_book',
            'Geography': 'public',
            'Computer Science': 'code'
        };
        return icons[subject] || 'school';
    }

    getSubjectClass(subject: string): string {
        return subject.toLowerCase().replace(/\s+/g, '-');
    }
}
