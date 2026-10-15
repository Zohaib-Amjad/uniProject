/**
 * Reports & Analytics Engine (Phase 12)
 * Pure vanilla JavaScript, Chart.js visualizations, live LocalStorage aggregation,
 * multi-tab reporting, custom CSV/JSON/HTML export with UTF-8 BOM, and print styling.
 */
const Reports = (() => {
  let charts = [];
  let activeTab = 'quiz';

  // Cached datasets for the 6 reports
  let lastQuizRows = [];
  let lastPartRows = [];
  let lastCatRows = [];
  let lastQuestionRows = [];
  let lastSummaryRows = [];
  let lastSummaryMetrics = {};
  let lastLeaderRows = [];

  /* ---------- Chart Cleanup Helper ---------- */
  function destroy() {
    charts.forEach((c) => {
      try {
        if (c && typeof c.destroy === 'function') c.destroy();
      } catch (_) {}
    });
    charts = [];
    ['repBarChart', 'repDoughnutChart', 'repLineChart', 'repAreaChart'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && typeof Chart !== 'undefined' && Chart.getChart) {
        try { Chart.getChart(el)?.destroy(); } catch (_) {}
      }
    });
  }

  /* ---------- Theme Aware Colors for Chart.js ---------- */
  function getThemeColors() {
    const isDark = typeof document !== 'undefined' && document.documentElement?.getAttribute('data-theme') === 'dark';
    return {
      textColor: isDark ? '#94a3b8' : '#64748b',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? '#1e293b' : '#ffffff',
      tooltipText: isDark ? '#f8fafc' : '#0f172a',
      borderColor: isDark ? '#334155' : '#e2e8f0',
      brandPrimary: '#0f6e56',
      brandSuccess: '#16a34a',
      brandDanger: '#dc2626',
      brandInfo: '#0284c7',
      brandWarning: '#d97706'
    };
  }

  /* ---------- Filter Results Engine (Phase 12.3) ---------- */
  function filteredResults() {
    if (typeof QMS === 'undefined') return [];
    const from = document.getElementById('repFrom')?.value || '';
    const to = document.getElementById('repTo')?.value || '';
    const quizId = document.getElementById('repQuiz')?.value || '';
    const categoryId = document.getElementById('repCategory')?.value || '';
    const participantId = document.getElementById('repParticipant')?.value || '';

    return QMS.results.all().filter((r) => {
      const d = String(r.date || '');
      const dDate = d.slice(0, 10);
      if (from && dDate < from) return false;
      if (to && dDate > to) return false;
      if (quizId && r.quizId !== quizId) return false;
      if (participantId && r.participantId !== participantId) return false;
      if (categoryId) {
        const q = QMS.quizzes.get(r.quizId);
        if (!q || q.categoryId !== categoryId) return false;
      }
      return true;
    });
  }

  /* ---------- Compute All 6 Reports (Phase 12.1) ---------- */
  function buildTables(results) {
    if (typeof QMS === 'undefined') return;
    const quizzes = QMS.quizzes.all();
    const participants = QMS.participants.all();
    const categories = QMS.categories.all();
    const questions = QMS.questions.all();

    if (!results || !results.length) {
      lastQuizRows = [];
      lastPartRows = [];
      lastCatRows = [];
      lastQuestionRows = [];
      lastSummaryRows = [];
      lastSummaryMetrics = {
        totalAttempts: 0,
        passedCount: 0,
        failedCount: 0,
        passRate: 0,
        avgScore: 0,
        highestScore: 0,
        lowestScore: 0,
        avgTimeFormatted: '0m 0s',
        bands: []
      };
      lastLeaderRows = [];
      return;
    }

    const quizFilter = document.getElementById('repQuiz')?.value || '';
    const catFilter = document.getElementById('repCategory')?.value || '';
    const partFilter = document.getElementById('repParticipant')?.value || '';

    // 1. Quiz Performance Report
    const targetQuizzes = quizzes.filter((q) => {
      if (quizFilter && q.id !== quizFilter) return false;
      if (catFilter && q.categoryId !== catFilter) return false;
      return true;
    });

    lastQuizRows = targetQuizzes.map((q) => {
      const rows = results.filter((r) => r.quizId === q.id);
      const scores = rows.map((r) => Number(r.percentage ?? r.score) || 0);
      const passCount = rows.filter((r) => r.status === 'Passed').length;
      return {
        Quiz: q.title,
        Participants: new Set(rows.map((r) => r.participantId)).size,
        Attempts: rows.length,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Highest Score': scores.length ? Math.max(...scores) : 0,
        'Lowest Score': scores.length ? Math.min(...scores) : 0,
        'Pass Rate': rows.length ? Math.round((passCount / rows.length) * 100) : 0
      };
    });

    // 2. Participant Performance Report
    const targetParticipants = participants.filter((p) => {
      if (partFilter && p.id !== partFilter) return false;
      return true;
    });

    lastPartRows = targetParticipants.map((p) => {
      const rows = results.filter((r) => r.participantId === p.id);
      const scores = rows.map((r) => Number(r.percentage ?? r.score) || 0);
      const passCount = rows.filter((r) => r.status === 'Passed').length;
      return {
        Participant: p.name,
        'Total Attempts': rows.length,
        Completed: rows.length,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Best Score': scores.length ? Math.max(...scores) : 0,
        'Pass Rate': rows.length ? Math.round((passCount / rows.length) * 100) : 0
      };
    });

    // 3. Category Report
    const targetCategories = categories.filter((c) => {
      if (catFilter && c.id !== catFilter) return false;
      return true;
    });

    lastCatRows = targetCategories.map((c) => {
      const quizList = quizzes.filter((q) => q.categoryId === c.id);
      const quizIds = quizList.map((q) => q.id);
      const qCount = questions.filter((q) => q.categoryId === c.id).length;
      const rows = results.filter((r) => quizIds.includes(r.quizId));
      const scores = rows.map((r) => Number(r.percentage ?? r.score) || 0);
      const passCount = rows.filter((r) => r.status === 'Passed').length;
      return {
        Category: c.name,
        'Number of Quizzes': quizList.length,
        'Number of Questions': qCount,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Pass Rate': rows.length ? Math.round((passCount / rows.length) * 100) : 0
      };
    });

    // 4. Question Analysis Report
    const targetQuestions = questions.filter((q) => {
      if (catFilter && q.categoryId !== catFilter) return false;
      return true;
    });

    lastQuestionRows = targetQuestions.map((q) => {
      let timesPresented = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      let unansweredCount = 0;

      results.forEach((r) => {
        const items = r.breakdown || r.answers || [];
        if (Array.isArray(items)) {
          const match = items.find((item) => item.questionId === q.id);
          if (match) {
            timesPresented++;
            if (match.isCorrect || match.result === 'correct') {
              correctCount++;
            } else if (match.result === 'unanswered' || (!match.selectedAnswer && !match.selected)) {
              unansweredCount++;
            } else {
              incorrectCount++;
            }
          }
        }
      });

      const correctPct = timesPresented > 0 ? Math.round((correctCount / timesPresented) * 100) : 0;
      const incorrectPct = timesPresented > 0 ? Math.round((incorrectCount / timesPresented) * 100) : 0;
      const unansweredPct = timesPresented > 0 ? Math.round((unansweredCount / timesPresented) * 100) : 0;

      let insight = 'Not attempted yet';
      if (timesPresented > 0) {
        if (correctPct < 40) {
          insight = `Hard – only ${correctPct}% correct`;
        } else if (correctPct <= 70) {
          insight = `Moderate – ${correctPct}% correct`;
        } else {
          insight = `Easy – ${correctPct}% correct`;
        }
      }

      return {
        Question: q.text,
        Category: QMS.categoryName(q.categoryId),
        'Times Answered': timesPresented,
        'Correct %': correctPct,
        'Incorrect %': incorrectPct,
        'Unanswered %': unansweredPct,
        'Difficulty Insight': insight
      };
    });

    // 5. Result Summary Report (Overall totals and Percentage Bands)
    const totalAttempts = results.length;
    const passedCount = results.filter((r) => r.status === 'Passed').length;
    const failedCount = results.filter((r) => r.status === 'Failed').length;
    const allScores = results.map((r) => Number(r.percentage ?? r.score) || 0);
    const avgScore = totalAttempts ? Math.round(allScores.reduce((a, b) => a + b, 0) / totalAttempts) : 0;
    const highestScore = totalAttempts ? Math.max(...allScores) : 0;
    const lowestScore = totalAttempts ? Math.min(...allScores) : 0;
    const totalTimeTaken = results.reduce((sum, r) => sum + (Number(r.timeTaken ?? r.timeSpent) || 0), 0);
    const avgTimeSeconds = totalAttempts ? Math.round(totalTimeTaken / totalAttempts) : 0;
    const mins = Math.floor(avgTimeSeconds / 60);
    const secs = avgTimeSeconds % 60;
    const avgTimeFormatted = `${mins}m ${secs}s`;

    // Percentage Bands Distribution
    const bandFail = results.filter((r) => (Number(r.percentage) || 0) < 50).length;
    const bandPass = results.filter((r) => (Number(r.percentage) || 0) >= 50 && (Number(r.percentage) || 0) < 70).length;
    const bandGood = results.filter((r) => (Number(r.percentage) || 0) >= 70 && (Number(r.percentage) || 0) < 85).length;
    const bandDist = results.filter((r) => (Number(r.percentage) || 0) >= 85).length;

    lastSummaryMetrics = {
      totalAttempts,
      passedCount,
      failedCount,
      passRate: totalAttempts ? Math.round((passedCount / totalAttempts) * 100) : 0,
      avgScore,
      highestScore,
      lowestScore,
      avgTimeFormatted,
      bands: [
        { label: '0% – 49% (Fail / Needs Work)', count: bandFail, pct: totalAttempts ? Math.round((bandFail / totalAttempts) * 100) : 0 },
        { label: '50% – 69% (Average / Pass)', count: bandPass, pct: totalAttempts ? Math.round((bandPass / totalAttempts) * 100) : 0 },
        { label: '70% – 84% (Good / Merit)', count: bandGood, pct: totalAttempts ? Math.round((bandGood / totalAttempts) * 100) : 0 },
        { label: '85% – 100% (Distinction / Mastery)', count: bandDist, pct: totalAttempts ? Math.round((bandDist / totalAttempts) * 100) : 0 }
      ]
    };

    lastSummaryRows = results.map((r) => ({
      ResultID: r.id,
      Participant: QMS.participantName(r.participantId),
      Quiz: QMS.quizTitle(r.quizId),
      Date: r.date ? new Date(r.date).toLocaleDateString() : '—',
      Score: `${r.obtainedMarks ?? r.score}/${r.totalMarks || 0}`,
      Percentage: r.percentage,
      Status: r.status
    }));

    // 6. Leaderboard Report
    const pMap = {};
    results.forEach((r) => {
      const pid = r.participantId;
      if (!pMap[pid]) {
        pMap[pid] = {
          name: QMS.participantName(pid),
          quizzes: new Set(),
          scores: [],
          totalMarks: 0
        };
      }
      pMap[pid].quizzes.add(r.quizId);
      pMap[pid].scores.push(Number(r.percentage ?? r.score) || 0);
      pMap[pid].totalMarks += Number(r.obtainedMarks ?? r.score) || 0;
    });

    const ranked = Object.values(pMap).map((item) => {
      const avg = item.scores.length ? Math.round(item.scores.reduce((a, b) => a + b, 0) / item.scores.length) : 0;
      const best = item.scores.length ? Math.max(...item.scores) : 0;
      const points = (item.quizzes.size * 50) + (avg * 10);
      return {
        name: item.name,
        quizzes: item.quizzes.size,
        avg,
        best,
        points: Math.round(points)
      };
    });

    ranked.sort((a, b) => b.points - a.points || b.avg - a.avg);

    lastLeaderRows = ranked.map((r, idx) => ({
      Rank: idx + 1,
      Participant: r.name,
      'Quizzes Attempted': r.quizzes,
      'Average Score': r.avg,
      'Best Score': r.best,
      'Total Points': r.points
    }));
  }

  /* ---------- HTML Table Builder Helper ---------- */
  function tableHTML(rows, options = {}) {
    if (!rows || !rows.length) {
      return `
        <div class="empty-state text-center py-5 text-muted">
          <i class="fa-solid fa-folder-open fa-3x mb-3 text-secondary opacity-50 d-block"></i>
          <h5 class="fw-bold">No Data Available</h5>
          <p class="small mb-0">No records match your active filter selection. Try adjusting or clearing filters.</p>
        </div>`;
    }

    const headers = Object.keys(rows[0]);
    return `
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 data-table">
          <thead class="table-light">
            <tr>
              ${headers.map((h) => `<th>${QMS.escapeHtml(h)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              return `<tr>
                ${headers.map((h) => {
                  const val = row[h];
                  let cellContent = QMS.escapeHtml(val);

                  // Formatting enhancements for special columns
                  if (h === 'Pass Rate' || h === 'Average Score' || h === 'Highest Score' || h === 'Best Score' || h === 'Percentage') {
                    const num = parseInt(val, 10);
                    const cls = num >= 60 ? 'text-success' : 'text-danger';
                    cellContent = `<span class="fw-bold ${cls}">${val}%</span>`;
                  } else if (h === 'Rank') {
                    const badge = val === 1 ? '🥇' : val === 2 ? '🥈' : val === 3 ? '🥉' : `#${val}`;
                    cellContent = `<strong>${badge}</strong>`;
                  } else if (h === 'Difficulty Insight') {
                    const isHard = String(val).startsWith('Hard');
                    const isMod = String(val).startsWith('Moderate');
                    const badgeCls = isHard ? 'badge-danger' : isMod ? 'badge-warning' : 'badge-success';
                    cellContent = `<span class="badge-soft ${badgeCls}">${QMS.escapeHtml(val)}</span>`;
                  } else if (h === 'Status') {
                    const isPass = val === 'Passed';
                    cellContent = `<span class="badge-soft badge-${isPass ? 'success' : 'danger'}">${QMS.escapeHtml(val)}</span>`;
                  }
                  return `<td>${cellContent}</td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /* ---------- Render Result Summary Special Layout ---------- */
  function renderSummaryTab() {
    const root = document.getElementById('repSummaryTable');
    if (!root) return;
    const m = lastSummaryMetrics;

    if (!m.totalAttempts) {
      root.innerHTML = tableHTML([]);
      return;
    }

    root.innerHTML = `
      <!-- Overall KPI Metrics -->
      <div class="report-kpi-grid">
        <div class="report-kpi-card">
          <div class="val text-brand">${m.totalAttempts}</div>
          <div class="lbl">Total Attempts</div>
        </div>
        <div class="report-kpi-card">
          <div class="val text-success">${m.passedCount}</div>
          <div class="lbl">Passed Attempts</div>
        </div>
        <div class="report-kpi-card">
          <div class="val text-danger">${m.failedCount}</div>
          <div class="lbl">Failed Attempts</div>
        </div>
        <div class="report-kpi-card">
          <div class="val ${m.passRate >= 60 ? 'text-success' : 'text-danger'}">${m.passRate}%</div>
          <div class="lbl">Pass Rate</div>
        </div>
        <div class="report-kpi-card">
          <div class="val text-brand">${m.avgScore}%</div>
          <div class="lbl">Average Score</div>
        </div>
        <div class="report-kpi-card">
          <div class="val text-muted">${m.avgTimeFormatted}</div>
          <div class="lbl">Average Time</div>
        </div>
      </div>

      <!-- Percentage Bands Distribution -->
      <div class="panel border mb-4">
        <div class="panel-header py-2 px-3 bg-light border-bottom">
          <h6 class="fw-bold mb-0"><i class="fa-solid fa-chart-simple me-2 text-primary"></i>Score Distribution by Performance Bands</h6>
        </div>
        <div class="panel-body p-3">
          <div class="row g-3">
            ${m.bands.map((b) => `
              <div class="col-md-3 col-sm-6">
                <div class="p-3 border rounded bg-surface h-100">
                  <div class="small fw-semibold text-muted mb-1">${QMS.escapeHtml(b.label)}</div>
                  <div class="d-flex align-items-baseline gap-2">
                    <span class="fs-4 fw-bold">${b.count}</span>
                    <span class="badge-soft badge-muted small">${b.pct}% of total</span>
                  </div>
                  <div class="progress mt-2" style="height: 6px;">
                    <div class="progress-bar bg-brand" role="progressbar" style="width: ${b.pct}%"></div>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Detail Results List Table -->
      <h6 class="fw-bold mb-2"><i class="fa-solid fa-list-check me-2 text-primary"></i>Detailed Result Records (${lastSummaryRows.length})</h6>
      ${tableHTML(lastSummaryRows)}
    `;
  }

  /* ---------- Chart.js Visualizations (Phase 12.2) ---------- */
  function renderCharts(results) {
    destroy();
    if (typeof Chart === 'undefined') return;

    const theme = getThemeColors();

    // 1. Bar Chart: Average Score per Quiz
    const barCanvas = document.getElementById('repBarChart');
    if (barCanvas) {
      if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(barCanvas)?.destroy();
      const labels = lastQuizRows.map((r) => (r.Quiz.length > 15 ? r.Quiz.slice(0, 15) + '…' : r.Quiz));
      const data = lastQuizRows.map((r) => r['Average Score']);
      charts.push(
        new Chart(barCanvas, {
          type: 'bar',
          data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
              label: 'Average Score (%)',
              data: data.length ? data : [0],
              backgroundColor: 'rgba(15, 110, 86, 0.75)',
              borderColor: '#0f6e56',
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, max: 100, ticks: { color: theme.textColor }, grid: { color: theme.gridColor } },
              x: { ticks: { color: theme.textColor }, grid: { display: false } }
            },
            plugins: {
              legend: { labels: { color: theme.textColor } }
            }
          }
        })
      );
    }

    // 2. Doughnut Chart: Pass vs Fail Distribution
    const doughCanvas = document.getElementById('repDoughnutChart');
    if (doughCanvas) {
      if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(doughCanvas)?.destroy();
      const passCount = results.filter((r) => r.status === 'Passed').length;
      const failCount = results.filter((r) => r.status === 'Failed').length;
      charts.push(
        new Chart(doughCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Passed', 'Failed'],
            datasets: [{
              data: [passCount || 0, failCount || 0],
              backgroundColor: ['#16a34a', '#dc2626'],
              borderWidth: 2,
              borderColor: theme.borderColor
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: theme.textColor } }
            }
          }
        })
      );
    }

    // 3. Line Chart: Attempts Over Time
    const lineCanvas = document.getElementById('repLineChart');
    if (lineCanvas) {
      if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(lineCanvas)?.destroy();
      const sorted = [...results].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      const dateMap = {};
      sorted.forEach((r) => {
        const d = r.date ? new Date(r.date).toLocaleDateString() : 'Unknown';
        dateMap[d] = (dateMap[d] || 0) + 1;
      });
      const dates = Object.keys(dateMap);
      const counts = Object.values(dateMap);

      charts.push(
        new Chart(lineCanvas, {
          type: 'line',
          data: {
            labels: dates.length ? dates : ['No Data'],
            datasets: [{
              label: 'Attempts Count',
              data: counts.length ? counts : [0],
              borderColor: '#0284c7',
              backgroundColor: 'rgba(2, 132, 199, 0.1)',
              tension: 0.35,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: '#0284c7'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, ticks: { precision: 0, color: theme.textColor }, grid: { color: theme.gridColor } },
              x: { ticks: { color: theme.textColor }, grid: { display: false } }
            },
            plugins: {
              legend: { labels: { color: theme.textColor } }
            }
          }
        })
      );
    }

    // 4. Area Performance Chart: Category Performance Trend
    const areaCanvas = document.getElementById('repAreaChart');
    if (areaCanvas) {
      if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(areaCanvas)?.destroy();
      const labels = lastCatRows.map((r) => r.Category);
      const data = lastCatRows.map((r) => r['Average Score']);
      charts.push(
        new Chart(areaCanvas, {
          type: 'line',
          data: {
            labels: labels.length ? labels : ['No Data'],
            datasets: [{
              label: 'Category Average Score (%)',
              data: data.length ? data : [0],
              borderColor: '#0f6e56',
              backgroundColor: 'rgba(15, 110, 86, 0.25)',
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: '#0f6e56'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, max: 100, ticks: { color: theme.textColor }, grid: { color: theme.gridColor } },
              x: { ticks: { color: theme.textColor }, grid: { display: false } }
            },
            plugins: {
              legend: { labels: { color: theme.textColor } }
            }
          }
        })
      );
    }
  }

  /* ---------- Populate Toolbar Filters (Phase 12.3) ---------- */
  function populateFilters() {
    if (typeof QMS === 'undefined') return;
    const quizSel = document.getElementById('repQuiz');
    const catSel = document.getElementById('repCategory');
    const partSel = document.getElementById('repParticipant');

    if (quizSel && !quizSel.dataset.ready) {
      const prev = quizSel.value;
      quizSel.innerHTML = '<option value="">All Quizzes</option>' +
        QMS.quizzes.all().map((q) => `<option value="${q.id}">${QMS.escapeHtml(q.title)}</option>`).join('');
      if (prev) quizSel.value = prev;
      quizSel.dataset.ready = '1';
    }
    if (catSel && !catSel.dataset.ready) {
      const prev = catSel.value;
      catSel.innerHTML = '<option value="">All Categories</option>' +
        QMS.categories.all().map((c) => `<option value="${c.id}">${QMS.escapeHtml(c.name)}</option>`).join('');
      if (prev) catSel.value = prev;
      catSel.dataset.ready = '1';
    }
    if (partSel && !partSel.dataset.ready) {
      const prev = partSel.value;
      partSel.innerHTML = '<option value="">All Participants</option>' +
        QMS.participants.all().map((p) => `<option value="${p.id}">${QMS.escapeHtml(p.name)}</option>`).join('');
      if (prev) partSel.value = prev;
      partSel.dataset.ready = '1';
    }
  }

  /* ---------- Clear Filters Helper ---------- */
  function clearFilters() {
    const fFrom = document.getElementById('repFrom');
    if (fFrom) fFrom.value = '';
    const fTo = document.getElementById('repTo');
    if (fTo) fTo.value = '';
    const fQuiz = document.getElementById('repQuiz');
    if (fQuiz) fQuiz.value = '';
    const fCat = document.getElementById('repCategory');
    if (fCat) fCat.value = '';
    const fPart = document.getElementById('repParticipant');
    if (fPart) fPart.value = '';

    generate();
    if (window.App?.toast) App.toast('Report filters reset to all', 'info');
  }

  /* ---------- Tab Switching Management ---------- */
  function switchTab(reportType) {
    activeTab = reportType;
    document.querySelectorAll('#repTabs .nav-link').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.report === reportType);
    });

    const paneMap = {
      quiz: 'pane-rep-quiz',
      participant: 'pane-rep-part',
      category: 'pane-rep-cat',
      questions: 'pane-rep-questions',
      results: 'pane-rep-summary',
      leaderboard: 'pane-rep-leader'
    };

    Object.entries(paneMap).forEach(([type, paneId]) => {
      const pane = document.getElementById(paneId);
      if (pane) {
        if (type === reportType) {
          pane.classList.remove('d-none');
          pane.classList.add('active');
        } else {
          pane.classList.add('d-none');
          pane.classList.remove('active');
        }
      }
    });

    updatePrintHeader();
  }

  function bindTabs() {
    document.querySelectorAll('#repTabs .nav-link[data-report]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        switchTab(btn.dataset.report);
      };
    });
  }

  /* ---------- Primary Report Generation (Phase 12.4) ---------- */
  function generate() {
    const results = filteredResults();
    buildTables(results);

    // Update Tables
    const quizEl = document.getElementById('repQuizTable');
    if (quizEl) quizEl.innerHTML = tableHTML(lastQuizRows);

    const partEl = document.getElementById('repParticipantTable');
    if (partEl) partEl.innerHTML = tableHTML(lastPartRows);

    const catEl = document.getElementById('repCategoryTable');
    if (catEl) catEl.innerHTML = tableHTML(lastCatRows);

    const qEl = document.getElementById('repQuestionTable');
    if (qEl) qEl.innerHTML = tableHTML(lastQuestionRows);

    renderSummaryTab();

    const leaderEl = document.getElementById('repLeaderTable');
    if (leaderEl) leaderEl.innerHTML = tableHTML(lastLeaderRows);

    // Update Visualizations
    renderCharts(results);

    updatePrintHeader();

    if (window.App?.toast) App.toast('Report generated successfully', 'success');
  }

  /* ---------- CSV Export with UTF-8 BOM (Phase 12.4) ---------- */
  function exportCSV(type) {
    const reportType = type || activeTab || 'quiz';
    const dateStr = new Date().toISOString().slice(0, 10);

    const map = {
      quiz: [`quiz-performance-report-${dateStr}.csv`, lastQuizRows],
      participant: [`participant-performance-report-${dateStr}.csv`, lastPartRows],
      category: [`category-report-${dateStr}.csv`, lastCatRows],
      questions: [`question-analysis-report-${dateStr}.csv`, lastQuestionRows],
      results: [`result-summary-report-${dateStr}.csv`, lastSummaryRows],
      leaderboard: [`leaderboard-report-${dateStr}.csv`, lastLeaderRows]
    };

    const target = map[reportType] || map.quiz;
    const [filename, rows] = target;

    if (!rows || !rows.length) {
      if (window.App?.toast) App.toast('No rows to export for selected report', 'warning');
      return;
    }

    if (typeof QMS !== 'undefined' && QMS.exportCSV) {
      QMS.exportCSV(filename, rows);
    } else {
      // Pure JS fallback with BOM
      const headers = Object.keys(rows[0]);
      const escapeVal = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csvStr = '\uFEFF' + [headers.join(','), ...rows.map((r) => headers.map((h) => escapeVal(r[h])).join(','))].join('\r\n');
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    if (window.App?.toast) App.toast(`Exported ${filename}`, 'success');
  }

  /* ---------- Print Report Engine (Phase 12.4) ---------- */
  function updatePrintHeader() {
    const titleEl = document.getElementById('repPrintReportTitle');
    const dateEl = document.getElementById('repPrintDate');
    const filtersEl = document.getElementById('repPrintFilters');
    const systemEl = document.getElementById('repPrintSystem');

    const tabNames = {
      quiz: 'Quiz Performance Report',
      participant: 'Participant Performance Report',
      category: 'Category Performance Report',
      questions: 'Question Analysis Report',
      results: 'Result Summary Report',
      leaderboard: 'Leaderboard Report'
    };

    if (titleEl) titleEl.textContent = tabNames[activeTab] || 'Assessment Report';
    if (dateEl) dateEl.textContent = new Date().toLocaleString();
    if (systemEl && typeof QMS !== 'undefined') {
      const s = QMS.getSettings();
      systemEl.textContent = s.systemName || 'QuizPro Assessment System';
    }

    if (filtersEl && typeof QMS !== 'undefined') {
      const from = document.getElementById('repFrom')?.value;
      const to = document.getElementById('repTo')?.value;
      const qVal = document.getElementById('repQuiz')?.value;
      const cVal = document.getElementById('repCategory')?.value;
      const pVal = document.getElementById('repParticipant')?.value;

      const parts = [];
      if (from || to) parts.push(`Date: ${from || 'Any'} to ${to || 'Any'}`);
      if (qVal) parts.push(`Quiz: ${QMS.quizTitle(qVal)}`);
      if (cVal) parts.push(`Category: ${QMS.categoryName(cVal)}`);
      if (pVal) parts.push(`Participant: ${QMS.participantName(pVal)}`);

      filtersEl.textContent = parts.length ? `Applied Filters: ${parts.join(' | ')}` : 'Applied Filters: None (All Data)';
    }
  }

  function printReport() {
    updatePrintHeader();
    window.print();
  }

  /* ---------- Standalone HTML / JSON Report Download (Phase 12.4) ---------- */
  function rowsToHtmlTable(title, rows) {
    if (!rows || !rows.length) {
      return `<h3>${QMS.escapeHtml(title)}</h3><p><em>No records for this section.</em></p>`;
    }
    const headers = Object.keys(rows[0]);
    return `
      <h3 style="margin-top:28px;color:#0f6e56;font-family:sans-serif;">${QMS.escapeHtml(title)}</h3>
      <table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:20px;font-family:sans-serif;font-size:13px;border-color:#e2e8f0;">
        <thead style="background:#f1f5f9;">
          <tr>${headers.map((h) => `<th style="text-align:left;padding:8px;">${QMS.escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((r) => `<tr>${headers.map((h) => `<td style="padding:8px;">${QMS.escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>`;
  }

  function downloadReport(format = 'html') {
    if (!lastQuizRows.length && !lastPartRows.length) {
      generate();
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const settings = typeof QMS !== 'undefined' ? QMS.getSettings() : {};
    const systemName = settings.systemName || 'QuizPro';

    if (format === 'json') {
      const dataPack = {
        system: systemName,
        generatedAt: new Date().toISOString(),
        filters: {
          from: document.getElementById('repFrom')?.value || null,
          to: document.getElementById('repTo')?.value || null,
          quizId: document.getElementById('repQuiz')?.value || null,
          categoryId: document.getElementById('repCategory')?.value || null,
          participantId: document.getElementById('repParticipant')?.value || null
        },
        metrics: lastSummaryMetrics,
        quizPerformance: lastQuizRows,
        participantPerformance: lastPartRows,
        categoryPerformance: lastCatRows,
        questionAnalysis: lastQuestionRows,
        resultSummary: lastSummaryRows,
        leaderboard: lastLeaderRows
      };

      const jsonStr = JSON.stringify(dataPack, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${systemName.toLowerCase()}-report-pack-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      if (window.App?.toast) App.toast('Report JSON downloaded', 'success');
      return;
    }

    // HTML Standalone Printable Pack
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${QMS.escapeHtml(systemName)} — Comprehensive Assessment Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 32px; color: #1e293b; background: #fff; line-height: 1.5; }
    h1 { color: #0f6e56; margin-bottom: 4px; font-size: 26px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
    .kpi-box { flex: 1; min-width: 120px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center; }
    .kpi-box .val { font-size: 20px; font-weight: bold; color: #0f6e56; }
    .kpi-box .lbl { font-size: 11px; text-transform: uppercase; color: #64748b; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${QMS.escapeHtml(systemName)} — Comprehensive Assessment Report</h1>
  <div class="meta">
    <strong>Generated Date:</strong> ${new Date().toLocaleString()} |
    <strong>Report Pack:</strong> Full 6-Module Analytics Suite
  </div>

  <div class="kpi-row">
    <div class="kpi-box"><div class="val">${lastSummaryMetrics.totalAttempts || 0}</div><div class="lbl">Total Attempts</div></div>
    <div class="kpi-box"><div class="val">${lastSummaryMetrics.passedCount || 0}</div><div class="lbl">Passed</div></div>
    <div class="kpi-box"><div class="val">${lastSummaryMetrics.failedCount || 0}</div><div class="lbl">Failed</div></div>
    <div class="kpi-box"><div class="val">${lastSummaryMetrics.passRate || 0}%</div><div class="lbl">Pass Rate</div></div>
    <div class="kpi-box"><div class="val">${lastSummaryMetrics.avgScore || 0}%</div><div class="lbl">Avg Score</div></div>
  </div>

  ${rowsToHtmlTable('1. Quiz Performance Report', lastQuizRows)}
  ${rowsToHtmlTable('2. Participant Performance Report', lastPartRows)}
  ${rowsToHtmlTable('3. Category Report', lastCatRows)}
  ${rowsToHtmlTable('4. Question Analysis Report', lastQuestionRows)}
  ${rowsToHtmlTable('5. Result Summary Records', lastSummaryRows)}
  ${rowsToHtmlTable('6. Leaderboard Report', lastLeaderRows)}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${systemName.toLowerCase()}-full-report-${dateStr}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (window.App?.toast) App.toast('Full HTML report downloaded', 'success');
  }

  /* ---------- Theme Switcher Integration ---------- */
  function updateTheme() {
    renderCharts(filteredResults());
  }

  /* ---------- Primary Initialize / Mount ---------- */
  function render() {
    populateFilters();
    bindTabs();
    generate();
  }

  /* ---------- Public API (Phase 12) ---------- */
  return {
    render,
    generate,
    exportCSV,
    printReport,
    downloadReport,
    destroy,
    updateTheme,
    switchTab,
    clearFilters,
    filteredResults,
    buildTables,
    get activeTab() { return activeTab; },
    get lastQuizRows() { return lastQuizRows; },
    get lastPartRows() { return lastPartRows; },
    get lastCatRows() { return lastCatRows; },
    get lastQuestionRows() { return lastQuestionRows; },
    get lastSummaryRows() { return lastSummaryRows; },
    get lastSummaryMetrics() { return lastSummaryMetrics; },
    get lastLeaderRows() { return lastLeaderRows; }
  };
})();

// Auto-mount to window
if (typeof window !== 'undefined') {
  window.Reports = Reports;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Reports;
}
