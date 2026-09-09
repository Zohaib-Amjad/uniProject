/**
 * Reports & Analytics — charts, filters, CSV/print
 */
const Reports = (() => {
  let charts = [];
  let lastQuizRows = [];
  let lastPartRows = [];
  let lastCatRows = [];

  function destroy() {
    charts.forEach((c) => {
      try { c.destroy(); } catch (_) {}
    });
    charts = [];
  }

  function filteredResults() {
    const from = document.getElementById('repFrom')?.value;
    const to = document.getElementById('repTo')?.value;
    const quizId = document.getElementById('repQuiz')?.value || '';
    const categoryId = document.getElementById('repCategory')?.value || '';
    const participantId = document.getElementById('repParticipant')?.value || '';

    return QMS.results.all().filter((r) => {
      const d = new Date(r.date);
      if (from && d < new Date(from)) return false;
      if (to && d > new Date(to + 'T23:59:59')) return false;
      if (quizId && r.quizId !== quizId) return false;
      if (participantId && r.participantId !== participantId) return false;
      if (categoryId) {
        const q = QMS.quizzes.get(r.quizId);
        if (!q || q.categoryId !== categoryId) return false;
      }
      return true;
    });
  }

  function buildTables(results) {
    const quizzes = QMS.quizzes.all();
    const participants = QMS.participants.all();
    const categories = QMS.categories.all();

    lastQuizRows = quizzes.map((q) => {
      const rows = results.filter((r) => r.quizId === q.id);
      const scores = rows.map((r) => Number(r.percentage) || 0);
      const pass = rows.filter((r) => r.status === 'Passed').length;
      return {
        Quiz: q.title,
        Participants: new Set(rows.map((r) => r.participantId)).size,
        Attempts: rows.length,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Highest Score': scores.length ? Math.max(...scores) : 0,
        'Lowest Score': scores.length ? Math.min(...scores) : 0,
        'Pass Rate': rows.length ? Math.round((pass / rows.length) * 100) : 0
      };
    });

    lastPartRows = participants.map((p) => {
      const rows = results.filter((r) => r.participantId === p.id);
      const scores = rows.map((r) => Number(r.percentage) || 0);
      const pass = rows.filter((r) => r.status === 'Passed').length;
      return {
        Participant: p.name,
        'Total Attempts': rows.length,
        Completed: rows.length,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Best Score': scores.length ? Math.max(...scores) : 0,
        'Pass Rate': rows.length ? Math.round((pass / rows.length) * 100) : 0
      };
    });

    lastCatRows = categories.map((c) => {
      const quizList = quizzes.filter((q) => q.categoryId === c.id);
      const quizIds = quizList.map((q) => q.id);
      const qCount = QMS.questions.all().filter((q) => q.categoryId === c.id).length;
      const rows = results.filter((r) => quizIds.includes(r.quizId));
      const scores = rows.map((r) => Number(r.percentage) || 0);
      const pass = rows.filter((r) => r.status === 'Passed').length;
      return {
        Category: c.name,
        'Number of Quizzes': quizList.length,
        'Number of Questions': qCount,
        'Average Score': scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        'Pass Rate': rows.length ? Math.round((pass / rows.length) * 100) : 0
      };
    });
  }

  function tableHTML(rows) {
    if (!rows.length) return '<div class="empty-state">No data for selected filters.</div>';
    const headers = Object.keys(rows[0]);
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers
      .map((h) => `<th>${h}</th>`)
      .join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${headers.map((h) => `<td>${QMS.escapeHtml(r[h])}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  }

  function renderCharts(results) {
    destroy();
    if (typeof Chart === 'undefined') return;

    const quizLabels = lastQuizRows.map((r) => (r.Quiz.length > 14 ? r.Quiz.slice(0, 14) + '…' : r.Quiz));
    const avg = lastQuizRows.map((r) => r['Average Score']);

    const bar = document.getElementById('repBarChart');
    if (bar) {
      charts.push(
        new Chart(bar, {
          type: 'bar',
          data: {
            labels: quizLabels,
            datasets: [{ label: 'Average Score', data: avg, backgroundColor: 'rgba(15,110,86,.75)' }]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        })
      );
    }

    const passed = results.filter((r) => r.status === 'Passed').length;
    const failed = results.filter((r) => r.status === 'Failed').length;
    const dough = document.getElementById('repDoughnutChart');
    if (dough) {
      charts.push(
        new Chart(dough, {
          type: 'doughnut',
          data: {
            labels: ['Passed', 'Failed'],
            datasets: [{ data: [passed || 0, failed || 0], backgroundColor: ['#1f7a4d', '#c0392b'] }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        })
      );
    }

    const sorted = [...results].sort((a, b) => new Date(a.date) - new Date(b.date));
    const line = document.getElementById('repLineChart');
    if (line) {
      charts.push(
        new Chart(line, {
          type: 'line',
          data: {
            labels: sorted.map((r) => new Date(r.date).toLocaleDateString()),
            datasets: [
              {
                label: 'Score % over time',
                data: sorted.map((r) => r.percentage),
                borderColor: '#1d6fbf',
                tension: 0.3,
                fill: false
              }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        })
      );
    }

    const area = document.getElementById('repAreaChart');
    if (area) {
      charts.push(
        new Chart(area, {
          type: 'line',
          data: {
            labels: lastCatRows.map((r) => r.Category),
            datasets: [
              {
                label: 'Category Avg Score',
                data: lastCatRows.map((r) => r['Average Score']),
                borderColor: '#0f6e56',
                backgroundColor: 'rgba(15,110,86,.2)',
                fill: true,
                tension: 0.35
              }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        })
      );
    }
  }

  function populateFilters() {
    const quizSel = document.getElementById('repQuiz');
    const catSel = document.getElementById('repCategory');
    const partSel = document.getElementById('repParticipant');
    if (quizSel) {
      quizSel.innerHTML =
        '<option value="">All Quizzes</option>' +
        QMS.quizzes.all().map((q) => `<option value="${q.id}">${QMS.escapeHtml(q.title)}</option>`).join('');
    }
    if (catSel) {
      catSel.innerHTML =
        '<option value="">All Categories</option>' +
        QMS.categories.all().map((c) => `<option value="${c.id}">${QMS.escapeHtml(c.name)}</option>`).join('');
    }
    if (partSel) {
      partSel.innerHTML =
        '<option value="">All Participants</option>' +
        QMS.participants.all().map((p) => `<option value="${p.id}">${QMS.escapeHtml(p.name)}</option>`).join('');
    }
  }

  function generate() {
    const results = filteredResults();
    buildTables(results);
    const quizEl = document.getElementById('repQuizTable');
    const partEl = document.getElementById('repParticipantTable');
    const catEl = document.getElementById('repCategoryTable');
    if (quizEl) quizEl.innerHTML = tableHTML(lastQuizRows);
    if (partEl) partEl.innerHTML = tableHTML(lastPartRows);
    if (catEl) catEl.innerHTML = tableHTML(lastCatRows);
    renderCharts(results);
    if (window.App?.toast) App.toast('Report generated', 'success');
  }

  function exportCSV(type) {
    const map = {
      quiz: ['quiz-performance.csv', lastQuizRows],
      participant: ['participant-performance.csv', lastPartRows],
      category: ['category-performance.csv', lastCatRows],
      results: [
        'result-summary.csv',
        filteredResults().map((r) => ({
          ResultID: r.id,
          Participant: QMS.participantName(r.participantId),
          Quiz: QMS.quizTitle(r.quizId),
          Date: r.date,
          Percentage: r.percentage,
          Status: r.status
        }))
      ],
      leaderboard: [
        'leaderboard-report.csv',
        (window.App?.leaderboardRows?.() || []).map((r, i) => ({
          Rank: i + 1,
          Participant: r.name,
          'Total Quizzes': r.totalQuizzes,
          'Average Score': r.avg,
          'Highest Score': r.best,
          'Total Points': r.points
        }))
      ],
      questions: [
        'question-analysis.csv',
        QMS.questions.all().map((q) => ({
          ID: q.id,
          Question: q.text,
          Category: QMS.categoryName(q.categoryId),
          Type: q.type,
          Difficulty: q.difficulty,
          Marks: q.marks,
          Status: q.status
        }))
      ]
    };
    const [name, rows] = map[type] || map.quiz;
    if (!rows.length) {
      if (window.App?.toast) App.toast('No rows to export', 'warning');
      return;
    }
    QMS.exportCSV(name, rows);
    if (window.App?.toast) App.toast('CSV exported', 'success');
  }

  function printReport() {
    window.print();
  }

  function rowsToHtmlTable(title, rows) {
    if (!rows.length) return `<h2>${QMS.escapeHtml(title)}</h2><p>No data</p>`;
    const headers = Object.keys(rows[0]);
    return `<h2>${QMS.escapeHtml(title)}</h2><table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:24px">
      <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${QMS.escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
  }

  function downloadReport() {
    if (!lastQuizRows.length && !lastPartRows.length && !lastCatRows.length) {
      generate();
    }
    const settings = QMS.getSettings();
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${settings.systemName || 'QuizPro'} Report</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#152033}h1{margin-bottom:4px}h2{margin-top:28px;color:#0f6e56}table{font-size:13px}th{background:#eef2f7;text-align:left}</style>
      </head><body>
      <h1>${QMS.escapeHtml(settings.systemName || 'QuizPro Admin')} — Full Report Pack</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      ${rowsToHtmlTable('Quiz Performance Report', lastQuizRows)}
      ${rowsToHtmlTable('Participant Performance Report', lastPartRows)}
      ${rowsToHtmlTable('Category Performance Report', lastCatRows)}
      ${rowsToHtmlTable(
        'Result Summary',
        filteredResults().map((r) => ({
          ResultID: r.id,
          Participant: QMS.participantName(r.participantId),
          Quiz: QMS.quizTitle(r.quizId),
          Date: r.date,
          Percentage: r.percentage,
          Status: r.status
        }))
      )}
      ${rowsToHtmlTable(
        'Leaderboard Report',
        (window.App?.leaderboardRows?.() || []).map((r, i) => ({
          Rank: i + 1,
          Participant: r.name,
          TotalQuizzes: r.totalQuizzes,
          AverageScore: r.avg,
          HighestScore: r.best,
          TotalPoints: r.points
        }))
      )}
      ${rowsToHtmlTable(
        'Question Analysis Report',
        QMS.questions.all().map((q) => ({
          ID: q.id,
          Question: q.text,
          Category: QMS.categoryName(q.categoryId),
          Type: q.type,
          Difficulty: q.difficulty,
          Marks: q.marks,
          Status: q.status
        }))
      )}
      </body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quizpro-full-report-${new Date().toISOString().slice(0, 10)}.html`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (window.App?.toast) App.toast('Full report downloaded', 'success');
  }

  function render() {
    populateFilters();
    generate();
  }

  return { render, generate, exportCSV, printReport, downloadReport, destroy };
})();
