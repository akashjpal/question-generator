# AI Quick Analysis - Client

**AI Quick Analysis** is a modern, AI-powered assessment platform designed to help educators create engaging quizzes instantly and providing students with real-time feedback. This repository contains the frontend client built with **Angular 18+**.

![Project Status](https://img.shields.io/badge/Status-Development-blue)
![Framework](https://img.shields.io/badge/Framework-Angular%2018-red)
![Style](https://img.shields.io/badge/UI-Material%20Design%20%2B%20Glassmorphism-purple)

---

## 🚀 Features

### 1. Modern Landing Page
-   **Dark Premium Theme**: "Tech Grid" background with vibrant aurora (Violet/Sky Blue) gradients.
-   **Hero Section**: Glassmorphic dashboard mockup and interactive CTA buttons.
-   **Navigation**: Smooth scrolling to "Features" and "Pricing" sections.
-   **Components**: Feature cards with hover effects, 3-tier Pricing section with highlights.

### 2. Authentication
-   **Flow**: Full Login, Signup, and Forgot Password worklows.
-   **Design**: Glassmorphic auth cards consistent with the landing theme.
-   **UX**: Floating labels, password visibility toggles, and seamless routing.

### 3. Teacher Dashboard
-   **Create Assessment**: UI for uploading content (PDF/Text) to generate AI quizzes.
-   **My Quizzes**: Manage created assessments with sort/filter capabilities.
-   **Reports & Analytics**:
    -   Detailed performance stats (Avg Score, High/Low, Participants).
    -   Visual charts and data tables.
    -   **Export Tools**: Client-side **PDF Download** (via `jspdf`) and **CSV Export** for results.

### 4. Student Portal
-   **Join Quiz**: Simple code-entry interface.
-   **Interactive Quiz**: Step-by-step question flow with timer and progress tracking.
-   **Results**: Instant performance feedback and score display.

---

## 🛠 Tech Stack

-   **Framework**: Angular 18 (Standalone Components)
-   **Language**: TypeScript
-   **Styling**: SCSS (Custom mixins, CSS Variables), Angular Material
-   **Animation**: CSS Keyframes (Aurora effects, Fade-ins)
-   **Libraries**:
    -   `@angular/material`: UI Components
    -   `jspdf` & `jspdf-autotable`: PDF Generation
    -   `ngx-charts` (Prepared for analytics)

---

## 🔌 Backend Requirements (API Specification)

To make this frontend fully functional, the backend server must implement the following REST API endpoints. All responses should follow the standard wrapper format.

### Standard Response Models

```typescript
// Success Response
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Error Response
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

// Paginated Response
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
```

---

### Authentication

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & return JWT |
| `POST` | `/api/auth/signup` | Register new user |
| `POST` | `/api/auth/forgot-password` | Initiate password reset |
| `POST` | `/api/auth/reset-password` | Complete password reset |
| `POST` | `/api/auth/refresh` | Refresh access token |

<details>
<summary><strong>Request/Response Models</strong></summary>

```typescript
// POST /api/auth/login
interface LoginRequest {
  email: string;
  password: string;
}

// POST /api/auth/signup
interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

// Auth Response (login/signup)
interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: 'teacher' | 'student' | 'admin';
    avatarUrl?: string;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// POST /api/auth/forgot-password
interface ForgotPasswordRequest {
  email: string;
}

// POST /api/auth/reset-password
interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
```
</details>

---

### Assessments (Teacher)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/assessments/generate` | AI-generate quiz from content |
| `GET` | `/api/assessments` | List user's assessments |
| `GET` | `/api/assessments/:id` | Get full assessment details |
| `PUT` | `/api/assessments/:id` | Update assessment |
| `DELETE` | `/api/assessments/:id` | Delete assessment |
| `POST` | `/api/assessments/:id/publish` | Publish & generate join code |

<details>
<summary><strong>Request/Response Models</strong></summary>

```typescript
// POST /api/assessments/generate (FormData)
interface CreateAssessmentRequest {
  title: string;
  subject: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  questionsCount: number;
  content?: string;      // Text content
  file?: File;           // PDF upload (FormData)
}

// Assessment Summary (list view)
interface AssessmentSummary {
  id: string;
  title: string;
  subject: string;
  questionsCount: number;
  status: 'draft' | 'published' | 'archived';
  code?: string;
  participantsCount: number;
  avgScore?: number;
  createdAt: string;
}

// Full Assessment (detail view)
interface Assessment {
  id: string;
  title: string;
  subject: string;
  topic?: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  questions: Question[];
  questionsCount: number;
  status: 'draft' | 'published' | 'archived';
  code?: string;
  timeLimit?: number;
  createdAt: string;
  updatedAt: string;
}

// Question
interface Question {
  id: string;
  text: string;
  options: { id: string; text: string; isCorrect?: boolean }[];
  correctAnswerIndex: number;
  explanation?: string;
}
```
</details>

---

### Reports & Analytics

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/assessments/:id/stats` | Assessment statistics |
| `GET` | `/api/assessments/:id/results` | List of student attempts |
| `GET` | `/api/dashboard/stats` | Teacher dashboard summary |

<details>
<summary><strong>Response Models</strong></summary>

```typescript
// GET /api/assessments/:id/stats
interface AssessmentStats {
  assessmentId: string;
  totalParticipants: number;
  completedCount: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  averageTimeSeconds: number;
  completionRate: number;
}

// GET /api/assessments/:id/results
interface StudentResult {
  id: string;
  studentName: string;
  score: number;
  percentage: number;
  correctAnswers: number;
  totalQuestions: number;
  timeTakenSeconds: number;
  submittedAt: string;
}

// GET /api/dashboard/stats
interface DashboardStats {
  totalAssessments: number;
  totalParticipants: number;
  avgPerformance: number;
  completionRate: number;
}
```
</details>

---

### Student Quiz Flow

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/quiz/join` | Join quiz with 6-digit code |
| `GET` | `/api/quiz/:sessionId/questions` | Fetch quiz questions |
| `POST` | `/api/quiz/submit` | Submit answers |

<details>
<summary><strong>Request/Response Models</strong></summary>

```typescript
// POST /api/quiz/join
interface JoinQuizRequest {
  code: string;
  studentName: string;
  studentEmail?: string;
}

// Response
interface QuizSession {
  sessionId: string;
  assessmentId: string;
  assessmentTitle: string;
  subject: string;
  questionsCount: number;
  timeLimit?: number;
  startedAt: string;
}

// GET /api/quiz/:sessionId/questions
interface StudentQuestion {
  id: string;
  text: string;
  options: { id: string; text: string }[];
}

// POST /api/quiz/submit
interface SubmitQuizRequest {
  sessionId: string;
  answers: { questionId: string; selectedOptionIndex: number }[];
}

// Response
interface SubmitQuizResponse {
  result: StudentResult;
  correctAnswers: {
    questionId: string;
    correctOptionIndex: number;
    isCorrect: boolean;
  }[];
}
```
</details>

---


## 💻 Getting Started

### Prerequisites
-   Node.js (v18 or higher)
-   npm (v9 or higher)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/ai-quick-analysis-client.git
    cd ai-quick-analysis-client
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Development Server

Run the dev server:
```bash
npm start
```
Navigate to `http://localhost:4200/`. The app will automatically reload if you change any source files.

### Build

Build the project for production:
```bash
npm run build
```
The build artifacts will be stored in the `dist/` directory.

---

## 🎨 Design System

-   **Colors**:
    -   Primary: Zinc 950 (`#09090b`)
    -   Accents: Violet (`#8b5cf6`), Sky Blue (`#38bdf8`)
-   **Typography**: 'Inter', sans-serif

---

**Developed for AI Knowledge Management System Project.**
