/**
 * QuizPro Admin — app shell, routing, CRUD modules
 */
const App = (() => {
  let currentPage = 'dashboard';
  let quizPage = 1;
  const pageSize = 5;
  const sortState = {
    quizzes: { key: 'createdAt', dir: 'desc' },
    questions: { key: 'id', dir: 'asc' },
    categories: { key: 'name', dir: 'asc' },
    participants: { key: 'name', dir: 'asc' },
    results: { key: 'date', dir: 'desc' }
  };
  let notifications = [];

  function toast(message, type = 'success') {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `toast-item ${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function requireAuth() {
    // Professional flow: logged out by default — must login with email/password
    if (!QMS.isAuthenticated()) {
      location.replace('login.html?next=' + encodeURIComponent('index.html' + (location.hash || '#dashboard')));
      return false;
    }
    document.body.classList.add('auth-ready');
    return true;
  }

  function applySettingsUI() {
    const s = QMS.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme || 'light');
    document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
    document.documentElement.classList.add(`font-${s.fontSize || 'medium'}`);
    document.body.classList.toggle('compact-sidebar', !!s.compactSidebar);
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('compact', !!s.compactSidebar);
    const nameEls = document.querySelectorAll('[data-system-name]');
    nameEls.forEach((el) => (el.textContent = s.systemName || 'QuizPro Admin'));
    const userName = document.getElementById('topUserName');
    if (userName) userName.textContent = QMS.getSession()?.fullName || s.adminName || 'Admin';
    const avatar = document.getElementById('topAvatar');
    if (avatar) avatar.textContent = (userName?.textContent || 'A').charAt(0).toUpperCase();
  }

  function updateClock() {
    const el = document.getElementById('currentDateTime');
    if (!el) return;
    el.textContent = new Date().toLocaleString();
  }

  function setActiveNav(page) {
    document.querySelectorAll('.nav-link[data-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
  }

  function showPage(page) {
    currentPage = page;
    location.hash = page;
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.add('active');
    setActiveNav(page);
    closeMobileSidebar();
    renderPage(page);
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('show');
  }

  function openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarBackdrop')?.classList.add('show');
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    const map = {
      Active: 'badge-success',
      Passed: 'badge-success',
      Draft: 'badge-warning',
      Inactive: 'badge-muted',
      Failed: 'badge-danger',
      Archived: 'badge-info'
    };
    return `<span class="badge-soft ${map[status] || 'badge-muted'}">${esc(status)}</span>`;
  }

  function optionCategories(selected = '') {
    return QMS.categories
      .all()
      .map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');
  }

  function optionParticipants(selected = '') {
    return QMS.participants
      .all()
      .map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`)
      .join('');
  }

  function optionQuizzes(selected = '') {
    return QMS.quizzes
      .all()
      .map((q) => `<option value="${q.id}" ${q.id === selected ? 'selected' : ''}>${esc(q.title)}</option>`)
      .join('');
  }

  function parseSortValue(value, fallbackKey = 'id') {
    const [key, dir] = String(value || `${fallbackKey}:asc`).split(':');
    return { key: key || fallbackKey, dir: dir === 'desc' ? 'desc' : 'asc' };
  }

  function compareValues(a, b, dir) {
    const mul = dir === 'desc' ? -1 : 1;
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return (a - b) * mul;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * mul;
  }

  function sortByState(list, table, getters = {}) {
    const { key, dir } = sortState[table] || { key: 'id', dir: 'asc' };
    return [...list].sort((x, y) => {
      const av = getters[key] ? getters[key](x) : x[key];
      const bv = getters[key] ? getters[key](y) : y[key];
      return compareValues(av, bv, dir);
    });
  }

  function buildNotifications() {
    const recent = [...QMS.results.all()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    notifications = [
      { id: 'n1', text: `${QMS.quizzes.all().filter((q) => q.status === 'Active').length} active quizzes available`, time: 'Just now', read: false, page: 'quizzes' },
      { id: 'n2', text: 'Remember to review draft quizzes before publishing', time: 'Today', read: false, page: 'quizzes' },
      ...recent.map((r, i) => ({
        id: `nr_${r.id}`,
        text: `${QMS.participantName(r.participantId)} scored ${r.percentage}% on ${QMS.quizTitle(r.quizId)}`,
        time: new Date(r.date).toLocaleString(),
        read: false,
        page: 'results'
      }))
    ];
    renderNotifications();
  }

  function renderNotifications() {
    const list = document.getElementById('notifList');
    const dot = document.getElementById('notifDot');
    if (!list) return;
    const unread = notifications.filter((n) => !n.read).length;
    if (dot) dot.style.display = unread ? 'block' : 'none';
    list.innerHTML = notifications.length
      ? notifications
          .map(
            (n) => `<button type="button" class="notif-item ${n.read ? 'read' : ''}" data-notif-page="${n.page}" data-notif-id="${n.id}">
          <div>${esc(n.text)}</div>
          <small>${esc(n.time)}</small>
        </button>`
          )
          .join('')
      : '<div class="notif-empty">No notifications</div>';
  }

  /* ---------- Dashboard helpers ---------- */
  function leaderboardRows(filters = {}) {
    const results = QMS.results.all().filter((r) => {
      if (filters.quizId && r.quizId !== filters.quizId) return false;
      if (filters.categoryId) {
        const q = QMS.quizzes.get(r.quizId);
        if (!q || q.categoryId !== filters.categoryId) return false;
      }
      if (filters.period && filters.period !== 'all') {
        const d = new Date(r.date);
        const now = new Date();
        const days = filters.period === 'week' ? 7 : filters.period === 'month' ? 30 : 365;
        if ((now - d) / 86400000 > days) return false;
      }
      return true;
    });

    return QMS.participants
      .all()
      .map((p) => {
        const rows = results.filter((r) => r.participantId === p.id);
        const scores = rows.map((r) => Number(r.percentage) || 0);
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const best = scores.length ? Math.max(...scores) : 0;
        const points = scores.reduce((a, b) => a + b, 0);
        const quizSet = new Set(rows.map((r) => r.quizId));
        return {
          id: p.id,
          name: p.name,
          totalQuizzes: quizSet.size,
          avg,
          best,
          points,
          attempts: rows.length
        };
      })
      .filter((r) => r.attempts > 0)
      .sort((a, b) => b.points - a.points || b.avg - a.avg);
  }

  /* ---------- Quizzes ---------- */
  function filteredQuizzes() {
    const q = (document.getElementById('quizSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('quizFilterCat')?.value || '';
    const diff = document.getElementById('quizFilterDiff')?.value || '';
    const status = document.getElementById('quizFilterStatus')?.value || '';
    const date = document.getElementById('quizFilterDate')?.value || '';
    const sortSel = document.getElementById('quizSort')?.value;
    if (sortSel) sortState.quizzes = parseSortValue(sortSel, 'createdAt');
    const filtered = QMS.quizzes.all().filter((item) => {
      if (q && !`${item.title} ${item.subject}`.toLowerCase().includes(q)) return false;
      if (cat && item.categoryId !== cat) return false;
      if (diff && item.difficulty !== diff) return false;
      if (status && item.status !== status) return false;
      if (date && item.createdAt !== date) return false;
      return true;
    });
    return sortByState(filtered, 'quizzes', {
      category: (item) => QMS.categoryName(item.categoryId),
      questions: (item) => (item.questionIds || []).length || item.questionCount || 0,
      passing: (item) => Number(item.passingPercentage) || 0,
      duration: (item) => Number(item.duration) || 0
    });
  }

  function renderQuizzes() {
    const list = filteredQuizzes();
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    if (quizPage > totalPages) quizPage = totalPages;
    const slice = list.slice((quizPage - 1) * pageSize, quizPage * pageSize);
    const body = slice
      .map((item) => {
        const count = (item.questionIds || []).length || item.questionCount || 0;
        return `<tr>
          <td>${esc(item.id)}</td>
          <td>${esc(item.title)}</td>
          <td>${esc(QMS.categoryName(item.categoryId))}</td>
          <td>${count}</td>
          <td>${esc(item.duration)} min</td>
          <td>${esc(item.passingPercentage)}%</td>
          <td>${esc(item.difficulty)}</td>
          <td>${statusBadge(item.status)}</td>
          <td>${esc(item.createdAt)}</td>
          <td><div class="action-btns">
            <button class="btn btn-sm btn-outline-secondary" data-quiz-view="${item.id}">View</button>
            <button class="btn btn-sm btn-outline-brand" data-quiz-edit="${item.id}">Edit</button>
            <button class="btn btn-sm btn-outline-secondary" data-quiz-dup="${item.id}">Duplicate</button>
            <button class="btn btn-sm btn-outline-warning" data-quiz-toggle="${item.id}">${item.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-sm btn-outline-danger" data-quiz-del="${item.id}">Delete</button>
            <button class="btn btn-sm btn-brand text-white" data-quiz-start="${item.id}">Attempt</button>
          </div></td>
        </tr>`;
      })
      .join('');

    const cards = slice
      .map(
        (item) => `<div class="mobile-card">
        <h4>${esc(item.title)}</h4>
        <div class="mobile-meta">
          <div>${esc(QMS.categoryName(item.categoryId))} · ${esc(item.difficulty)} · ${statusBadge(item.status)}</div>
          <div>${(item.questionIds || []).length} Q · ${item.duration} min · Pass ${item.passingPercentage}%</div>
        </div>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline-brand" data-quiz-edit="${item.id}">Edit</button>
          <button class="btn btn-sm btn-brand text-white" data-quiz-start="${item.id}">Attempt</button>
          <button class="btn btn-sm btn-outline-danger" data-quiz-del="${item.id}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    document.getElementById('quizTableBody').innerHTML = body || `<tr><td colspan="10" class="text-center text-muted">No quizzes found</td></tr>`;
    document.getElementById('quizMobileCards').innerHTML = cards || '<div class="empty-state">No quizzes found</div>';
    document.getElementById('quizPagination').innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" ${quizPage <= 1 ? 'disabled' : ''} data-quiz-page="${quizPage - 1}">Prev</button>
      <span class="mx-2">Page ${quizPage} / ${totalPages}</span>
      <button class="btn btn-sm btn-outline-secondary" ${quizPage >= totalPages ? 'disabled' : ''} data-quiz-page="${quizPage + 1}">Next</button>`;
  }

  function openQuizModal(quiz = null) {
    const modalEl = document.getElementById('quizModal');
    const form = document.getElementById('quizForm');
    form.reset();
    form.classList.remove('was-validated');
    document.getElementById('quizFormId').value = quiz?.id || '';
    document.getElementById('quizModalTitle').textContent = quiz ? 'Edit Quiz' : 'Create New Quiz';
    document.getElementById('qfTitle').value = quiz?.title || '';
    document.getElementById('qfDescription').value = quiz?.description || '';
    document.getElementById('qfCategory').innerHTML = optionCategories(quiz?.categoryId || '');
    document.getElementById('qfSubject').value = quiz?.subject || '';
    document.getElementById('qfDifficulty').value = quiz?.difficulty || 'Easy';
    document.getElementById('qfQuestionCount').value = quiz?.questionCount || (quiz?.questionIds || []).length || 5;
    document.getElementById('qfDuration').value = quiz?.duration || QMS.getSettings().defaultDuration;
    document.getElementById('qfPassing').value = quiz?.passingPercentage || QMS.getSettings().defaultPassing;
    document.getElementById('qfMaxAttempts').value = quiz?.maxAttempts || 3;
    document.getElementById('qfStart').value = quiz?.startDate || '';
    document.getElementById('qfEnd').value = quiz?.endDate || '';
    document.getElementById('qfStatus').value = quiz?.status || 'Active';
    document.getElementById('qfInstructions').value = quiz?.instructions || '';
    document.getElementById('qfRandQ').checked = !!quiz?.randomizeQuestions;
    document.getElementById('qfRandA').checked = !!quiz?.randomizeAnswers;
    document.getElementById('qfShowAns').checked = quiz?.showCorrectAnswers !== false;
    document.getElementById('qfRetake').checked = quiz?.allowRetake !== false;
    document.getElementById('qfTimer').checked = quiz?.displayTimer !== false;
    document.getElementById('qfNeg').checked = !!quiz?.negativeMarking;

    const qSel = document.getElementById('qfQuestions');
    const selected = new Set(quiz?.questionIds || []);
    qSel.innerHTML = QMS.questions
      .all()
      .filter((q) => q.status === 'Active')
      .map((q) => `<option value="${q.id}" ${selected.has(q.id) ? 'selected' : ''}>${esc(q.text.slice(0, 80))}</option>`)
      .join('');

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function collectQuizPayload(prefix, asDraft, existingId = '') {
    const g = (suffix) => document.getElementById(prefix + suffix);
    const questionIds = [...(g('Questions')?.selectedOptions || [])].map((o) => o.value);
    const start = g('Start')?.value || '';
    const end = g('End')?.value || '';
    return {
      questionIds,
      start,
      end,
      payload: {
        title: (g('Title')?.value || '').trim(),
        description: (g('Description')?.value || '').trim(),
        categoryId: g('Category')?.value || '',
        subject: (g('Subject')?.value || '').trim(),
        difficulty: g('Difficulty')?.value || 'Easy',
        questionCount: Number(g('QuestionCount')?.value) || questionIds.length,
        duration: Number(g('Duration')?.value),
        passingPercentage: Number(g('Passing')?.value),
        maxAttempts: Number(g('MaxAttempts')?.value),
        startDate: start,
        endDate: end,
        status: asDraft ? 'Draft' : g('Status')?.value || 'Active',
        instructions: (g('Instructions')?.value || '').trim(),
        randomizeQuestions: !!g('RandQ')?.checked,
        randomizeAnswers: !!g('RandA')?.checked,
        showCorrectAnswers: !!g('ShowAns')?.checked,
        allowRetake: !!g('Retake')?.checked,
        displayTimer: !!g('Timer')?.checked,
        negativeMarking: !!g('Neg')?.checked,
        questionIds,
        createdAt: existingId
          ? QMS.quizzes.get(existingId)?.createdAt || new Date().toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      }
    };
  }

  function validateQuizPayload(form, { start, end, payload }) {
    if (form && !form.checkValidity()) {
      form.classList.add('was-validated');
      toast('Please fix validation errors', 'error');
      return false;
    }
    if (!payload.title || !payload.categoryId || !payload.subject) {
      toast('Title, subject and category are required', 'error');
      return false;
    }
    if (start && end && new Date(end) < new Date(start)) {
      toast('End date must be after start date', 'error');
      return false;
    }
    if (!(payload.duration > 0) || payload.passingPercentage < 0 || payload.passingPercentage > 100) {
      toast('Invalid duration or passing percentage', 'error');
      return false;
    }
    if (!(payload.maxAttempts > 0)) {
      toast('Maximum attempts must be a positive number', 'error');
      return false;
    }
    return true;
  }

  function saveQuiz(asDraft = false) {
    const form = document.getElementById('quizForm');
    const id = document.getElementById('quizFormId').value;
    const collected = collectQuizPayload('qf', asDraft, id);
    if (!validateQuizPayload(form, collected)) return;
    if (id) QMS.quizzes.update(id, collected.payload);
    else QMS.quizzes.create(collected.payload);
    bootstrap.Modal.getInstance(document.getElementById('quizModal'))?.hide();
    toast(asDraft ? 'Quiz saved as draft' : 'Quiz saved successfully', 'success');
    buildNotifications();
    if (currentPage === 'quizzes') renderQuizzes();
    else if (currentPage === 'dashboard') Dashboard.render();
  }

  function initCreateQuizPage() {
    const form = document.getElementById('createQuizForm');
    if (!form) return;
    form.classList.remove('was-validated');
    const s = QMS.getSettings();
    document.getElementById('cqCategory').innerHTML = optionCategories();
    document.getElementById('cqQuestionCount').value = 5;
    document.getElementById('cqDuration').value = s.defaultDuration || 30;
    document.getElementById('cqPassing').value = s.defaultPassing || 60;
    document.getElementById('cqMaxAttempts').value = 3;
    document.getElementById('cqStart').value = new Date().toISOString().slice(0, 10);
    document.getElementById('cqEnd').value = '2026-12-31';
    document.getElementById('cqStatus').value = 'Active';
    document.getElementById('cqDifficulty').value = 'Easy';
    document.getElementById('cqRandQ').checked = !!s.randomQuestions;
    document.getElementById('cqRandA').checked = !!s.randomAnswers;
    document.getElementById('cqShowAns').checked = s.showAnswers !== false;
    document.getElementById('cqRetake').checked = s.allowRetakes !== false;
    document.getElementById('cqTimer').checked = s.enableTimer !== false;
    document.getElementById('cqNeg').checked = false;
    document.getElementById('cqQuestions').innerHTML = QMS.questions
      .all()
      .filter((q) => q.status === 'Active')
      .map((q) => `<option value="${q.id}">${esc(q.text.slice(0, 90))}</option>`)
      .join('');
  }

  function resetCreateQuizPage() {
    document.getElementById('createQuizForm')?.reset();
    initCreateQuizPage();
    toast('Form reset', 'warning');
  }

  function saveCreateQuiz(asDraft = false) {
    const form = document.getElementById('createQuizForm');
    const collected = collectQuizPayload('cq', asDraft, '');
    if (!validateQuizPayload(form, collected)) return;
    QMS.quizzes.create(collected.payload);
    toast(asDraft ? 'Quiz saved as draft' : 'Quiz saved successfully', 'success');
    buildNotifications();
    form.reset();
    initCreateQuizPage();
    showPage('quizzes');
  }

  /* ---------- Questions ---------- */
  function filteredQuestions() {
    const q = (document.getElementById('qSearch')?.value || '').toLowerCase();
    const cat = document.getElementById('qFilterCat')?.value || '';
    const diff = document.getElementById('qFilterDiff')?.value || '';
    const type = document.getElementById('qFilterType')?.value || '';
    const status = document.getElementById('qFilterStatus')?.value || '';
    const sortSel = document.getElementById('qSort')?.value;
    if (sortSel) sortState.questions = parseSortValue(sortSel, 'id');
    const filtered = QMS.questions.all().filter((item) => {
      if (q && !item.text.toLowerCase().includes(q)) return false;
      if (cat && item.categoryId !== cat) return false;
      if (diff && item.difficulty !== diff) return false;
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      return true;
    });
    return sortByState(filtered, 'questions', {
      category: (item) => QMS.categoryName(item.categoryId),
      marks: (item) => Number(item.marks) || 0
    });
  }

  function renderQuestions() {
    const list = filteredQuestions();
    document.getElementById('questionTableBody').innerHTML =
      list
        .map((item) => {
          const ans =
            item.type === 'mcq' || item.type === 'truefalse'
              ? `${item.correctAnswer}${item.options?.[item.correctAnswer] ? ' — ' + item.options[item.correctAnswer] : ''}`
              : item.correctAnswer;
          return `<tr>
          <td>${esc(item.id)}</td>
          <td>${esc(item.text)}</td>
          <td>${esc(QMS.categoryName(item.categoryId))}</td>
          <td>${esc(item.difficulty)}</td>
          <td>${esc(item.type)}</td>
          <td>${esc(ans)}</td>
          <td>${esc(item.marks)}</td>
          <td>${statusBadge(item.status)}</td>
          <td class="action-btns">
            <button class="btn btn-sm btn-outline-brand" data-q-edit="${item.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-q-del="${item.id}">Delete</button>
          </td>
        </tr>`;
        })
        .join('') || `<tr><td colspan="9" class="text-center text-muted">No questions found</td></tr>`;

    document.getElementById('questionMobileCards').innerHTML =
      list
        .map(
          (item) => `<div class="mobile-card">
        <h4>${esc(item.text.slice(0, 90))}</h4>
        <div class="mobile-meta">${esc(item.type)} · ${esc(item.difficulty)} · ${statusBadge(item.status)}</div>
        <div class="action-btns">
          <button class="btn btn-sm btn-outline-brand" data-q-edit="${item.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger" data-q-del="${item.id}">Delete</button>
        </div>
      </div>`
        )
        .join('') || '<div class="empty-state">No questions found</div>';
  }

  function syncQuestionTypeFields() {
    const type = document.getElementById('qqType').value;
    document.getElementById('mcqFields').classList.toggle('d-none', type !== 'mcq');
    document.getElementById('tfFields').classList.toggle('d-none', type !== 'truefalse');
    document.getElementById('textAnswerFields').classList.toggle('d-none', !(type === 'short' || type === 'fillblank'));
  }

  function openQuestionModal(question = null) {
    const form = document.getElementById('questionForm');
    form.reset();
    form.classList.remove('was-validated');
    document.getElementById('questionFormId').value = question?.id || '';
    document.getElementById('questionModalTitle').textContent = question ? 'Edit Question' : 'Add New Question';
    document.getElementById('qqText').value = question?.text || '';
    document.getElementById('qqType').value = question?.type || 'mcq';
    document.getElementById('qqCategory').innerHTML = optionCategories(question?.categoryId || '');
    document.getElementById('qqDifficulty').value = question?.difficulty || 'Easy';
    document.getElementById('qqMarks').value = question?.marks || 1;
    document.getElementById('qqExplanation').value = question?.explanation || '';
    document.getElementById('qqStatus').value = question?.status || 'Active';
    document.getElementById('qqA').value = question?.options?.A || '';
    document.getElementById('qqB').value = question?.options?.B || '';
    document.getElementById('qqC').value = question?.options?.C || '';
    document.getElementById('qqD').value = question?.options?.D || '';
    document.getElementById('qqCorrectMCQ').value = question?.type === 'mcq' ? question.correctAnswer : 'A';
    document.getElementById('qqCorrectTF').value = question?.type === 'truefalse' ? question.correctAnswer : 'A';
    document.getElementById('qqCorrectText').value =
      question && (question.type === 'short' || question.type === 'fillblank') ? question.correctAnswer : '';
    syncQuestionTypeFields();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('questionModal')).show();
  }

  function saveQuestion() {
    const form = document.getElementById('questionForm');
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      toast('Please fix validation errors', 'error');
      return;
    }
    const type = document.getElementById('qqType').value;
    const marks = Number(document.getElementById('qqMarks').value);
    if (!(marks > 0)) {
      toast('Marks must be a positive number', 'error');
      return;
    }
    let options = {};
    let correctAnswer = '';
    if (type === 'mcq') {
      options = {
        A: document.getElementById('qqA').value.trim(),
        B: document.getElementById('qqB').value.trim(),
        C: document.getElementById('qqC').value.trim(),
        D: document.getElementById('qqD').value.trim()
      };
      if (!options.A || !options.B || !options.C || !options.D) {
        toast('All MCQ options are required', 'error');
        return;
      }
      correctAnswer = document.getElementById('qqCorrectMCQ').value;
    } else if (type === 'truefalse') {
      options = { A: 'True', B: 'False' };
      correctAnswer = document.getElementById('qqCorrectTF').value;
    } else {
      correctAnswer = document.getElementById('qqCorrectText').value.trim();
      if (!correctAnswer) {
        toast('Expected answer is required', 'error');
        return;
      }
    }
    const id = document.getElementById('questionFormId').value;
    const payload = {
      text: document.getElementById('qqText').value.trim(),
      type,
      categoryId: document.getElementById('qqCategory').value,
      difficulty: document.getElementById('qqDifficulty').value,
      marks,
      explanation: document.getElementById('qqExplanation').value.trim(),
      status: document.getElementById('qqStatus').value,
      options,
      correctAnswer
    };
    if (id) QMS.questions.update(id, payload);
    else QMS.questions.create(payload);
    bootstrap.Modal.getInstance(document.getElementById('questionModal'))?.hide();
    toast('Question saved', 'success');
    renderQuestions();
  }

  /* ---------- Categories ---------- */
  function renderCategories() {
    const q = (document.getElementById('catSearch')?.value || '').toLowerCase();
    const status = document.getElementById('catFilterStatus')?.value || '';
    const sortSel = document.getElementById('catSort')?.value;
    if (sortSel) sortState.categories = parseSortValue(sortSel, 'name');
    const filtered = QMS.categories.all().filter((c) => {
      if (q && !`${c.name} ${c.description}`.toLowerCase().includes(q)) return false;
      if (status && c.status !== status) return false;
      return true;
    });
    const list = sortByState(filtered, 'categories', {
      quizzes: (c) => QMS.quizzes.all().filter((x) => x.categoryId === c.id).length,
      questions: (c) => QMS.questions.all().filter((x) => x.categoryId === c.id).length
    });
    document.getElementById('categoryTableBody').innerHTML =
      list
        .map((c) => {
          const quizzes = QMS.quizzes.all().filter((x) => x.categoryId === c.id).length;
          const questions = QMS.questions.all().filter((x) => x.categoryId === c.id).length;
          return `<tr>
          <td>${esc(c.name)}</td>
          <td>${esc(c.description)}</td>
          <td>${quizzes}</td>
          <td>${questions}</td>
          <td>${statusBadge(c.status)}</td>
          <td>${esc(c.createdAt)}</td>
          <td class="action-btns">
            <button class="btn btn-sm btn-outline-brand" data-cat-edit="${c.id}">Edit</button>
            <button class="btn btn-sm btn-outline-danger" data-cat-del="${c.id}">Delete</button>
          </td>
        </tr>`;
        })
        .join('') || `<tr><td colspan="7" class="text-center text-muted">No categories found</td></tr>`;
    const cardsEl = document.getElementById('categoryMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        list
          .map((c) => {
            const quizzes = QMS.quizzes.all().filter((x) => x.categoryId === c.id).length;
            const questions = QMS.questions.all().filter((x) => x.categoryId === c.id).length;
            return `<div class="mobile-card">
              <h4>${esc(c.name)}</h4>
              <div class="mobile-meta">${esc(c.description)} · ${quizzes} quizzes · ${questions} questions · ${statusBadge(c.status)}</div>
              <div class="action-btns">
                <button class="btn btn-sm btn-outline-brand" data-cat-edit="${c.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger" data-cat-del="${c.id}">Delete</button>
              </div>
            </div>`;
          })
          .join('') || '<div class="empty-state">No categories found</div>';
    }
  }

  function openCategoryModal(cat = null) {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryForm').classList.remove('was-validated');
    document.getElementById('categoryFormId').value = cat?.id || '';
    document.getElementById('categoryModalTitle').textContent = cat ? 'Edit Category' : 'Add Category';
    document.getElementById('cfName').value = cat?.name || '';
    document.getElementById('cfDescription').value = cat?.description || '';
    document.getElementById('cfStatus').value = cat?.status || 'Active';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryModal')).show();
  }

  function saveCategory() {
    const form = document.getElementById('categoryForm');
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      toast('Category name is required', 'error');
      return;
    }
    const id = document.getElementById('categoryFormId').value;
    const payload = {
      name: document.getElementById('cfName').value.trim(),
      description: document.getElementById('cfDescription').value.trim(),
      status: document.getElementById('cfStatus').value,
      createdAt: id ? QMS.categories.get(id)?.createdAt || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    };
    if (id) QMS.categories.update(id, payload);
    else QMS.categories.create(payload);
    bootstrap.Modal.getInstance(document.getElementById('categoryModal'))?.hide();
    toast('Category saved', 'success');
    renderCategories();
  }

  /* ---------- Participants ---------- */
  function participantStats(p) {
    const rows = QMS.results.all().filter((r) => r.participantId === p.id);
    const quizSet = new Set(rows.map((r) => r.quizId));
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.percentage, 0) / rows.length) : 0;
    return {
      totalQuizzes: quizSet.size,
      completed: rows.length,
      avg
    };
  }

  function renderParticipants() {
    const q = (document.getElementById('partSearch')?.value || '').toLowerCase();
    const status = document.getElementById('partFilterStatus')?.value || '';
    const sortSel = document.getElementById('partSort')?.value;
    if (sortSel) sortState.participants = parseSortValue(sortSel, 'name');
    const filtered = QMS.participants.all().filter((p) => {
      if (q && !`${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(q)) return false;
      if (status && p.status !== status) return false;
      return true;
    });
    const list = sortByState(filtered, 'participants', {
      totalQuizzes: (p) => participantStats(p).totalQuizzes,
      completed: (p) => participantStats(p).completed,
      avg: (p) => participantStats(p).avg
    });
    document.getElementById('participantTableBody').innerHTML =
      list
        .map((p) => {
          const st = participantStats(p);
          return `<tr>
          <td>${esc(p.id)}</td>
          <td>${esc(p.name)}</td>
          <td>${esc(p.email)}</td>
          <td>${esc(p.phone)}</td>
          <td>${st.totalQuizzes}</td>
          <td>${st.completed}</td>
          <td>${st.avg}%</td>
          <td>${statusBadge(p.status)}</td>
          <td>${esc(p.registeredAt)}</td>
          <td class="action-btns">
            <button class="btn btn-sm btn-outline-secondary" data-part-view="${p.id}">View Profile</button>
            <button class="btn btn-sm btn-outline-brand" data-part-edit="${p.id}">Edit</button>
            <button class="btn btn-sm btn-outline-info" data-part-attempts="${p.id}">View Attempts</button>
            <button class="btn btn-sm btn-outline-danger" data-part-del="${p.id}">Delete</button>
          </td>
        </tr>`;
        })
        .join('') || `<tr><td colspan="10" class="text-center text-muted">No participants found</td></tr>`;
    const cardsEl = document.getElementById('participantMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        list
          .map((p) => {
            const st = participantStats(p);
            return `<div class="mobile-card">
              <h4>${esc(p.name)}</h4>
              <div class="mobile-meta">${esc(p.email)} · Avg ${st.avg}% · ${statusBadge(p.status)}</div>
              <div class="action-btns">
                <button class="btn btn-sm btn-outline-brand" data-part-edit="${p.id}">Edit</button>
                <button class="btn btn-sm btn-outline-info" data-part-attempts="${p.id}">View Attempts</button>
                <button class="btn btn-sm btn-outline-danger" data-part-del="${p.id}">Delete</button>
              </div>
            </div>`;
          })
          .join('') || '<div class="empty-state">No participants found</div>';
    }
  }

  function openParticipantModal(p = null) {
    document.getElementById('participantForm').reset();
    document.getElementById('participantForm').classList.remove('was-validated');
    document.getElementById('participantFormId').value = p?.id || '';
    document.getElementById('participantModalTitle').textContent = p ? 'Edit Participant' : 'Add Participant';
    document.getElementById('pfName').value = p?.name || '';
    document.getElementById('pfEmail').value = p?.email || '';
    document.getElementById('pfPhone').value = p?.phone || '';
    document.getElementById('pfStatus').value = p?.status || 'Active';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('participantModal')).show();
  }

  function saveParticipant() {
    const form = document.getElementById('participantForm');
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      toast('Please fix validation errors', 'error');
      return;
    }
    const id = document.getElementById('participantFormId').value;
    const payload = {
      name: document.getElementById('pfName').value.trim(),
      email: document.getElementById('pfEmail').value.trim(),
      phone: document.getElementById('pfPhone').value.trim(),
      status: document.getElementById('pfStatus').value,
      registeredAt: id ? QMS.participants.get(id)?.registeredAt || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    };
    if (id) QMS.participants.update(id, payload);
    else QMS.participants.create(payload);
    bootstrap.Modal.getInstance(document.getElementById('participantModal'))?.hide();
    toast('Participant saved', 'success');
    renderParticipants();
  }

  /* ---------- Results ---------- */
  function filteredResultsAdmin() {
    const q = (document.getElementById('resSearch')?.value || '').toLowerCase();
    const date = document.getElementById('resFilterDate')?.value || '';
    const quizId = document.getElementById('resFilterQuiz')?.value || '';
    const participantId = document.getElementById('resFilterPart')?.value || '';
    const status = document.getElementById('resFilterStatus')?.value || '';
    return QMS.results.all().filter((r) => {
      const hay = `${r.id} ${QMS.participantName(r.participantId)} ${QMS.quizTitle(r.quizId)}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (date && !String(r.date).startsWith(date)) return false;
      if (quizId && r.quizId !== quizId) return false;
      if (participantId && r.participantId !== participantId) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  function renderResults() {
    const quizFilter = document.getElementById('resFilterQuiz');
    const partFilter = document.getElementById('resFilterPart');
    if (quizFilter && !quizFilter.dataset.ready) {
      quizFilter.innerHTML = '<option value="">All Quizzes</option>' + optionQuizzes();
      quizFilter.dataset.ready = '1';
    }
    if (partFilter && !partFilter.dataset.ready) {
      partFilter.innerHTML = '<option value="">All Participants</option>' + optionParticipants();
      partFilter.dataset.ready = '1';
    }
    const sortSel = document.getElementById('resSort')?.value;
    if (sortSel) sortState.results = parseSortValue(sortSel, 'date');
    const list = sortByState(filteredResultsAdmin(), 'results', {
      participant: (r) => QMS.participantName(r.participantId),
      quiz: (r) => QMS.quizTitle(r.quizId),
      date: (r) => new Date(r.date).getTime(),
      percentage: (r) => Number(r.percentage) || 0
    });
    document.getElementById('resultsTableBody').innerHTML =
      list
        .map((r) => {
          const mins = Math.floor((r.timeTaken || 0) / 60);
          const secs = (r.timeTaken || 0) % 60;
          return `<tr>
          <td>${esc(r.id)}</td>
          <td>${esc(QMS.participantName(r.participantId))}</td>
          <td>${esc(QMS.quizTitle(r.quizId))}</td>
          <td>${new Date(r.date).toLocaleString()}</td>
          <td>${esc(r.obtainedMarks ?? r.score)}/${esc(r.totalMarks)}</td>
          <td>${esc(r.percentage)}%</td>
          <td>${mins}m ${secs}s</td>
          <td>${statusBadge(r.status)}</td>
          <td class="action-btns">
            <a class="btn btn-sm btn-outline-brand" href="quiz.html?result=${encodeURIComponent(r.id)}">View Result</a>
            <button class="btn btn-sm btn-outline-secondary" onclick="window.open('quiz.html?result=${encodeURIComponent(r.id)}')">Print</button>
            <button class="btn btn-sm btn-outline-danger" data-res-del="${r.id}">Delete</button>
          </td>
        </tr>`;
        })
        .join('') || `<tr><td colspan="9" class="text-center text-muted">No results found</td></tr>`;
    const cardsEl = document.getElementById('resultsMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        list
          .map(
            (r) => `<div class="mobile-card">
            <h4>${esc(QMS.participantName(r.participantId))}</h4>
            <div class="mobile-meta">${esc(QMS.quizTitle(r.quizId))} · ${r.percentage}% · ${statusBadge(r.status)}</div>
            <div class="action-btns">
              <a class="btn btn-sm btn-outline-brand" href="quiz.html?result=${encodeURIComponent(r.id)}">View Result</a>
              <button class="btn btn-sm btn-outline-danger" data-res-del="${r.id}">Delete</button>
            </div>
          </div>`
          )
          .join('') || '<div class="empty-state">No results found</div>';
    }
  }

  /* ---------- Attempts launcher ---------- */
  function renderAttempts() {
    document.getElementById('attemptQuiz').innerHTML = optionQuizzes();
    document.getElementById('attemptParticipant').innerHTML = optionParticipants();
    const recent = [...QMS.results.all()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
    document.getElementById('attemptsTableBody').innerHTML =
      recent
        .map(
          (r) => `<tr>
        <td>${esc(QMS.participantName(r.participantId))}</td>
        <td>${esc(QMS.quizTitle(r.quizId))}</td>
        <td>${new Date(r.date).toLocaleString()}</td>
        <td>${esc(r.percentage)}%</td>
        <td>${statusBadge(r.status)}</td>
        <td><a class="btn btn-sm btn-outline-brand" href="quiz.html?result=${encodeURIComponent(r.id)}">Open</a></td>
      </tr>`
        )
        .join('') || `<tr><td colspan="6" class="text-center text-muted">No attempts yet</td></tr>`;
  }

  /* ---------- Leaderboard ---------- */
  function renderLeaderboard() {
    const quizSel = document.getElementById('lbQuiz');
    const catSel = document.getElementById('lbCategory');
    if (quizSel && !quizSel.dataset.ready) {
      quizSel.innerHTML = '<option value="">All Quizzes</option>' + optionQuizzes();
      quizSel.dataset.ready = '1';
    }
    if (catSel && !catSel.dataset.ready) {
      catSel.innerHTML = '<option value="">All Categories</option>' + optionCategories();
      catSel.dataset.ready = '1';
    }
    const rows = leaderboardRows({
      quizId: document.getElementById('lbQuiz')?.value || '',
      categoryId: document.getElementById('lbCategory')?.value || '',
      period: document.getElementById('lbPeriod')?.value || 'all'
    });
    const top = rows.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const classes = ['first', 'second', 'third'];
    document.getElementById('leaderTop').innerHTML = [0, 1, 2]
      .map((i) => {
        const r = top[i];
        if (!r) return `<div class="leader-card ${classes[i]}"><div style="font-size:1.6rem">${medals[i]}</div><h3>—</h3><div class="text-muted">No data</div></div>`;
        return `<div class="leader-card ${classes[i]}">
          <div style="font-size:1.6rem">${medals[i]}</div>
          <h3 style="margin:.35rem 0">${esc(r.name)}</h3>
          <div>Avg ${r.avg}% · Best ${r.best}% · ${r.points} pts</div>
        </div>`;
      })
      .join('');

    document.getElementById('leaderTableBody').innerHTML =
      rows
        .map(
          (r, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td>${r.totalQuizzes}</td>
        <td>${r.avg}%</td>
        <td>${r.best}%</td>
        <td>${r.points}</td>
      </tr>`
        )
        .join('') || `<tr><td colspan="6" class="text-center text-muted">No leaderboard data</td></tr>`;
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const s = QMS.getSettings();
    document.getElementById('setSystemName').value = s.systemName || '';
    document.getElementById('setAdminName').value = s.adminName || '';
    document.getElementById('setEmail').value = s.email || '';
    document.getElementById('setDuration').value = s.defaultDuration || 30;
    document.getElementById('setPassing').value = s.defaultPassing || 60;
    document.getElementById('setTimer').checked = s.enableTimer !== false;
    document.getElementById('setRandQ').checked = !!s.randomQuestions;
    document.getElementById('setRandA').checked = !!s.randomAnswers;
    document.getElementById('setRetakes').checked = s.allowRetakes !== false;
    document.getElementById('setShowAns').checked = s.showAnswers !== false;
    document.getElementById('setTheme').value = s.theme || 'light';
    document.getElementById('setCompact').checked = !!s.compactSidebar;
    document.getElementById('setFont').value = s.fontSize || 'medium';
  }

  function saveSettings() {
    const email = document.getElementById('setEmail').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Invalid email format', 'error');
      return;
    }
    const duration = Number(document.getElementById('setDuration').value);
    const passing = Number(document.getElementById('setPassing').value);
    if (!(duration > 0) || passing < 0 || passing > 100) {
      toast('Invalid duration or passing percentage', 'error');
      return;
    }
    QMS.saveSettings({
      systemName: document.getElementById('setSystemName').value.trim(),
      adminName: document.getElementById('setAdminName').value.trim(),
      email,
      defaultDuration: duration,
      defaultPassing: passing,
      enableTimer: document.getElementById('setTimer').checked,
      randomQuestions: document.getElementById('setRandQ').checked,
      randomAnswers: document.getElementById('setRandA').checked,
      allowRetakes: document.getElementById('setRetakes').checked,
      showAnswers: document.getElementById('setShowAns').checked,
      theme: document.getElementById('setTheme').value,
      compactSidebar: document.getElementById('setCompact').checked,
      fontSize: document.getElementById('setFont').value
    });
    applySettingsUI();
    toast('Settings saved', 'success');
  }

  /* ---------- Global search ---------- */
  function globalSearch(term) {
    const q = term.trim().toLowerCase();
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    if (!q) {
      box.classList.add('d-none');
      box.innerHTML = '';
      return;
    }
    const hits = [];
    QMS.quizzes.all().forEach((x) => {
      if (x.title.toLowerCase().includes(q)) hits.push({ type: 'Quiz', label: x.title, page: 'quizzes' });
    });
    QMS.questions.all().forEach((x) => {
      if (x.text.toLowerCase().includes(q)) hits.push({ type: 'Question', label: x.text.slice(0, 70), page: 'questions' });
    });
    QMS.participants.all().forEach((x) => {
      if (`${x.name} ${x.email}`.toLowerCase().includes(q)) hits.push({ type: 'Participant', label: x.name, page: 'participants' });
    });
    QMS.categories.all().forEach((x) => {
      if (x.name.toLowerCase().includes(q)) hits.push({ type: 'Category', label: x.name, page: 'categories' });
    });
    QMS.results.all().forEach((x) => {
      const label = `${QMS.participantName(x.participantId)} — ${QMS.quizTitle(x.quizId)}`;
      if (label.toLowerCase().includes(q)) hits.push({ type: 'Result', label, page: 'results' });
    });
    box.innerHTML = hits.slice(0, 12)
      .map((h) => `<button class="dropdown-item" data-goto-page="${h.page}"><strong>${esc(h.type)}:</strong> ${esc(h.label)}</button>`)
      .join('') || '<div class="dropdown-item text-muted">No matches</div>';
    box.classList.remove('d-none');
  }

  function renderPage(page) {
    Dashboard.destroyCharts();
    Reports.destroy();
    switch (page) {
      case 'dashboard':
        Dashboard.render();
        break;
      case 'quizzes':
        document.getElementById('quizFilterCat').innerHTML = '<option value="">All Categories</option>' + optionCategories();
        renderQuizzes();
        break;
      case 'create-quiz':
        initCreateQuizPage();
        break;
      case 'questions':
        document.getElementById('qFilterCat').innerHTML = '<option value="">All Categories</option>' + optionCategories();
        renderQuestions();
        break;
      case 'categories':
        renderCategories();
        break;
      case 'participants':
        renderParticipants();
        break;
      case 'attempts':
        renderAttempts();
        break;
      case 'results':
        document.getElementById('resFilterQuiz').dataset.ready = '';
        document.getElementById('resFilterPart').dataset.ready = '';
        renderResults();
        break;
      case 'reports':
        Reports.render();
        break;
      case 'leaderboard':
        document.getElementById('lbQuiz').dataset.ready = '';
        document.getElementById('lbCategory').dataset.ready = '';
        renderLeaderboard();
        break;
      case 'settings':
        renderSettings();
        break;
      default:
        break;
    }
  }

  function bindEvents() {
    document.querySelectorAll('.nav-link[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.dataset.page));
    });
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (window.innerWidth <= 992) {
        sidebar.classList.contains('open') ? closeMobileSidebar() : openMobileSidebar();
      } else {
        const s = QMS.getSettings();
        QMS.saveSettings({ compactSidebar: !s.compactSidebar });
        applySettingsUI();
      }
    });
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      if (!confirm('Are you sure you want to logout?')) return;
      QMS.logout();
      toast('Logged out successfully', 'success');
      setTimeout(() => location.replace('login.html'), 350);
    });

    document.getElementById('globalSearch')?.addEventListener('input', (e) => globalSearch(e.target.value));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.top-search')) {
        document.getElementById('globalSearchResults')?.classList.add('d-none');
      }
      const goto = e.target.closest('[data-goto-page]');
      if (goto) showPage(goto.dataset.gotoPage);

      const viewResult = e.target.closest('[data-view-result]');
      if (viewResult) location.href = `quiz.html?result=${encodeURIComponent(viewResult.dataset.viewResult)}`;

      // Quizzes
      if (e.target.closest('[data-quiz-page]')) {
        quizPage = Number(e.target.closest('[data-quiz-page]').dataset.quizPage);
        renderQuizzes();
      }
      if (e.target.closest('[data-quiz-view]')) {
        const q = QMS.quizzes.get(e.target.closest('[data-quiz-view]').dataset.quizView);
        alert(`${q.title}\n\n${q.description}\n\nQuestions: ${(q.questionIds || []).length}\nDuration: ${q.duration} min\nStatus: ${q.status}`);
      }
      if (e.target.closest('[data-quiz-edit]')) openQuizModal(QMS.quizzes.get(e.target.closest('[data-quiz-edit]').dataset.quizEdit));
      if (e.target.closest('[data-quiz-dup]')) {
        const q = QMS.quizzes.get(e.target.closest('[data-quiz-dup]').dataset.quizDup);
        QMS.quizzes.create({ ...q, id: undefined, title: q.title + ' (Copy)', status: 'Draft', createdAt: new Date().toISOString().slice(0, 10) });
        toast('Quiz duplicated', 'success');
        renderQuizzes();
      }
      if (e.target.closest('[data-quiz-toggle]')) {
        const id = e.target.closest('[data-quiz-toggle]').dataset.quizToggle;
        const q = QMS.quizzes.get(id);
        QMS.quizzes.update(id, { status: q.status === 'Active' ? 'Inactive' : 'Active' });
        toast('Quiz status updated', 'success');
        renderQuizzes();
      }
      if (e.target.closest('[data-quiz-del]')) {
        if (confirm('Delete this quiz?')) {
          QMS.quizzes.remove(e.target.closest('[data-quiz-del]').dataset.quizDel);
          toast('Quiz deleted', 'warning');
          renderQuizzes();
        }
      }
      if (e.target.closest('[data-quiz-start]')) {
        const quizId = e.target.closest('[data-quiz-start]').dataset.quizStart;
        const first = QMS.participants.all().find((p) => p.status === 'Active') || QMS.participants.all()[0];
        if (!first) return toast('Add a participant first', 'error');
        const pid = prompt('Enter participant ID (or leave default):', first.id) || first.id;
        if (!QMS.participants.get(pid)) return toast('Participant not found', 'error');
        location.href = `quiz.html?start=${encodeURIComponent(quizId)}&p=${encodeURIComponent(pid)}`;
      }

      // Questions
      if (e.target.closest('[data-q-edit]')) openQuestionModal(QMS.questions.get(e.target.closest('[data-q-edit]').dataset.qEdit));
      if (e.target.closest('[data-q-del]')) {
        if (confirm('Delete this question?')) {
          QMS.questions.remove(e.target.closest('[data-q-del]').dataset.qDel);
          toast('Question deleted', 'warning');
          renderQuestions();
        }
      }

      // Categories
      if (e.target.closest('[data-cat-edit]')) openCategoryModal(QMS.categories.get(e.target.closest('[data-cat-edit]').dataset.catEdit));
      if (e.target.closest('[data-cat-del]')) {
        if (confirm('Delete this category?')) {
          QMS.categories.remove(e.target.closest('[data-cat-del]').dataset.catDel);
          toast('Category deleted', 'warning');
          renderCategories();
        }
      }

      // Participants
      if (e.target.closest('[data-part-edit]')) openParticipantModal(QMS.participants.get(e.target.closest('[data-part-edit]').dataset.partEdit));
      if (e.target.closest('[data-part-view]')) {
        const p = QMS.participants.get(e.target.closest('[data-part-view]').dataset.partView);
        const st = participantStats(p);
        alert(`${p.name}\n${p.email}\n${p.phone}\nQuizzes: ${st.totalQuizzes}\nCompleted: ${st.completed}\nAvg: ${st.avg}%`);
      }
      if (e.target.closest('[data-part-attempts]')) {
        document.getElementById('resFilterPart').dataset.ready = '';
        showPage('results');
        setTimeout(() => {
          document.getElementById('resFilterPart').value = e.target.closest('[data-part-attempts]').dataset.partAttempts;
          renderResults();
        }, 50);
      }
      if (e.target.closest('[data-part-del]')) {
        if (confirm('Delete this participant?')) {
          QMS.participants.remove(e.target.closest('[data-part-del]').dataset.partDel);
          toast('Participant deleted', 'warning');
          renderParticipants();
        }
      }

      if (e.target.closest('[data-res-del]')) {
        if (confirm('Delete this result?')) {
          QMS.results.remove(e.target.closest('[data-res-del]').dataset.resDel);
          toast('Result deleted', 'warning');
          renderResults();
        }
      }
    });

    // Filters
    ['quizSearch', 'quizFilterCat', 'quizFilterDiff', 'quizFilterStatus', 'quizFilterDate', 'quizSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        quizPage = 1;
        renderQuizzes();
      });
      document.getElementById(id)?.addEventListener('change', () => {
        quizPage = 1;
        renderQuizzes();
      });
    });
    ['qSearch', 'qFilterCat', 'qFilterDiff', 'qFilterType', 'qFilterStatus', 'qSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', renderQuestions);
      document.getElementById(id)?.addEventListener('change', renderQuestions);
    });
    ['catSearch', 'catFilterStatus', 'catSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', renderCategories);
      document.getElementById(id)?.addEventListener('change', renderCategories);
    });
    ['partSearch', 'partFilterStatus', 'partSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', renderParticipants);
      document.getElementById(id)?.addEventListener('change', renderParticipants);
    });
    ['resSearch', 'resFilterDate', 'resFilterQuiz', 'resFilterPart', 'resFilterStatus', 'resSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', renderResults);
      document.getElementById(id)?.addEventListener('change', renderResults);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notif-wrap')) {
        document.getElementById('notifPanel')?.classList.add('d-none');
      }
      const notifItem = e.target.closest('[data-notif-page]');
      if (notifItem) {
        const id = notifItem.dataset.notifId;
        notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
        renderNotifications();
        showPage(notifItem.dataset.notifPage);
        document.getElementById('notifPanel')?.classList.add('d-none');
      }
      const sortTh = e.target.closest('th.sortable[data-sort]');
      if (sortTh) {
        const table = sortTh.dataset.sortTable || 'quizzes';
        const key = sortTh.dataset.sort;
        if (sortState[table]) {
          if (sortState[table].key === key) {
            sortState[table].dir = sortState[table].dir === 'asc' ? 'desc' : 'asc';
          } else {
            sortState[table] = { key, dir: 'asc' };
          }
          if (table === 'quizzes') renderQuizzes();
          if (table === 'questions') renderQuestions();
          if (table === 'categories') renderCategories();
          if (table === 'participants') renderParticipants();
          if (table === 'results') renderResults();
        }
      }
    });
    ['lbQuiz', 'lbCategory', 'lbPeriod'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', renderLeaderboard);
    });

    document.getElementById('btnAddQuiz')?.addEventListener('click', () => showPage('create-quiz'));
    document.getElementById('btnSaveQuiz')?.addEventListener('click', () => saveQuiz(false));
    document.getElementById('btnDraftQuiz')?.addEventListener('click', () => saveQuiz(true));
    document.getElementById('btnResetQuiz')?.addEventListener('click', () => {
      document.getElementById('quizForm').reset();
      document.getElementById('qfCategory').innerHTML = optionCategories();
    });
    document.getElementById('btnSaveCreateQuiz')?.addEventListener('click', () => saveCreateQuiz(false));
    document.getElementById('btnDraftCreateQuiz')?.addEventListener('click', () => saveCreateQuiz(true));
    document.getElementById('btnResetCreateQuiz')?.addEventListener('click', resetCreateQuizPage);
    document.getElementById('btnCancelCreateQuiz')?.addEventListener('click', () => showPage('quizzes'));

    document.getElementById('btnNotifications')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('notifPanel')?.classList.toggle('d-none');
    });
    document.getElementById('btnClearNotifs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      notifications = notifications.map((n) => ({ ...n, read: true }));
      renderNotifications();
      toast('All notifications marked as read', 'success');
    });
    document.getElementById('btnDownloadReport')?.addEventListener('click', () => Reports.downloadReport());

    document.getElementById('btnAddQuestion')?.addEventListener('click', () => openQuestionModal(null));
    document.getElementById('qqType')?.addEventListener('change', syncQuestionTypeFields);
    document.getElementById('btnSaveQuestion')?.addEventListener('click', saveQuestion);
    document.getElementById('btnResetQuestion')?.addEventListener('click', () => {
      document.getElementById('questionForm').reset();
      syncQuestionTypeFields();
    });

    document.getElementById('btnAddCategory')?.addEventListener('click', () => openCategoryModal(null));
    document.getElementById('btnSaveCategory')?.addEventListener('click', saveCategory);

    document.getElementById('btnAddParticipant')?.addEventListener('click', () => openParticipantModal(null));
    document.getElementById('btnSaveParticipant')?.addEventListener('click', saveParticipant);

    document.getElementById('btnStartAttempt')?.addEventListener('click', () => {
      const quizId = document.getElementById('attemptQuiz').value;
      const pid = document.getElementById('attemptParticipant').value;
      if (!quizId || !pid) return toast('Select quiz and participant', 'error');
      location.href = `quiz.html?start=${encodeURIComponent(quizId)}&p=${encodeURIComponent(pid)}`;
    });

    document.getElementById('btnSaveSettings')?.addEventListener('click', saveSettings);
    document.getElementById('btnResetData')?.addEventListener('click', () => {
      if (confirm('Reset all demo data? This cannot be undone.')) {
        QMS.resetDemoData();
        toast('Demo data reset', 'warning');
        showPage(currentPage);
      }
    });

    document.getElementById('btnGenerateReport')?.addEventListener('click', () => Reports.generate());
    document.getElementById('btnPrintReport')?.addEventListener('click', () => Reports.printReport());
    document.getElementById('btnExportQuizCSV')?.addEventListener('click', () => Reports.exportCSV('quiz'));
    document.getElementById('btnExportPartCSV')?.addEventListener('click', () => Reports.exportCSV('participant'));
    document.getElementById('btnExportCatCSV')?.addEventListener('click', () => Reports.exportCSV('category'));
    document.getElementById('btnExportResultsCSV')?.addEventListener('click', () => Reports.exportCSV('results'));
    document.getElementById('btnExportLeaderCSV')?.addEventListener('click', () => Reports.exportCSV('leaderboard'));
    document.getElementById('btnExportQuestionCSV')?.addEventListener('click', () => Reports.exportCSV('questions'));
  }

  function init() {
    QMS.seedIfNeeded();
    if (!requireAuth()) return;
    applySettingsUI();
    updateClock();
    setInterval(updateClock, 1000);
    bindEvents();
    buildNotifications();
    const page = (location.hash || '#dashboard').replace('#', '') || 'dashboard';
    showPage(page);
    window.addEventListener('hashchange', () => {
      const p = (location.hash || '#dashboard').replace('#', '') || 'dashboard';
      if (p !== currentPage) showPage(p);
    });
  }

  return { init, toast, showPage, leaderboardRows, applySettingsUI };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.app === 'admin') App.init();
});
