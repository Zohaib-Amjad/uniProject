/**
 * Dashboard summary cards + Chart.js widgets
 */
const Dashboard = (() => {
  let charts = [];

  function destroyCharts() {
    charts.forEach((c) => {
      try { c.destroy(); } catch (_) {}
    });
    charts = [];
  }

  function stats() {
    const quizzes = QMS.quizzes.all();
    const questions = QMS.questions.all();
    const participants = QMS.participants.all();
    const results = QMS.results.all();
    const activeQuizzes = quizzes.filter((q) => q.status === 'Active').length;
    const completed = results.filter((r) => r.status === 'Passed' || r.status === 'Failed').length;
    const avgScore = results.length
      ? Math.round(results.reduce((s, r) => s + Number(r.percentage || 0), 0) / results.length)
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
      completedQuizzes: completed,
      averageScore: avgScore,
      passRate
    };
  }

  function renderCards(root) {
    const s = stats();
    const items = [
      ['Total Quizzes', s.totalQuizzes, 'fa-clipboard-list'],
      ['Active Quizzes', s.activeQuizzes, 'fa-bolt'],
      ['Total Questions', s.totalQuestions, 'fa-circle-question'],
      ['Total Participants', s.totalParticipants, 'fa-users'],
      ['Total Attempts', s.totalAttempts, 'fa-flag-checkered'],
      ['Completed Quizzes', s.completedQuizzes, 'fa-check-double'],
      ['Average Score', `${s.averageScore}%`, 'fa-chart-line'],
      ['Pass Rate', `${s.passRate}%`, 'fa-award']
    ];
    root.innerHTML = items
      .map(
        ([label, value, icon]) => `
      <div class="stat-card">
        <div class="stat-icon"><i class="fa-solid ${icon}"></i></div>
        <div><h3>${value}</h3><span>${label}</span></div>
      </div>`
      )
      .join('');
  }

  function renderCharts() {
    destroyCharts();
    if (typeof Chart === 'undefined') return;

    const results = QMS.results.all();
    const quizzes = QMS.quizzes.all().filter((q) => q.status !== 'Archived');

    const quizLabels = [];
    const avgScores = [];
    const attempts = [];
    quizzes.slice(0, 8).forEach((q) => {
      const rows = results.filter((r) => r.quizId === q.id);
      quizLabels.push(q.title.length > 16 ? q.title.slice(0, 16) + '…' : q.title);
      avgScores.push(rows.length ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0);
      attempts.push(rows.length);
    });

    const perfCanvas = document.getElementById('chartQuizPerformance');
    if (perfCanvas) {
      charts.push(
        new Chart(perfCanvas, {
          type: 'bar',
          data: {
            labels: quizLabels,
            datasets: [
              { label: 'Avg Score %', data: avgScores, backgroundColor: 'rgba(15,110,86,.75)' },
              { label: 'Attempts', data: attempts, backgroundColor: 'rgba(29,111,191,.65)' }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, max: 100 } }
          }
        })
      );
    }

    // Participant activity by day/week/month buckets from result dates
    const byDay = {};
    const byWeek = { W1: 0, W2: 0, W3: 0, W4: 0 };
    const byMonth = {};
    results.forEach((r) => {
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return;
      const day = d.toLocaleDateString(undefined, { weekday: 'short' });
      byDay[day] = (byDay[day] || 0) + 1;
      const week = `W${Math.min(4, Math.ceil(d.getDate() / 7))}`;
      byWeek[week] = (byWeek[week] || 0) + 1;
      const month = d.toLocaleDateString(undefined, { month: 'short' });
      byMonth[month] = (byMonth[month] || 0) + 1;
    });

    const actCanvas = document.getElementById('chartParticipantActivity');
    if (actCanvas) {
      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      charts.push(
        new Chart(actCanvas, {
          type: 'line',
          data: {
            labels: dayLabels,
            datasets: [
              {
                label: 'Daily attempts',
                data: dayLabels.map((d) => byDay[d] || 0),
                borderColor: '#0f6e56',
                backgroundColor: 'rgba(15,110,86,.15)',
                fill: true,
                tension: 0.35
              },
              {
                label: 'Weekly attempts',
                data: ['W1', 'W2', 'W3', 'W4'].map((w) => byWeek[w] || 0),
                borderColor: '#1d6fbf',
                backgroundColor: 'transparent',
                tension: 0.35
              },
              {
                label: 'Monthly attempts',
                data: Object.values(byMonth).length
                  ? Object.values(byMonth)
                  : [0, 0, 0, 0],
                borderColor: '#b7791f',
                borderDash: [5, 5],
                tension: 0.35
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        })
      );
    }

    const cats = ['Programming', 'Mathematics', 'Science', 'English', 'General Knowledge', 'Computer Science'];
    const catScores = cats.map((name) => {
      const cat = QMS.categories.all().find((c) => c.name === name);
      if (!cat) return 0;
      const quizIds = QMS.quizzes.all().filter((q) => q.categoryId === cat.id).map((q) => q.id);
      const rows = results.filter((r) => quizIds.includes(r.quizId));
      return rows.length ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0;
    });

    const catCanvas = document.getElementById('chartCategoryPerformance');
    if (catCanvas) {
      charts.push(
        new Chart(catCanvas, {
          type: 'doughnut',
          data: {
            labels: cats,
            datasets: [
              {
                data: catScores.map((v) => v || 1),
                backgroundColor: ['#0f6e56', '#1d6fbf', '#b7791f', '#8e44ad', '#c0392b', '#16a085']
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label(ctx) {
                    return `${ctx.label}: ${catScores[ctx.dataIndex]}% avg`;
                  }
                }
              }
            }
          }
        })
      );
    }
  }

  function recentAttemptsHTML() {
    const rows = [...QMS.results.all()]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8);

    if (!rows.length) return '<div class="empty-state">No recent attempts yet.</div>';

    const body = rows
      .map((r) => {
        const statusClass = r.status === 'Passed' ? 'badge-success' : 'badge-danger';
        return `<tr>
          <td>${QMS.participantName(r.participantId)}</td>
          <td>${QMS.quizTitle(r.quizId)}</td>
          <td>${new Date(r.date).toLocaleString()}</td>
          <td>${r.obtainedMarks ?? r.score}/${r.totalMarks}</td>
          <td>${r.percentage}%</td>
          <td><span class="badge-soft ${statusClass}">${r.status}</span></td>
          <td><button class="btn btn-sm btn-outline-brand" data-view-result="${r.id}">View</button></td>
        </tr>`;
      })
      .join('');

    const cards = rows
      .map(
        (r) => `<div class="mobile-card">
        <h4>${QMS.participantName(r.participantId)}</h4>
        <div class="mobile-meta">
          <div>${QMS.quizTitle(r.quizId)}</div>
          <div>${new Date(r.date).toLocaleString()} · ${r.percentage}% · ${r.status}</div>
        </div>
        <button class="btn btn-sm btn-outline-brand" data-view-result="${r.id}">View</button>
      </div>`
      )
      .join('');

    return `
      <div class="table-wrap desktop-table">
        <table class="data-table">
          <thead><tr>
            <th>Participant</th><th>Quiz</th><th>Date</th><th>Score</th><th>Percentage</th><th>Status</th><th>Action</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="mobile-cards">${cards}</div>`;
  }

  function render() {
    const cards = document.getElementById('dashboardStats');
    const recent = document.getElementById('recentAttempts');
    if (cards) renderCards(cards);
    if (recent) recent.innerHTML = recentAttemptsHTML();
    setTimeout(renderCharts, 40);
  }

  return { render, destroyCharts, stats };
})();
