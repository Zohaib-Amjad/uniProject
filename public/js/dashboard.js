/**
 * QuizPro Admin — Phase 5 Dashboard (js/dashboard.js)
 * Summary cards, responsive Chart.js widgets with theme-awareness,
 * period toggling (Daily/Weekly/Monthly), and recent attempts table.
 */
const Dashboard = (() => {
  let charts = [];
  let currentActivityPeriod = 'daily';

  /* ---------- Chart Cleanup ---------- */
  function destroyCharts() {
    charts.forEach((c) => {
      try {
        if (c && typeof c.destroy === 'function') c.destroy();
      } catch (_) {}
    });
    charts = [];
    ['chartQuizPerformance', 'chartParticipantActivity', 'chartCategoryPerformance'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && typeof Chart !== 'undefined' && Chart.getChart) {
        try { Chart.getChart(el)?.destroy(); } catch (_) {}
      }
    });
  }

  /* ---------- Theme-aware Colors for Chart.js ---------- */
  function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      isDark,
      textColor: isDark ? '#94a3b8' : '#64748b',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      borderColor: isDark ? '#283548' : '#e2e8f0',
      tooltipBg: isDark ? '#1e293b' : '#0f172a',
      tooltipText: '#ffffff'
    };
  }

  /* ---------- Compute Live Stats from LocalStorage ---------- */
  function stats() {
    const quizzes = QMS.quizzes.all() || [];
    const questions = QMS.questions.all() || [];
    const participants = QMS.participants.all() || [];
    const results = QMS.results.all() || [];

    const activeQuizzes = quizzes.filter((q) => q.status === 'Active').length;
    const completedQuizzes = new Set(
      results.filter((r) => r.status === 'Passed' || r.status === 'Failed').map((r) => r.quizId)
    ).size;

    const avgScore = results.length
      ? Math.round(results.reduce((sum, r) => sum + Number(r.percentage || 0), 0) / results.length)
      : 0;

    const passRate = results.length
      ? Math.round((results.filter((r) => r.status === 'Passed').length / results.length) * 100)
      : 0;

    return {
      totalQuizzes: quizzes.length,
      activeQuizzes,
      totalQuestions: questions.length,
      totalParticipants: participants.length,
      totalAttempts: results.length,
      completedQuizzes,
      averageScore: avgScore,
      passRate
    };
  }

  /* ---------- Render 8 Summary Cards (5.1) ---------- */
  function renderCards(root) {
    if (!root) return;
    const s = stats();

    const items = [
      {
        label: 'Total Quizzes',
        value: s.totalQuizzes,
        icon: 'fa-solid fa-list-check',
        color: '#0f6e56',
        bg: 'rgba(15, 110, 86, 0.12)'
      },
      {
        label: 'Active Quizzes',
        value: s.activeQuizzes,
        icon: 'fa-solid fa-bolt',
        color: '#16a34a',
        bg: 'rgba(22, 163, 74, 0.12)'
      },
      {
        label: 'Total Questions',
        value: s.totalQuestions,
        icon: 'fa-solid fa-circle-question',
        color: '#0284c7',
        bg: 'rgba(2, 132, 199, 0.12)'
      },
      {
        label: 'Total Participants',
        value: s.totalParticipants,
        icon: 'fa-solid fa-users',
        color: '#7c3aed',
        bg: 'rgba(124, 58, 237, 0.12)'
      },
      {
        label: 'Total Attempts',
        value: s.totalAttempts,
        icon: 'fa-solid fa-stopwatch',
        color: '#d97706',
        bg: 'rgba(217, 119, 6, 0.12)'
      },
      {
        label: 'Completed Quizzes',
        value: s.completedQuizzes,
        icon: 'fa-solid fa-circle-check',
        color: '#0d9488',
        bg: 'rgba(13, 148, 136, 0.12)'
      },
      {
        label: 'Average Score',
        value: `${s.averageScore}%`,
        icon: 'fa-solid fa-chart-line',
        color: '#2563eb',
        bg: 'rgba(37, 99, 235, 0.12)'
      },
      {
        label: 'Pass Rate',
        value: `${s.passRate}%`,
        icon: 'fa-solid fa-award',
        color: '#e11d48',
        bg: 'rgba(225, 29, 72, 0.12)'
      }
    ];

    root.innerHTML = items
      .map(
        (it) => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${it.bg}; color:${it.color}">
            <i class="${it.icon}"></i>
          </div>
          <div>
            <h3>${it.value}</h3>
            <span>${it.label}</span>
          </div>
        </div>
      `
      )
      .join('');
  }

  /* ---------- Render All 3 Charts (5.2) ---------- */
  function renderCharts() {
    destroyCharts();
    if (typeof Chart === 'undefined') return;

    const theme = getThemeColors();
    renderQuizPerformanceChart(theme);
    renderParticipantActivityChart(theme, currentActivityPeriod);
    renderCategoryPerformanceChart(theme);
  }

  /* 1. Quiz Performance (Dual-axis Combo Chart: Attempts & Avg Score %) */
  function renderQuizPerformanceChart(theme) {
    const canvas = document.getElementById('chartQuizPerformance');
    if (!canvas) return;

    const results = QMS.results.all() || [];
    const quizzes = (QMS.quizzes.all() || []).filter((q) => q.status !== 'Archived').slice(0, 8);

    const labels = [];
    const avgScores = [];
    const attempts = [];

    quizzes.forEach((q) => {
      const rows = results.filter((r) => r.quizId === q.id);
      labels.push(q.title.length > 18 ? q.title.slice(0, 18) + '…' : q.title);
      const avg = rows.length ? Math.round(rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0) / rows.length) : 0;
      avgScores.push(avg);
      attempts.push(rows.length);
    });

    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(canvas)?.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Attempts',
            data: attempts,
            backgroundColor: theme.isDark ? 'rgba(43, 184, 146, 0.7)' : 'rgba(15, 110, 86, 0.75)',
            borderColor: theme.isDark ? '#2bb892' : '#0f6e56',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y',
            order: 2
          },
          {
            type: 'line',
            label: 'Avg Score %',
            data: avgScores,
            borderColor: theme.isDark ? '#38bdf8' : '#2563eb',
            backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(37, 99, 235, 0.15)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.35,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: theme.textColor, font: { family: 'Inter', size: 12 } }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === 'y1') {
                  return ` Average Score: ${ctx.raw}%`;
                }
                return ` Attempts: ${ctx.raw}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: theme.textColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
              color: theme.textColor,
              font: { family: 'Inter', size: 11 }
            },
            grid: { color: theme.gridColor }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            max: 100,
            ticks: {
              color: theme.textColor,
              callback: (v) => `${v}%`,
              font: { family: 'Inter', size: 11 }
            },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });

    charts.push(chart);
  }

  /* 2. Participant Activity Chart with Period Toggle (Daily / Weekly / Monthly) */
  function renderParticipantActivityChart(theme, period = 'daily') {
    const canvas = document.getElementById('chartParticipantActivity');
    if (!canvas) return;

    // Destroy only the activity chart if it's already rendered
    const existingIndex = charts.findIndex((c) => c.canvas === canvas);
    if (existingIndex !== -1) {
      charts[existingIndex].destroy();
      charts.splice(existingIndex, 1);
    }

    const results = QMS.results.all() || [];

    let labels = [];
    let data = [];
    let labelText = 'Attempts';

    if (period === 'daily') {
      labelText = 'Daily Attempts (by Day of Week)';
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const counts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      results.forEach((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const dayStr = d.toLocaleDateString('en-US', { weekday: 'short' });
        if (counts[dayStr] !== undefined) counts[dayStr]++;
      });
      labels = days;
      data = days.map((d) => counts[d] || 0);
    } else if (period === 'weekly') {
      labelText = 'Weekly Attempts';
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
      const counts = [0, 0, 0, 0, 0];
      results.forEach((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const weekIdx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
        counts[weekIdx]++;
      });
      data = counts;
    } else {
      // Monthly
      labelText = 'Monthly Attempts';
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const counts = {};
      monthNames.forEach((m) => (counts[m] = 0));
      results.forEach((r) => {
        const d = new Date(r.date);
        if (isNaN(d.getTime())) return;
        const m = monthNames[d.getMonth()];
        counts[m] = (counts[m] || 0) + 1;
      });
      labels = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      data = labels.map((m) => counts[m] || 0);
    }

    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(canvas)?.destroy();
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: labelText,
            data,
            borderColor: theme.isDark ? '#2bb892' : '#0f6e56',
            backgroundColor: theme.isDark ? 'rgba(43, 184, 146, 0.18)' : 'rgba(15, 110, 86, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: theme.isDark ? '#2bb892' : '#0f6e56'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: theme.textColor, font: { family: 'Inter', size: 12 } }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              label(ctx) {
                return ` ${ctx.raw} attempt${ctx.raw === 1 ? '' : 's'}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: theme.gridColor },
            ticks: { color: theme.textColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              precision: 0,
              color: theme.textColor,
              font: { family: 'Inter', size: 11 }
            },
            grid: { color: theme.gridColor }
          }
        }
      }
    });

    charts.push(chart);
  }

  /* 3. Category Performance Chart */
  function renderCategoryPerformanceChart(theme) {
    const canvas = document.getElementById('chartCategoryPerformance');
    if (!canvas) return;

    const categories = QMS.categories.all() || [];
    const results = QMS.results.all() || [];
    const quizzes = QMS.quizzes.all() || [];

    const catLabels = [];
    const catScores = [];
    const catAttempts = [];

    categories.forEach((cat) => {
      catLabels.push(cat.name);
      const catQuizIds = quizzes.filter((q) => q.categoryId === cat.id || q.categoryId === cat.altId).map((q) => q.id);
      const rows = results.filter((r) => catQuizIds.includes(r.quizId));
      catAttempts.push(rows.length);
      const avg = rows.length ? Math.round(rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0) / rows.length) : 0;
      catScores.push(avg);
    });

    const palette = ['#0f6e56', '#2563eb', '#d97706', '#7c3aed', '#e11d48', '#0d9488'];

    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(canvas)?.destroy();
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [
          {
            data: catScores.map((score) => (score > 0 ? score : 5)),
            backgroundColor: palette,
            borderWidth: theme.isDark ? 2 : 1,
            borderColor: theme.isDark ? '#141b26' : '#ffffff',
            hoverOffset: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: theme.textColor,
              font: { family: 'Inter', size: 11 },
              padding: 12,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              label(ctx) {
                const idx = ctx.dataIndex;
                const score = catScores[idx] || 0;
                const count = catAttempts[idx] || 0;
                return ` ${ctx.label}: ${score}% Avg Score (${count} attempts)`;
              }
            }
          }
        },
        cutout: '62%'
      }
    });

    charts.push(chart);
  }

  /* ---------- Recent Quiz Attempts Table (5.3) ---------- */
  function recentAttemptsHTML() {
    const results = QMS.results.all() || [];
    const rows = [...results]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 10);

    if (!rows.length) {
      return `
        <div class="empty-state text-center py-4">
          <i class="fa-solid fa-inbox mb-2" style="font-size:2rem;opacity:0.35"></i>
          <p class="text-muted mb-0">No quiz attempts recorded yet.</p>
        </div>
      `;
    }

    const bodyHtml = rows
      .map((r) => {
        const participantName = QMS.participantName(r.participantId);
        const quizTitle = QMS.quizTitle(r.quizId);
        const dateFormatted = new Date(r.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        const isPassed = r.status === 'Passed';
        const badgeHtml = isPassed
          ? `<span class="badge-soft badge-success"><i class="fa-solid fa-circle-check"></i> Passed</span>`
          : `<span class="badge-soft badge-danger"><i class="fa-solid fa-circle-xmark"></i> Failed</span>`;

        return `
        <tr>
          <td data-label="Participant Name">
            <strong>${escapeHtml(participantName)}</strong>
            <small class="d-block text-muted" style="font-size:0.75rem">${r.participantId || ''}</small>
          </td>
          <td data-label="Quiz Name">${escapeHtml(quizTitle)}</td>
          <td data-label="Date">${dateFormatted}</td>
          <td data-label="Score">
            <strong>${r.obtainedMarks ?? r.score}</strong> / ${r.totalMarks || 0}
          </td>
          <td data-label="Percentage">
            <span class="fw-semibold ${r.percentage >= 60 ? 'text-success' : 'text-danger'}">${r.percentage}%</span>
          </td>
          <td data-label="Status">${badgeHtml}</td>
          <td data-label="Action">
            <button type="button" class="btn btn-sm btn-outline-brand" data-view-result="${r.id}">
              <i class="fa-regular fa-eye me-1"></i>View Result
            </button>
          </td>
        </tr>
      `;
      })
      .join('');

    return `
      <div class="table-wrap">
        <table class="data-table table-cards" id="recentAttemptsTable">
          <thead>
            <tr>
              <th>Participant Name</th>
              <th>Quiz Name</th>
              <th>Date</th>
              <th>Score</th>
              <th>Percentage</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /* ---------- View Result Details Modal (5.3) ---------- */
  function viewResultDetails(resultId) {
    const r = QMS.results.get(resultId);
    if (!r) {
      if (typeof App !== 'undefined' && App.toast) App.toast('Result not found', 'error');
      return;
    }

    const modalBody = document.getElementById('resultModalBody');
    const modalTitle = document.getElementById('resultModalTitle');
    const modalSubtitle = document.getElementById('resultModalSubtitle');
    const candidateLink = document.getElementById('btnOpenCandidateResult');

    const participantName = QMS.participantName(r.participantId);
    const quizTitle = QMS.quizTitle(r.quizId);

    if (modalTitle) modalTitle.textContent = `${quizTitle} — Attempt Breakdown`;
    if (modalSubtitle) modalSubtitle.textContent = `Candidate: ${participantName} · ${r.id}`;
    if (candidateLink) candidateLink.href = `quiz.html?result=${encodeURIComponent(r.id)}`;

    const isPassed = r.status === 'Passed';
    const statusBadge = isPassed
      ? `<span class="badge-soft badge-success fs-6"><i class="fa-solid fa-circle-check me-1"></i>Passed</span>`
      : `<span class="badge-soft badge-danger fs-6"><i class="fa-solid fa-circle-xmark me-1"></i>Failed</span>`;

    const quiz = QMS.quizzes.get(r.quizId);
    const showCorrectAnswers = quiz?.showCorrectAnswers !== false && quiz?.options?.showCorrectAnswers !== false;

    const timeFormatted = r.timeTaken
      ? `${Math.floor(r.timeTaken / 60)}m ${r.timeTaken % 60}s`
      : '—';

    let breakdownHtml = '';
    const answers = r.breakdown || r.answers || [];
    if (Array.isArray(answers) && answers.length) {
      breakdownHtml = `
        <h6 class="fw-bold mb-2 mt-4"><i class="fa-solid fa-list-ol me-1 text-primary"></i> Question-by-Question Breakdown:</h6>
        ${!showCorrectAnswers ? `
          <div class="alert alert-info py-2 px-3 small mb-2">
            <i class="fa-solid fa-circle-info me-1"></i> Correct answers and explanations are hidden by quiz configuration.
          </div>` : ''}
        <div class="table-responsive">
          <table class="table table-sm table-bordered align-middle mb-0" style="font-size:0.85rem">
            <thead class="table-light">
              <tr>
                <th style="width:45%">Question</th>
                <th>Selected Answer</th>
                <th>${showCorrectAnswers ? 'Correct Answer' : 'Status'}</th>
                <th style="width:10%" class="text-center">Result</th>
              </tr>
            </thead>
            <tbody>
              ${answers
                .map((a, i) => {
                  const correct = a.isCorrect || a.result === 'correct';
                  const unans = a.result === 'unanswered' || (!a.selectedAnswer && !a.selected);
                  const qObj = QMS.questions.get(a.questionId);
                  const explanation = a.explanation || qObj?.explanation || '';

                  const resultIcon = correct
                    ? `<span class="text-success fw-bold"><i class="fa-solid fa-circle-check fs-6 me-1"></i>Correct</span>`
                    : unans
                    ? `<span class="text-muted fw-bold">—</span>`
                    : `<span class="text-danger fw-bold"><i class="fa-solid fa-circle-xmark fs-6 me-1"></i>Incorrect</span>`;

                  return `
                  <tr>
                    <td>
                      <div><strong>Q${i + 1}:</strong> ${escapeHtml(a.question || a.questionId)}</div>
                      ${showCorrectAnswers && explanation ? `
                        <div class="small text-muted mt-1 fst-italic">
                          <i class="fa-solid fa-lightbulb text-warning me-1"></i><strong>Explanation:</strong> ${escapeHtml(explanation)}
                        </div>` : ''}
                    </td>
                    <td><code>${escapeHtml(a.selectedAnswer || a.selected || '—')}</code></td>
                    <td>${showCorrectAnswers ? `<code class="text-success">${escapeHtml(a.correctAnswer || '—')}</code>` : statusBadge}</td>
                    <td class="text-center">${resultIcon}</td>
                  </tr>
                `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (modalBody) {
      modalBody.innerHTML = `
        <div class="text-center mb-3">
          <div class="score-circle-indicator" style="--circle-color:${isPassed ? '#16a34a' : '#dc2626'}; --score-pct:${r.percentage || 0}">
            <div class="score-circle-inner">
              <span class="score-circle-pct ${isPassed ? 'text-success' : 'text-danger'}">${r.percentage}%</span>
              <span class="score-circle-label ${isPassed ? 'text-success' : 'text-danger'}">${isPassed ? 'PASSED' : 'FAILED'}</span>
            </div>
          </div>
          <div class="fw-semibold text-muted">Passing Requirement: ${quiz?.passingPercentage || 60}%</div>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-md-3 col-6">
            <div class="p-2 border rounded bg-light text-center">
              <small class="text-muted d-block">Score / Total</small>
              <strong class="fs-5">${r.obtainedMarks ?? r.score} / ${r.totalMarks || 0}</strong>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="p-2 border rounded bg-light text-center">
              <small class="text-muted d-block">Percentage</small>
              <strong class="fs-5 ${r.percentage >= (quiz?.passingPercentage || 60) ? 'text-success' : 'text-danger'}">${r.percentage}%</strong>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="p-2 border rounded bg-light text-center">
              <small class="text-muted d-block">Time Taken</small>
              <strong class="fs-5">${timeFormatted}</strong>
            </div>
          </div>
          <div class="col-md-3 col-6">
            <div class="p-2 border rounded bg-light text-center">
              <small class="text-muted d-block">Status</small>
              <div class="mt-1">${statusBadge}</div>
            </div>
          </div>
        </div>

        <div class="small text-muted mb-2">
          <i class="fa-regular fa-calendar me-1"></i> Attempt Date: ${new Date(r.date).toLocaleString()}
        </div>

        ${breakdownHtml}
      `;
    }

    const printBtn = document.getElementById('btnPrintModalResult');
    if (printBtn) {
      printBtn.onclick = () => window.print();
    }

    if (typeof App !== 'undefined' && App.openModal) {
      App.openModal('resultModal');
    } else {
      const modalEl = document.getElementById('resultModal');
      if (modalEl && window.bootstrap?.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      }
    }
  }

  /* ---------- Event Binding for Activity Period Toggle ---------- */
  function bindPeriodToggle() {
    const group = document.getElementById('activityPeriodToggle');
    if (!group) return;

    group.querySelectorAll('button[data-period]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const period = btn.dataset.period;
        if (!period || period === currentActivityPeriod) return;

        currentActivityPeriod = period;
        group.querySelectorAll('button[data-period]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const theme = getThemeColors();
        renderParticipantActivityChart(theme, currentActivityPeriod);
      });
    });
  }

  /* ---------- Theme Update Handler ---------- */
  function updateTheme() {
    renderCharts();
  }

  /* ---------- Helper: HTML Escaping ---------- */
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------- Primary Dashboard Render Method ---------- */
  function render() {
    const cardsRoot = document.getElementById('dashboardStats');
    const recentRoot = document.getElementById('recentAttempts');

    if (cardsRoot) renderCards(cardsRoot);
    if (recentRoot) recentRoot.innerHTML = recentAttemptsHTML();

    bindPeriodToggle();

    // Render charts asynchronously to ensure DOM containers have settled dimensions
    setTimeout(renderCharts, 40);
  }

  return {
    render,
    destroyCharts,
    stats,
    updateTheme,
    renderCharts,
    viewResultDetails,
    getThemeColors
  };
})();

// Dual exposure
window.Dashboard = Dashboard;
if (window.QMS) window.QMS.dashboard = Dashboard;
