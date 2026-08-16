# Quiz Management System (Frontend Only)

A complete, responsive Quiz Management admin dashboard built with **HTML5, CSS3, Vanilla JavaScript (ES6+), Bootstrap 5, Font Awesome, Chart.js**, and **LocalStorage**.

No backend or build step is required. Open `index.html` in a browser.

## Quick Start

1. Open `index.html` or `login.html` — you start **logged out**.
2. Sign in with demo account: `admin@quizpro.local` / `admin123`
3. Use **Logout** to clear the session (professional auth flow).
4. Explore Dashboard, Quizzes, Questions, Categories, Participants, Attempts, Results, Reports, Leaderboard, and Settings.

**Auth note:** Frontend-only simulation (LocalStorage/sessionStorage). Not real backend security.

## Features

- Professional sidebar + topbar layout (mobile drawer)
- Dashboard summary cards + Chart.js widgets
- Quiz CRUD with filters, pagination, duplicate, activate/deactivate
- Create Quiz form with validation and toast messages
- Question Bank with dynamic fields (MCQ, True/False, Short, Fill blank)
- Categories and Participants management
- Realistic quiz attempt UI with timer, progress, mark-for-review
- Results calculation (pass/fail) + review/print
- Reports with bar/doughnut/line/area charts + CSV export
- Leaderboard with top-3 highlight
- Settings with light/dark mode (LocalStorage)
- Frontend-only login/register simulation
- Seeded demo data (8 quizzes, 30+ questions, 6 categories, 10 participants, 15 attempts)

## File Structure

```
Quiz-Management-System/
├── index.html
├── login.html
├── register.html
├── quiz.html
├── css/style.css
├── js/
│   ├── app.js
│   ├── quiz.js
│   ├── dashboard.js
│   ├── reports.js
│   └── storage.js
├── assets/
│   ├── images/
│   └── icons/
└── README.md
```

## Notes

- Persistence uses browser LocalStorage.
- Use **Settings → Reset Demo Data** to restore sample records.
- CSV export and print are implemented with JavaScript / browser print.
- This project is a frontend demonstration only — not real authentication/security.
