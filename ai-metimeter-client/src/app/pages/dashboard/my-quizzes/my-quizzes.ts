import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { RouterModule } from '@angular/router';

interface Quiz {
    id: string;
    title: string;
    subject: string;
    createdAt: string;
    questionsCount: number;
    status: 'Published' | 'Draft';
    thumbnailUrl?: string;
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
        RouterModule
    ],
    templateUrl: './my-quizzes.html',
    styleUrl: './my-quizzes.scss'
})
export class MyQuizzes {
    viewMode: 'grid' | 'list' = 'grid';
    itemsPerPage = 10;
    displayedItems = 10;

    quizzes: Quiz[] = [
        {
            id: '1',
            title: 'Introduction to Photosynthesis',
            subject: 'Biology',
            createdAt: '2024-12-20',
            questionsCount: 15,
            status: 'Published',
        },
        {
            id: '2',
            title: 'World War II Timeline',
            subject: 'History',
            createdAt: '2024-12-18',
            questionsCount: 10,
            status: 'Draft',
        },
        {
            id: '3',
            title: 'Basic Algebra Concepts',
            subject: 'Mathematics',
            createdAt: '2024-12-15',
            questionsCount: 20,
            status: 'Published',
        },
        {
            id: '4',
            title: 'The Solar System',
            subject: 'Science',
            createdAt: '2024-12-10',
            questionsCount: 12,
            status: 'Published',
        },
        {
            id: '5',
            title: 'Cell Biology Fundamentals',
            subject: 'Biology',
            createdAt: '2024-12-08',
            questionsCount: 18,
            status: 'Published',
        },
        {
            id: '6',
            title: 'Ancient Civilizations',
            subject: 'History',
            createdAt: '2024-12-05',
            questionsCount: 14,
            status: 'Draft',
        },
        {
            id: '7',
            title: 'Geometry Basics',
            subject: 'Mathematics',
            createdAt: '2024-12-03',
            questionsCount: 16,
            status: 'Published',
        },
        {
            id: '8',
            title: 'Chemical Reactions',
            subject: 'Chemistry',
            createdAt: '2024-12-01',
            questionsCount: 22,
            status: 'Published',
        },
        {
            id: '9',
            title: 'English Literature',
            subject: 'English',
            createdAt: '2024-11-28',
            questionsCount: 15,
            status: 'Draft',
        },
        {
            id: '10',
            title: 'Physics Forces & Motion',
            subject: 'Physics',
            createdAt: '2024-11-25',
            questionsCount: 20,
            status: 'Published',
        },
        {
            id: '11',
            title: 'Geography World Map',
            subject: 'Geography',
            createdAt: '2024-11-22',
            questionsCount: 12,
            status: 'Published',
        },
        {
            id: '12',
            title: 'Computer Programming Intro',
            subject: 'Computer Science',
            createdAt: '2024-11-20',
            questionsCount: 25,
            status: 'Draft',
        }
    ];

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
