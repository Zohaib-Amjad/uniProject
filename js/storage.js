/**
 * Quiz Management System — LocalStorage Layer & Sample Data
 * Exposes window.Storage and window.QMS (Storage, Utils, Collections, Auth)
 */

(function () {
  'use strict';

  const KEYS = {
    quizzes: 'qms_quizzes',
    questions: 'qms_questions',
    categories: 'qms_categories',
    participants: 'qms_participants',
    attempts: 'qms_attempts',
    results: 'qms_attempts', // Alias for attempts
    settings: 'qms_settings',
    notifications: 'qms_notifications',
    auth: 'qms_auth',
    theme: 'qms_theme',
    version: 'qms_data_version',
    users: 'qms_users',
    session: 'qms_session_v3',
    seeded: 'qms_seeded_v3',
    empty: 'qms_empty_v1',
    loginAttempts: 'qms_login_attempts'
  };

  const DATA_VERSION = '1.0.0';

  /* ---------- Safe LocalStorage Read/Write ---------- */
  function safeRead(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[QMS Storage] Corrupted data for key "${key}". Returning fallback.`, err);
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[QMS Storage] Failed writing to LocalStorage key "${key}":`, err);
      return false;
    }
  }

  function resolveKey(collectionName) {
    if (!collectionName) return '';
    const norm = String(collectionName).toLowerCase().replace(/^qms_/, '');
    if (norm === 'results' || norm === 'attempts') return KEYS.attempts;
    if (KEYS[norm]) return KEYS[norm];
    return `qms_${norm}`;
  }

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function nextId(collectionName, prefix) {
    const list = getAll(collectionName);
    const pfx = prefix || (
      collectionName.includes('quiz') ? 'QZ-' :
      collectionName.includes('question') ? 'Q-' :
      collectionName.includes('cat') ? 'CAT-' :
      collectionName.includes('part') ? 'P-' :
      collectionName.includes('attempt') || collectionName.includes('result') ? 'R-' : 'ID-'
    );
    let maxNum = 0;
    list.forEach((item) => {
      const idStr = String(item.id || '');
      const match = idStr.match(/\d+$/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `${pfx}${String(nextNum).padStart(3, '0')}`;
  }

  /* ---------- Generic CRUD per Collection ---------- */
  function getAll(collectionName) {
    const k = resolveKey(collectionName);
    const data = safeRead(k, null);
    if (!data) return [];
    return Array.isArray(data) ? data : [];
  }

  function getById(collectionName, id) {
    if (!id) return null;
    const list = getAll(collectionName);
    const target = String(id).toLowerCase();
    return list.find((item) => {
      if (String(item.id).toLowerCase() === target) return true;
      if (item.altId && String(item.altId).toLowerCase() === target) return true;
      // Also match legacy IDs e.g. q1 vs Q-001 or quiz_html vs QZ-001
      const numMatch = target.match(/\d+$/);
      const itemNumMatch = String(item.id).match(/\d+$/);
      if (numMatch && itemNumMatch && parseInt(numMatch[0], 10) === parseInt(itemNumMatch[0], 10)) {
        if (target.startsWith('q') && String(item.id).startsWith('Q')) return true;
        if (target.startsWith('p') && String(item.id).startsWith('P')) return true;
        if (target.startsWith('r') && String(item.id).startsWith('R')) return true;
      }
      return false;
    }) || null;
  }

  function create(collectionName, item) {
    const k = resolveKey(collectionName);
    const list = getAll(collectionName);
    const newId = item.id || nextId(collectionName);
    const createdDate = item.createdDate || item.createdAt || new Date().toISOString().slice(0, 10);
    const record = { ...item, id: newId, createdDate, createdAt: createdDate };
    list.push(record);
    safeWrite(k, list);
    // Keep qms_results in sync if attempts is modified
    if (k === KEYS.attempts) safeWrite('qms_results', list);
    return record;
  }

  function update(collectionName, id, changes) {
    const k = resolveKey(collectionName);
    const list = getAll(collectionName);
    const target = String(id).toLowerCase();
    const idx = list.findIndex((item) => String(item.id).toLowerCase() === target || (item.altId && String(item.altId).toLowerCase() === target));
    if (idx < 0) return null;
    list[idx] = { ...list[idx], ...changes, id: list[idx].id };
    safeWrite(k, list);
    if (k === KEYS.attempts) safeWrite('qms_results', list);
    return list[idx];
  }

  function remove(collectionName, id) {
    const k = resolveKey(collectionName);
    const list = getAll(collectionName);
    const target = String(id).toLowerCase();
    const filtered = list.filter((item) => String(item.id).toLowerCase() !== target && (!item.altId || String(item.altId).toLowerCase() !== target));
    safeWrite(k, filtered);
    if (k === KEYS.attempts) safeWrite('qms_results', filtered);

    // Cascading cleanups
    if (k === KEYS.questions) {
      const qzList = getAll('quizzes').map((quiz) => {
        const questionIds = (quiz.questionIds || []).filter((qid) => String(qid).toLowerCase() !== target);
        return { ...quiz, questionIds, numberOfQuestions: questionIds.length, questionCount: questionIds.length };
      });
      safeWrite(KEYS.quizzes, qzList);
    }
    if (k === KEYS.categories) {
      const qs = getAll('questions').map((q) => String(q.categoryId).toLowerCase() === target ? { ...q, categoryId: '' } : q);
      safeWrite(KEYS.questions, qs);
      const qz = getAll('quizzes').map((q) => String(q.categoryId).toLowerCase() === target ? { ...q, categoryId: '' } : q);
      safeWrite(KEYS.quizzes, qz);
    }
    if (k === KEYS.quizzes) {
      const attempts = getAll('attempts').filter((a) => String(a.quizId).toLowerCase() !== target);
      safeWrite(KEYS.attempts, attempts);
      safeWrite('qms_results', attempts);
    }
    if (k === KEYS.participants) {
      const attempts = getAll('attempts').filter((a) => String(a.participantId).toLowerCase() !== target);
      safeWrite(KEYS.attempts, attempts);
      safeWrite('qms_results', attempts);
    }
    return true;
  }

  /* ---------- Query Helpers ---------- */
  function search(items, term, fields = []) {
    if (!Array.isArray(items)) return [];
    const q = String(term || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      if (fields.length > 0) {
        return fields.some((f) => String(item[f] || '').toLowerCase().includes(q));
      }
      return Object.values(item).some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
    });
  }

  function filter(items, predicate) {
    if (!Array.isArray(items)) return [];
    if (typeof predicate === 'function') {
      return items.filter(predicate);
    }
    if (predicate && typeof predicate === 'object') {
      const entries = Object.entries(predicate);
      return items.filter((item) => {
        return entries.every(([k, v]) => {
          if (v === '' || v === undefined) return true;
          return String(item[k] ?? '').toLowerCase() === String(v).toLowerCase();
        });
      });
    }
    return items;
  }

  function sort(items, field, direction = 'asc') {
    if (!Array.isArray(items)) return [];
    if (!field) return items;
    const dir = String(direction).toLowerCase() === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      let va = a[field];
      let vb = b[field];
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va > vb ? 1 : -1) * dir;
    });
  }

  function paginate(items, page = 1, perPage = 10) {
    const list = Array.isArray(items) ? items : [];
    const p = Math.max(1, parseInt(page, 10) || 1);
    const pp = Math.max(1, parseInt(perPage, 10) || 10);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pp));
    const start = (p - 1) * pp;
    const paginatedItems = list.slice(start, start + pp);
    return {
      items: paginatedItems,
      total,
      page: p,
      perPage: pp,
      totalPages,
      hasNext: p < totalPages,
      hasPrev: p > 1
    };
  }

  /* ---------- Aggregation Helpers ---------- */
  function averageScore(quizId = null) {
    let attempts = getAll('attempts');
    if (quizId) attempts = attempts.filter((a) => a.quizId === quizId || a.quizId === getById('quizzes', quizId)?.id);
    if (!attempts.length) return 0;
    const sum = attempts.reduce((acc, a) => acc + (Number(a.percentage) || 0), 0);
    return Math.round((sum / attempts.length) * 10) / 10;
  }

  function passRate(quizId = null) {
    let attempts = getAll('attempts');
    if (quizId) attempts = attempts.filter((a) => a.quizId === quizId || a.quizId === getById('quizzes', quizId)?.id);
    if (!attempts.length) return 0;
    const passed = attempts.filter((a) => a.status === 'Passed').length;
    return Math.round((passed / attempts.length) * 1000) / 10;
  }

  function attemptsPerPeriod(period = 'day') {
    const attempts = getAll('attempts');
    const map = {};
    attempts.forEach((a) => {
      const dt = new Date(a.date || a.createdAt || Date.now());
      let key = '';
      if (period === 'month') {
        key = dt.toISOString().slice(0, 7); // YYYY-MM
      } else if (period === 'week') {
        const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
        key = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      } else {
        key = dt.toISOString().slice(0, 10); // YYYY-MM-DD
      }
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }

  function getCategoryStats() {
    const categories = getAll('categories');
    const quizzes = getAll('quizzes');
    const questions = getAll('questions');
    const attempts = getAll('attempts');

    return categories.map((cat) => {
      const catQuizzes = quizzes.filter((q) => q.categoryId === cat.id || q.categoryId === cat.altId);
      const catQuestions = questions.filter((q) => q.categoryId === cat.id || q.categoryId === cat.altId);
      const quizIds = new Set(catQuizzes.map((q) => q.id).concat(catQuizzes.map((q) => q.altId).filter(Boolean)));
      const catAttempts = attempts.filter((a) => quizIds.has(a.quizId));
      const passedCount = catAttempts.filter((a) => a.status === 'Passed').length;
      const avgScore = catAttempts.length ? Math.round(catAttempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / catAttempts.length) : 0;
      const passRate = catAttempts.length ? Math.round((passedCount / catAttempts.length) * 100) : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        quizCount: catQuizzes.length,
        questionCount: catQuestions.length,
        attemptCount: catAttempts.length,
        averageScore: avgScore,
        passRate
      };
    });
  }

  function getQuizStats(quizId) {
    const quiz = getById('quizzes', quizId);
    if (!quiz) return null;
    const attempts = getAll('attempts').filter((a) => a.quizId === quiz.id || a.quizId === quiz.altId);
    const passed = attempts.filter((a) => a.status === 'Passed').length;
    const failed = attempts.length - passed;
    const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / attempts.length) : 0;
    const avgTime = attempts.length ? Math.round(attempts.reduce((s, a) => s + (Number(a.timeTaken) || 0), 0) / attempts.length) : 0;

    return {
      quizId: quiz.id,
      title: quiz.title,
      totalAttempts: attempts.length,
      passed,
      failed,
      passRate: attempts.length ? Math.round((passed / attempts.length) * 100) : 0,
      averageScore: avgScore,
      averageTimeTaken: avgTime
    };
  }

  function getParticipantStats(participantId) {
    const part = getById('participants', participantId);
    if (!part) return null;
    const attempts = getAll('attempts').filter((a) => a.participantId === part.id || a.participantId === part.altId);
    const completed = attempts.length;
    const passed = attempts.filter((a) => a.status === 'Passed').length;
    const avgScore = attempts.length ? Math.round(attempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / attempts.length) : 0;
    const lastAttempt = attempts.length ? [...attempts].sort((a, b) => new Date(b.date) - new Date(a.date))[0] : null;

    return {
      participantId: part.id,
      name: part.name,
      email: part.email,
      totalQuizzes: completed,
      completed,
      passed,
      failed: completed - passed,
      averageScore: avgScore,
      lastAttemptDate: lastAttempt ? lastAttempt.date : null
    };
  }

  function getQuestionAnalysis(quizId = null) {
    const questions = quizId ? (getById('quizzes', quizId)?.questionIds || []).map((qid) => getById('questions', qid)).filter(Boolean) : getAll('questions');
    const attempts = getAll('attempts');

    return questions.map((q) => {
      let totalAnswered = 0;
      let correctCount = 0;
      let incorrectCount = 0;

      attempts.forEach((att) => {
        if (!att.answers) return;
        const ans = Array.isArray(att.answers)
          ? att.answers.find((a) => a.questionId === q.id || a.questionId === q.altId)
          : att.answers[q.id] !== undefined ? { selected: att.answers[q.id], isCorrect: isAnswerCorrect(q, att.answers[q.id]) } : null;

        if (ans && ans.selected !== null && ans.selected !== undefined && ans.selected !== '') {
          totalAnswered++;
          if (ans.isCorrect || isAnswerCorrect(q, ans.selected)) correctCount++;
          else incorrectCount++;
        }
      });

      const accuracy = totalAnswered ? Math.round((correctCount / totalAnswered) * 100) : 0;
      return {
        questionId: q.id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        totalAnswered,
        correctCount,
        incorrectCount,
        accuracyRate: accuracy
      };
    });
  }

  function getLeaderboard(period = 'all', quizId = null, categoryId = null) {
    let attempts = getAll('attempts');
    if (quizId) attempts = attempts.filter((a) => a.quizId === quizId || a.quizId === getById('quizzes', quizId)?.id);
    if (categoryId) {
      const qzIds = new Set(getAll('quizzes').filter((q) => q.categoryId === categoryId || q.categoryId === getById('categories', categoryId)?.id).map((q) => q.id));
      attempts = attempts.filter((a) => qzIds.has(a.quizId));
    }
    if (period === 'monthly' || period === 'month') {
      const monthStart = new Date(Date.now() - 30 * 86400000);
      attempts = attempts.filter((a) => new Date(a.date) >= monthStart);
    } else if (period === 'weekly' || period === 'week') {
      const weekStart = new Date(Date.now() - 7 * 86400000);
      attempts = attempts.filter((a) => new Date(a.date) >= weekStart);
    }

    const map = {};
    attempts.forEach((a) => {
      const pid = a.participantId;
      if (!map[pid]) {
        map[pid] = {
          participantId: pid,
          participantName: participantName(pid),
          totalAttempts: 0,
          highestScore: 0,
          totalScore: 0,
          totalPoints: 0,
          points: 0,
          bestTime: 999999,
          passedCount: 0
        };
      }
      map[pid].totalAttempts++;
      const pct = Number(a.percentage) || 0;
      if (pct > map[pid].highestScore) map[pid].highestScore = pct;
      map[pid].totalScore += pct;
      const pts = Number(a.obtainedMarks ?? a.score) || 0;
      map[pid].totalPoints += pts;
      map[pid].points += pts;
      if (a.timeTaken && a.timeTaken < map[pid].bestTime) map[pid].bestTime = a.timeTaken;
      if (a.status === 'Passed') map[pid].passedCount++;
    });

    const rows = Object.values(map).map((entry) => ({
      ...entry,
      averageScore: Math.round(entry.totalScore / entry.totalAttempts),
      bestTimeFormatted: entry.bestTime < 999999 ? `${Math.floor(entry.bestTime / 60)}m ${entry.bestTime % 60}s` : '—'
    }));

    rows.sort((a, b) => b.totalPoints - a.totalPoints || b.highestScore - a.highestScore || b.averageScore - a.averageScore || a.bestTime - b.bestTime);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  /* ---------- Default Settings ---------- */
  function defaultSettings() {
    return {
      systemName: 'QuizPro Admin',
      adminName: 'System Admin',
      email: 'admin@quizpro.local',
      defaultQuizDuration: 30,
      defaultDuration: 30,
      defaultPassingPercentage: 60,
      defaultPassing: 60,
      enableTimer: true,
      randomQuestions: false,
      randomAnswers: false,
      allowRetakes: true,
      showAnswers: true,
      theme: 'light',
      compactSidebar: false,
      fontSize: 'medium'
    };
  }

  function getSettings() {
    return { ...defaultSettings(), ...safeRead(KEYS.settings, {}) };
  }

  function saveSettings(patch) {
    const cur = getSettings();
    const next = { ...cur, ...patch };
    if (patch.defaultDuration !== undefined && patch.defaultQuizDuration === undefined) {
      next.defaultQuizDuration = patch.defaultDuration;
    } else if (patch.defaultQuizDuration !== undefined && patch.defaultDuration === undefined) {
      next.defaultDuration = patch.defaultQuizDuration;
    }
    if (patch.defaultPassing !== undefined && patch.defaultPassingPercentage === undefined) {
      next.defaultPassingPercentage = patch.defaultPassing;
    } else if (patch.defaultPassingPercentage !== undefined && patch.defaultPassing === undefined) {
      next.defaultPassing = patch.defaultPassingPercentage;
    }
    safeWrite(KEYS.settings, next);
    if (patch.theme) safeWrite(KEYS.theme, patch.theme);
    return next;
  }

  /* ---------- Authentication & Security Simulation ---------- */
  function hashPassword(password) {
    const s = `QMS::demo::${String(password)}`;
    let h1 = 2166136261;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i);
      h1 = Math.imul(h1, 16777619);
      h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x01000193);
    }
    const a = (h1 >>> 0).toString(16).padStart(8, '0');
    const b = (h2 >>> 0).toString(16).padStart(8, '0');
    const c = (Math.imul(h1, h2) >>> 0).toString(16).padStart(8, '0');
    const d = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
    return `${a}${b}${c}${d}`;
  }

  function clearSessionStores() {
    localStorage.removeItem(KEYS.session);
    sessionStorage.removeItem(KEYS.session);
    localStorage.removeItem(KEYS.auth);
    sessionStorage.removeItem(KEYS.auth);
  }

  function getSession() {
    let session = null;
    try {
      const raw = sessionStorage.getItem(KEYS.session) || localStorage.getItem(KEYS.session);
      session = raw ? JSON.parse(raw) : null;
    } catch {
      session = null;
    }
    if (!session?.loggedIn || !session?.token || !session?.email) return null;
    if (session.expiresAt && Date.now() > Number(session.expiresAt)) {
      clearSessionStores();
      return null;
    }
    return session;
  }

  function setSession(session) {
    clearSessionStores();
    if (!session) return;
    const payload = JSON.stringify(session);
    if (session.remember) {
      localStorage.setItem(KEYS.session, payload);
      localStorage.setItem(KEYS.auth, 'true');
    } else {
      sessionStorage.setItem(KEYS.session, payload);
      sessionStorage.setItem(KEYS.auth, 'true');
    }
  }

  function isAuthenticated() {
    return !!getSession();
  }

  function getLoginAttempts() {
    return safeRead(KEYS.loginAttempts, { count: 0, lockedUntil: 0 });
  }

  function saveLoginAttempts(data) {
    safeWrite(KEYS.loginAttempts, data);
  }

  function login(email, password, remember = false) {
    const attempts = getLoginAttempts();
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
      const secs = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
      return { ok: false, error: `Too many failed attempts. Try again in ${secs}s.` };
    }

    const normalized = String(email || '').trim().toLowerCase();
    const pass = String(password || '');
    if (!normalized || !pass) {
      return { ok: false, error: 'Email and password are required.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    let users = getUsers();
    if (!users || !users.length) {
      users = [
        { id: 'u_admin', fullName: 'System Admin', email: 'admin@quizpro.local', password: 'admin123', passwordHash: hashPassword('admin123') },
        { id: 'u_admin2', fullName: 'QuizMaster Admin', email: 'admin@quizmaster.com', password: 'admin123', passwordHash: hashPassword('admin123') }
      ];
      saveUsers(users);
    }
    const hash = hashPassword(pass);
    const idx = users.findIndex((u) => String(u.email || '').toLowerCase() === normalized);
    const user = idx >= 0 ? users[idx] : null;
    const valid =
      user &&
      ((user.passwordHash && user.passwordHash === hash) ||
        (user.password && user.password === pass));

    if (!valid) {
      const count = (attempts.count || 0) + 1;
      const lockedUntil = count >= 5 ? Date.now() + 30000 : 0;
      saveLoginAttempts({ count: lockedUntil ? 0 : count, lockedUntil });
      return { ok: false, error: 'Invalid email or password.' };
    }

    saveLoginAttempts({ count: 0, lockedUntil: 0 });
    const session = {
      loggedIn: true,
      email: user.email,
      fullName: user.fullName,
      token: uid('tok'),
      remember: !!remember,
      expiresAt: Date.now() + (remember ? 7 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000)
    };
    setSession(session);
    return { ok: true, session };
  }

  function logout() {
    clearSessionStores();
    try {
      sessionStorage.removeItem('qms_active_attempt');
      sessionStorage.removeItem('qms_last_result');
    } catch (_) {}
  }

  function registerUser({ fullName, email, phone, password }) {
    const users = getUsers();
    const normalized = String(email || '').trim().toLowerCase();
    if (users.some((u) => String(u.email || '').toLowerCase() === normalized)) {
      return { ok: false, error: 'Email already registered.' };
    }
    const row = {
      id: uid('usr'),
      fullName: String(fullName || '').trim(),
      email: normalized,
      phone: String(phone || '').trim(),
      password: String(password || ''),
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };
    users.push(row);
    saveUsers(users);
    return { ok: true, user: { id: row.id, fullName: row.fullName, email: row.email } };
  }

  function getUsers() {
    return safeRead(KEYS.users, []);
  }

  function saveUsers(users) {
    safeWrite(KEYS.users, users);
  }

  function requireAuthRedirect(loginPage = 'login.html') {
    if (!isAuthenticated()) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash);
      location.replace(`${loginPage}${loginPage.includes('?') ? '&' : '?'}next=${next}`);
      return false;
    }
    return true;
  }

  /* ---------- String and Grading Utilities ---------- */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeAnswer(v) {
    return String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function normalizeQuestionType(type) {
    const t = String(type || '').toLowerCase().replace(/[-_ ]/g, '');
    if (t === 'multiplechoice' || t === 'mcq') return 'mcq';
    if (t === 'truefalse' || t === 'tf') return 'truefalse';
    if (t === 'shortanswer' || t === 'short') return 'short';
    if (t === 'fillblank' || t === 'fillintheblank' || t === 'blank') return 'fillblank';
    return type || 'mcq';
  }

  function isAnswerCorrect(question, selected) {
    if (selected === null || selected === undefined || selected === '') return false;
    const sel = normalizeAnswer(selected);
    const correct = normalizeAnswer(question.correctAnswer);
    const qType = normalizeQuestionType(question.type);
    if (qType === 'mcq' || qType === 'truefalse') {
      const optionVal = (question.options || {})[question.correctAnswer];
      return sel === correct || (optionVal && sel === normalizeAnswer(optionVal));
    }
    if (question.acceptedAlternatives) {
      const alts = Array.isArray(question.acceptedAlternatives)
        ? question.acceptedAlternatives
        : String(question.acceptedAlternatives).split(',').map((s) => s.trim());
      if (alts.some((alt) => normalizeAnswer(alt) === sel)) return true;
    }
    return sel === correct;
  }

  function gradeAttempt(arg1, maybeQuestions, maybeAnswers, maybeTimeTaken) {
    let quiz, questionList, answers, timeTaken;
    if (arg1 && typeof arg1 === 'object' && ('questionList' in arg1 || 'answers' in arg1)) {
      ({ quiz, questionList, answers, timeTaken } = arg1);
    } else {
      quiz = arg1;
      questionList = maybeQuestions;
      answers = maybeAnswers;
      timeTaken = maybeTimeTaken;
    }
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    let obtained = 0;
    let totalMarks = 0;
    const breakdown = [];

    (questionList || []).forEach((q) => {
      const qMarks = Number(q.marks) || 1;
      totalMarks += qMarks;
      const selected = Array.isArray(answers)
        ? (answers.find((a) => a.questionId === q.id || a.questionId === q.altId)?.selected)
        : answers[q.id];
      const empty = selected === null || selected === undefined || String(selected).trim() === '';
      let result = 'unanswered';
      let isCorrect = false;

      if (empty) {
        unanswered += 1;
      } else if (isAnswerCorrect(q, selected)) {
        correct += 1;
        obtained += qMarks;
        result = 'correct';
        isCorrect = true;
      } else {
        incorrect += 1;
        const isNeg = Boolean(quiz && (quiz.negativeMarking || quiz.options?.negativeMarking));
        if (isNeg) {
          const penaltyFraction = Number(quiz.negativeRate ?? quiz.negativeFraction ?? 0.25);
          const penalty = Math.max(0, qMarks * penaltyFraction);
          obtained = Math.max(0, obtained - penalty);
        }
        result = 'incorrect';
      }

      breakdown.push({
        questionId: q.id,
        question: q.text,
        selectedAnswer: empty ? '—' : String(selected),
        correctAnswer: (q.options && q.options[q.correctAnswer]) ? `${q.correctAnswer} — ${q.options[q.correctAnswer]}` : String(q.correctAnswer),
        isCorrect,
        result
      });
    });

    const percentage = totalMarks ? Math.round((obtained / totalMarks) * 100) : 0;
    const passThreshold = Number(quiz?.passingPercentage) || 60;
    const passed = percentage >= passThreshold;

    return {
      totalQuestions: (questionList || []).length,
      correct,
      incorrect,
      unanswered,
      obtainedMarks: Math.round(obtained * 100) / 100,
      totalMarks,
      percentage,
      status: passed ? 'Passed' : 'Failed',
      timeTaken: Number(timeTaken) || 0,
      breakdown,
      answers: breakdown
    };
  }

  function exportCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function categoryName(id) {
    return (getById('categories', id) || {}).name || '—';
  }

  function participantName(id) {
    return (getById('participants', id) || {}).name || '—';
  }

  function quizTitle(id) {
    return (getById('quizzes', id) || {}).title || '—';
  }

  /* ---------- Sample Seed Data (6 Categories, 9 Quizzes, 45 Questions, 10 Participants, 16 Attempts) ---------- */
  function getSeedCategories() {
    return [
      { id: 'CAT-001', altId: 'cat_prog', name: 'Programming', description: 'Coding languages, algorithms, data structures and web development', status: 'Active', createdDate: '2026-01-10' },
      { id: 'CAT-002', altId: 'cat_math', name: 'Mathematics', description: 'Algebra, arithmetic, calculus and quantitative problem solving', status: 'Active', createdDate: '2026-01-11' },
      { id: 'CAT-003', altId: 'cat_sci', name: 'Science', description: 'Physics, chemistry, biology and environmental science principles', status: 'Active', createdDate: '2026-01-12' },
      { id: 'CAT-004', altId: 'cat_eng', name: 'English', description: 'Grammar mechanics, vocabulary, sentence structure and comprehension', status: 'Active', createdDate: '2026-01-13' },
      { id: 'CAT-005', altId: 'cat_gk', name: 'General Knowledge', description: 'World geography, international affairs, history and global facts', status: 'Active', createdDate: '2026-01-14' },
      { id: 'CAT-006', altId: 'cat_cs', name: 'Computer Science', description: 'Databases, network protocols, operating systems and computer architecture', status: 'Active', createdDate: '2026-01-15' }
    ];
  }

  function getSeedQuestions() {
    return [
      // Programming - HTML & CSS (Q-001 to Q-005)
      { id: 'Q-001', altId: 'q1', text: 'Which language provides the semantic structural skeleton of a webpage?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'HTML (HyperText Markup Language) defines standard page structure.', status: 'Active', options: { A: 'CSS', B: 'HTML', C: 'JavaScript', D: 'PHP' }, correctAnswer: 'B', createdDate: '2026-01-15' },
      { id: 'Q-002', altId: 'q2', text: 'Which CSS property is used to specify the text color of an element?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'The color property defines foreground text color in CSS.', status: 'Active', options: { A: 'font-color', B: 'text-style', C: 'color', D: 'background-color' }, correctAnswer: 'C', createdDate: '2026-01-15' },
      { id: 'Q-003', altId: 'q3', text: 'CSS stands for Cascading Style Sheets.', type: 'true-false', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'CSS stands for Cascading Style Sheets.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-15' },
      { id: 'Q-004', altId: 'q4', text: 'In HTML, the top-level primary heading tag is _____.', type: 'fill-blank', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'h1 is the highest rank heading element.', status: 'Active', options: {}, correctAnswer: 'h1', createdDate: '2026-01-15' },
      { id: 'Q-005', altId: 'q5', text: 'Name the four primary components of the CSS box model.', type: 'short-answer', categoryId: 'CAT-001', difficulty: 'Medium', marks: 2, explanation: 'The CSS box model consists of content, padding, border, and margin.', status: 'Active', options: {}, correctAnswer: 'content padding border margin', createdDate: '2026-01-15' },

      // Programming - JavaScript (Q-006 to Q-010)
      { id: 'Q-006', altId: 'q6', text: 'Which ES6 keyword declares a mutable, block-scoped local variable?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'let declares block-scoped variables that can be reassigned.', status: 'Active', options: { A: 'var', B: 'let', C: 'const', D: 'global' }, correctAnswer: 'B', createdDate: '2026-01-16' },
      { id: 'Q-007', altId: 'q7', text: 'In JavaScript, evaluating typeof null returns "object".', type: 'true-false', categoryId: 'CAT-001', difficulty: 'Medium', marks: 1, explanation: 'This is a well-known historical bug in JavaScript preserved for backward compatibility.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-16' },
      { id: 'Q-008', altId: 'q8', text: 'The built-in Array method that returns a new array with transformed elements is _____.', type: 'fill-blank', categoryId: 'CAT-001', difficulty: 'Medium', marks: 1, explanation: 'Array.prototype.map() transforms each item.', status: 'Active', options: {}, correctAnswer: 'map', createdDate: '2026-01-16' },
      { id: 'Q-009', altId: 'q9', text: 'What is a closure in JavaScript?', type: 'short-answer', categoryId: 'CAT-001', difficulty: 'Hard', marks: 2, explanation: 'A closure is a function bundled with references to its surrounding lexical environment.', status: 'Active', options: {}, correctAnswer: 'function with lexical scope', createdDate: '2026-01-16' },
      { id: 'Q-010', altId: 'q10', text: 'Which standard method parses a JSON formatted string into a JavaScript object?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'JSON.parse() deserializes JSON strings.', status: 'Active', options: { A: 'JSON.stringify', B: 'JSON.parse', C: 'JSON.decode', D: 'JSON.toObject' }, correctAnswer: 'B', createdDate: '2026-01-16' },

      // Programming - Python (Q-011 to Q-015)
      { id: 'Q-011', altId: 'q11', text: 'Which keyword is used to declare a function in Python?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'def begins a function definition in Python.', status: 'Active', options: { A: 'func', B: 'def', C: 'function', D: 'lambda' }, correctAnswer: 'B', createdDate: '2026-01-18' },
      { id: 'Q-012', altId: 'q12', text: 'Python is a statically typed language at compile time.', type: 'true-false', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'Python is dynamically typed; types are checked at runtime.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'B', createdDate: '2026-01-18' },
      { id: 'Q-013', altId: 'q13', text: 'The Python list method to append an element to the end of a list is _____.', type: 'fill-blank', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'list.append() adds an element to the end.', status: 'Active', options: {}, correctAnswer: 'append', createdDate: '2026-01-18' },
      { id: 'Q-014', altId: 'q14', text: 'What is PEP 8 in Python programming?', type: 'short-answer', categoryId: 'CAT-001', difficulty: 'Medium', marks: 2, explanation: 'PEP 8 is Python official Style Guide for writing clean code.', status: 'Active', options: {}, correctAnswer: 'python style guide', createdDate: '2026-01-18' },
      { id: 'Q-015', altId: 'q15', text: 'Which data structure in Python is immutable and declared with parentheses?', type: 'multiple-choice', categoryId: 'CAT-001', difficulty: 'Easy', marks: 1, explanation: 'Tuples are immutable sequences in Python.', status: 'Active', options: { A: 'List', B: 'Tuple', C: 'Dictionary', D: 'Set' }, correctAnswer: 'B', createdDate: '2026-01-18' },

      // Computer Science - Databases (Q-016 to Q-020)
      { id: 'Q-016', altId: 'q16', text: 'The standard SQL statement used to query and extract data from a table is SELECT.', type: 'true-false', categoryId: 'CAT-006', difficulty: 'Easy', marks: 1, explanation: 'SELECT statements query data from relational tables.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-20' },
      { id: 'Q-017', altId: 'q17', text: 'Which constraint uniquely identifies each record in a database table?', type: 'multiple-choice', categoryId: 'CAT-006', difficulty: 'Easy', marks: 1, explanation: 'A Primary Key constraint enforces unique and non-null row identification.', status: 'Active', options: { A: 'Foreign Key', B: 'Primary Key', C: 'Default', D: 'Check' }, correctAnswer: 'B', createdDate: '2026-01-20' },
      { id: 'Q-018', altId: 'q18', text: 'Relational database normalization minimizes data _____.', type: 'fill-blank', categoryId: 'CAT-006', difficulty: 'Medium', marks: 1, explanation: 'Normalization systematically eliminates data redundancy.', status: 'Active', options: {}, correctAnswer: 'redundancy', createdDate: '2026-01-20' },
      { id: 'Q-019', altId: 'q19', text: 'What does the database acronym ACID stand for?', type: 'short-answer', categoryId: 'CAT-006', difficulty: 'Hard', marks: 2, explanation: 'ACID: Atomicity, Consistency, Isolation, Durability.', status: 'Active', options: {}, correctAnswer: 'atomicity consistency isolation durability', createdDate: '2026-01-20' },
      { id: 'Q-020', altId: 'q20', text: 'Which SQL clause is used to filter records based on group aggregate conditions?', type: 'multiple-choice', categoryId: 'CAT-006', difficulty: 'Medium', marks: 1, explanation: 'HAVING filters aggregated groups, whereas WHERE filters individual rows.', status: 'Active', options: { A: 'WHERE', B: 'HAVING', C: 'GROUP BY', D: 'ORDER BY' }, correctAnswer: 'B', createdDate: '2026-01-20' },

      // Computer Science - Networks & Core CS (Q-021 to Q-025)
      { id: 'Q-021', altId: 'q21', text: 'Which data structure operates strictly on a First-In-First-Out (FIFO) principle?', type: 'multiple-choice', categoryId: 'CAT-006', difficulty: 'Easy', marks: 1, explanation: 'Queues process elements in FIFO order.', status: 'Active', options: { A: 'Stack', B: 'Queue', C: 'Binary Tree', D: 'Heap' }, correctAnswer: 'B', createdDate: '2026-01-22' },
      { id: 'Q-022', altId: 'q22', text: 'HTTP is by default a stateless protocol at the application layer.', type: 'true-false', categoryId: 'CAT-006', difficulty: 'Medium', marks: 1, explanation: 'HTTP does not retain session state between requests without cookies or tokens.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-22' },
      { id: 'Q-023', altId: 'q23', text: 'In computer architecture, CPU stands for Central Processing _____.', type: 'fill-blank', categoryId: 'CAT-006', difficulty: 'Easy', marks: 1, explanation: 'CPU stands for Central Processing Unit.', status: 'Active', options: {}, correctAnswer: 'unit', createdDate: '2026-01-22' },
      { id: 'Q-024', altId: 'q24', text: 'What is the time complexity of searching in a balanced Binary Search Tree?', type: 'short-answer', categoryId: 'CAT-006', difficulty: 'Medium', marks: 2, explanation: 'Search in a balanced BST takes O(log n) time.', status: 'Active', options: {}, correctAnswer: 'O(log n)', createdDate: '2026-01-22' },
      { id: 'Q-025', altId: 'q25', text: 'Which transport layer protocol provides connection-oriented, guaranteed byte-stream delivery?', type: 'multiple-choice', categoryId: 'CAT-006', difficulty: 'Easy', marks: 1, explanation: 'TCP provides reliable, sequenced transmission with handshakes.', status: 'Active', options: { A: 'UDP', B: 'TCP', C: 'ICMP', D: 'IP' }, correctAnswer: 'B', createdDate: '2026-01-22' },

      // Mathematics (Q-026 to Q-030)
      { id: 'Q-026', altId: 'q26', text: 'What is 15% of 200?', type: 'multiple-choice', categoryId: 'CAT-002', difficulty: 'Easy', marks: 1, explanation: '0.15 multiplied by 200 equals 30.', status: 'Active', options: { A: '20', B: '25', C: '30', D: '35' }, correctAnswer: 'C', createdDate: '2026-01-24' },
      { id: 'Q-027', altId: 'q27', text: 'The principal square root of 81 is 9.', type: 'true-false', categoryId: 'CAT-002', difficulty: 'Easy', marks: 1, explanation: '9 squared equals 81.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-24' },
      { id: 'Q-028', altId: 'q28', text: 'The geometric formula for the area of a circle is π multiplied by r to the power of _____.', type: 'fill-blank', categoryId: 'CAT-002', difficulty: 'Easy', marks: 1, explanation: 'Area of a circle is πr².', status: 'Active', options: {}, correctAnswer: '2', createdDate: '2026-01-24' },
      { id: 'Q-029', altId: 'q29', text: 'Solve for x: 3x + 12 = 30. What is x?', type: 'short-answer', categoryId: 'CAT-002', difficulty: 'Easy', marks: 2, explanation: '3x = 18 => x = 6.', status: 'Active', options: {}, correctAnswer: '6', createdDate: '2026-01-24' },
      { id: 'Q-030', altId: 'q30', text: 'Which number is the only even prime number?', type: 'multiple-choice', categoryId: 'CAT-002', difficulty: 'Easy', marks: 1, explanation: '2 is the only even prime number.', status: 'Active', options: { A: '0', B: '1', C: '2', D: '4' }, correctAnswer: 'C', createdDate: '2026-01-24' },

      // General Knowledge (Q-031 to Q-035)
      { id: 'Q-031', altId: 'q31', text: 'The capital city of Japan is Tokyo.', type: 'true-false', categoryId: 'CAT-005', difficulty: 'Easy', marks: 1, explanation: 'Tokyo is the constitutional capital of Japan.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-25' },
      { id: 'Q-032', altId: 'q32', text: 'Which planet in our solar system is commonly known as the Red Planet?', type: 'multiple-choice', categoryId: 'CAT-005', difficulty: 'Easy', marks: 1, explanation: 'Mars appears reddish due to iron oxide on its surface.', status: 'Active', options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, correctAnswer: 'B', createdDate: '2026-01-25' },
      { id: 'Q-033', altId: 'q33', text: 'The largest ocean on Earth by surface area is the _____ Ocean.', type: 'fill-blank', categoryId: 'CAT-005', difficulty: 'Easy', marks: 1, explanation: 'The Pacific Ocean is the largest ocean.', status: 'Active', options: {}, correctAnswer: 'pacific', createdDate: '2026-01-25' },
      { id: 'Q-034', altId: 'q34', text: 'In which continent is the Sahara Desert located?', type: 'short-answer', categoryId: 'CAT-005', difficulty: 'Easy', marks: 2, explanation: 'The Sahara desert spans northern Africa.', status: 'Active', options: {}, correctAnswer: 'africa', createdDate: '2026-01-25' },
      { id: 'Q-035', altId: 'q35', text: 'How many continents are officially recognized on Earth?', type: 'multiple-choice', categoryId: 'CAT-005', difficulty: 'Easy', marks: 1, explanation: 'There are seven traditional continents.', status: 'Active', options: { A: '5', B: '6', C: '7', D: '8' }, correctAnswer: 'C', createdDate: '2026-01-25' },

      // English (Q-036 to Q-040)
      { id: 'Q-036', altId: 'q36', text: 'Which word is the closest synonym to "rapid"?', type: 'multiple-choice', categoryId: 'CAT-004', difficulty: 'Easy', marks: 1, explanation: 'Quick and rapid both denote high speed.', status: 'Active', options: { A: 'Slow', B: 'Quick', C: 'Sluggish', D: 'Quiet' }, correctAnswer: 'B', createdDate: '2026-01-27' },
      { id: 'Q-037', altId: 'q37', text: 'The sentence "The cat sat on the mat" is in the active voice.', type: 'true-false', categoryId: 'CAT-004', difficulty: 'Easy', marks: 1, explanation: 'The subject performs the action directly.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-27' },
      { id: 'Q-038', altId: 'q38', text: 'A word having the opposite meaning of another word is called an _____.', type: 'fill-blank', categoryId: 'CAT-004', difficulty: 'Easy', marks: 1, explanation: 'Antonym is a word of opposite meaning.', status: 'Active', options: {}, correctAnswer: 'antonym', createdDate: '2026-01-27' },
      { id: 'Q-039', altId: 'q39', text: 'Who is the famous English playwright who wrote the tragedy "Hamlet"?', type: 'short-answer', categoryId: 'CAT-004', difficulty: 'Medium', marks: 2, explanation: 'William Shakespeare authored Hamlet around 1600.', status: 'Active', options: {}, correctAnswer: 'william shakespeare', createdDate: '2026-01-27' },
      { id: 'Q-040', altId: 'q40', text: 'Identify the part of speech of the word "silently" in "She walked silently".', type: 'multiple-choice', categoryId: 'CAT-004', difficulty: 'Easy', marks: 1, explanation: 'Silently modifies the verb walked, making it an adverb.', status: 'Active', options: { A: 'Noun', B: 'Adjective', C: 'Adverb', D: 'Pronoun' }, correctAnswer: 'C', createdDate: '2026-01-27' },

      // Science (Q-041 to Q-045)
      { id: 'Q-041', altId: 'q41', text: 'The standard chemical formula for water is H2O.', type: 'true-false', categoryId: 'CAT-003', difficulty: 'Easy', marks: 1, explanation: 'Two hydrogen atoms bonded to one oxygen atom.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A', createdDate: '2026-01-28' },
      { id: 'Q-042', altId: 'q42', text: 'In plants, the primary green pigment essential for photosynthesis is _____.', type: 'fill-blank', categoryId: 'CAT-003', difficulty: 'Medium', marks: 1, explanation: 'Chlorophyll absorbs light energy for photosynthesis.', status: 'Active', options: {}, correctAnswer: 'chlorophyll', createdDate: '2026-01-28' },
      { id: 'Q-043', altId: 'q43', text: 'What is the standard SI unit of force?', type: 'multiple-choice', categoryId: 'CAT-003', difficulty: 'Easy', marks: 1, explanation: 'The newton (N) is the SI unit of force.', status: 'Active', options: { A: 'Joule', B: 'Watt', C: 'Newton', D: 'Pascal' }, correctAnswer: 'C', createdDate: '2026-01-28' },
      { id: 'Q-044', altId: 'q44', text: 'What particle with a negative electric charge orbits the atomic nucleus?', type: 'short-answer', categoryId: 'CAT-003', difficulty: 'Easy', marks: 2, explanation: 'Electrons orbit the nucleus.', status: 'Active', options: {}, correctAnswer: 'electron', createdDate: '2026-01-28' },
      { id: 'Q-045', altId: 'q45', text: 'Which organ in the human body is primarily responsible for pumping oxygenated blood?', type: 'multiple-choice', categoryId: 'CAT-003', difficulty: 'Easy', marks: 1, explanation: 'The heart circulates blood throughout the cardiovascular system.', status: 'Active', options: { A: 'Brain', B: 'Lungs', C: 'Heart', D: 'Liver' }, correctAnswer: 'C', createdDate: '2026-01-28' }
    ].map((q) => ({ ...q, type: normalizeQuestionType(q.type) }));
  }

  function getSeedQuizzes() {
    return [
      {
        id: 'QZ-001',
        altId: 'quiz_html',
        title: 'HTML & CSS Fundamentals',
        description: 'Comprehensive test on semantic webpage markup, CSS box model, and layout styling.',
        categoryId: 'CAT-001',
        subject: 'HTML & CSS',
        difficulty: 'Easy',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 20,
        passingPercentage: 60,
        maxAttempts: 3,
        startDate: '2026-02-01',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Read each question carefully. No negative marking is applied for this test.',
        options: { randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-001', 'Q-002', 'Q-003', 'Q-004', 'Q-005'],
        randomizeQuestions: true,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-01',
        createdAt: '2026-02-01'
      },
      {
        id: 'QZ-002',
        altId: 'quiz_js',
        title: 'JavaScript Essentials',
        description: 'Core concepts in modern ES6 JavaScript, scopes, closures, arrays, and object handling.',
        categoryId: 'CAT-001',
        subject: 'JavaScript',
        difficulty: 'Medium',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 25,
        passingPercentage: 65,
        maxAttempts: 2,
        startDate: '2026-02-05',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Timer enabled. Please make sure to submit your answers before time expires.',
        options: { randomizeQuestions: false, randomizeAnswers: true, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-006', 'Q-007', 'Q-008', 'Q-009', 'Q-010'],
        randomizeQuestions: false,
        randomizeAnswers: true,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-05',
        createdAt: '2026-02-05'
      },
      {
        id: 'QZ-003',
        altId: 'quiz_py',
        title: 'Python Programming Masterclass',
        description: 'Essential Python syntax, functions, dynamic typing, and sequence data types.',
        categoryId: 'CAT-001',
        subject: 'Python',
        difficulty: 'Easy',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 20,
        passingPercentage: 55,
        maxAttempts: 3,
        startDate: '2026-02-08',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Answer all 5 questions. Calculations can be verified mentally.',
        options: { randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-011', 'Q-012', 'Q-013', 'Q-014', 'Q-015'],
        randomizeQuestions: false,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-08',
        createdAt: '2026-02-08'
      },
      {
        id: 'QZ-004',
        altId: 'quiz_db',
        title: 'Database Systems & SQL',
        description: 'Relational database schema design, keys, normalization, and ACID transaction rules.',
        categoryId: 'CAT-006',
        subject: 'Database',
        difficulty: 'Medium',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 30,
        passingPercentage: 60,
        maxAttempts: 2,
        startDate: '2026-02-10',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Focus on precision. Negative marking applies (-0.25 marks per wrong answer).',
        options: { randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: false, displayTimer: true, negativeMarking: true },
        questionIds: ['Q-016', 'Q-017', 'Q-018', 'Q-019', 'Q-020'],
        randomizeQuestions: true,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: false,
        displayTimer: true,
        negativeMarking: true,
        createdDate: '2026-02-10',
        createdAt: '2026-02-10'
      },
      {
        id: 'QZ-005',
        altId: 'quiz_cs',
        title: 'Computer Science Core & Networks',
        description: 'Fundamental data structures, operating systems, and networking transport protocols.',
        categoryId: 'CAT-006',
        subject: 'Computer Science',
        difficulty: 'Hard',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 25,
        passingPercentage: 60,
        maxAttempts: 3,
        startDate: '2026-02-12',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'You can mark questions for review and navigate backward or forward anytime.',
        options: { randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-021', 'Q-022', 'Q-023', 'Q-024', 'Q-025'],
        randomizeQuestions: false,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-12',
        createdAt: '2026-02-12'
      },
      {
        id: 'QZ-006',
        altId: 'quiz_math',
        title: 'Mathematics Practice & Reasoning',
        description: 'Algebraic equations, geometric formulas, percentages, and prime numbers.',
        categoryId: 'CAT-002',
        subject: 'Mathematics',
        difficulty: 'Easy',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 15,
        passingPercentage: 50,
        maxAttempts: 5,
        startDate: '2026-02-15',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Solve simple algebra problems with confidence.',
        options: { randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-026', 'Q-027', 'Q-028', 'Q-029', 'Q-030'],
        randomizeQuestions: false,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-15',
        createdAt: '2026-02-15'
      },
      {
        id: 'QZ-007',
        altId: 'quiz_gk',
        title: 'World General Knowledge & Geography',
        description: 'Global geography, astronomy, capital cities, and international awareness trivia.',
        categoryId: 'CAT-005',
        subject: 'General Knowledge',
        difficulty: 'Easy',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 15,
        passingPercentage: 60,
        maxAttempts: 3,
        startDate: '2026-02-18',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Quick general trivia. Keep an eye on the ticking timer.',
        options: { randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-031', 'Q-032', 'Q-033', 'Q-034', 'Q-035'],
        randomizeQuestions: true,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-18',
        createdAt: '2026-02-18'
      },
      {
        id: 'QZ-008',
        altId: 'quiz_eng',
        title: 'Professional English Grammar & Vocab',
        description: 'Sentence voice, synonyms, antonyms, parts of speech, and literature facts.',
        categoryId: 'CAT-004',
        subject: 'English',
        difficulty: 'Medium',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 20,
        passingPercentage: 60,
        maxAttempts: 2,
        startDate: '2026-02-20',
        endDate: '2026-12-31',
        status: 'Draft',
        instructions: 'Draft quiz currently awaiting department moderation before going live.',
        options: { randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: false, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-036', 'Q-037', 'Q-038', 'Q-039', 'Q-040'],
        randomizeQuestions: false,
        randomizeAnswers: false,
        showCorrectAnswers: false,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-20',
        createdAt: '2026-02-20'
      },
      {
        id: 'QZ-009',
        altId: 'quiz_sci',
        title: 'General Science & Physics Concepts',
        description: 'Fundamental units of force, atomic structure, photosynthesis, and human anatomy.',
        categoryId: 'CAT-003',
        subject: 'Science',
        difficulty: 'Easy',
        numberOfQuestions: 5,
        questionCount: 5,
        duration: 15,
        passingPercentage: 60,
        maxAttempts: 3,
        startDate: '2026-02-22',
        endDate: '2026-12-31',
        status: 'Active',
        instructions: 'Test your foundational understanding of general physical and biological science.',
        options: { randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false },
        questionIds: ['Q-041', 'Q-042', 'Q-043', 'Q-044', 'Q-045'],
        randomizeQuestions: false,
        randomizeAnswers: false,
        showCorrectAnswers: true,
        allowRetake: true,
        displayTimer: true,
        negativeMarking: false,
        createdDate: '2026-02-22',
        createdAt: '2026-02-22'
      }
    ];
  }

  function getSeedParticipants() {
    return [
      { id: 'P-001', altId: 'p1', name: 'Ayesha Khan', email: 'ayesha.khan@email.com', phone: '0300-1111111', status: 'Active', registrationDate: '2026-01-20', registeredAt: '2026-01-20' },
      { id: 'P-002', altId: 'p2', name: 'Bilal Ahmed', email: 'bilal.ahmed@email.com', phone: '0301-2222222', status: 'Active', registrationDate: '2026-01-21', registeredAt: '2026-01-21' },
      { id: 'P-003', altId: 'p3', name: 'Sara Malik', email: 'sara.malik@email.com', phone: '0302-3333333', status: 'Active', registrationDate: '2026-01-22', registeredAt: '2026-01-22' },
      { id: 'P-004', altId: 'p4', name: 'Hassan Raza', email: 'hassan.raza@email.com', phone: '0303-4444444', status: 'Active', registrationDate: '2026-01-23', registeredAt: '2026-01-23' },
      { id: 'P-005', altId: 'p5', name: 'Fatima Noor', email: 'fatima.noor@email.com', phone: '0304-5555555', status: 'Active', registrationDate: '2026-01-24', registeredAt: '2026-01-24' },
      { id: 'P-006', altId: 'p6', name: 'Usman Ali', email: 'usman.ali@email.com', phone: '0305-6666666', status: 'Inactive', registrationDate: '2026-01-25', registeredAt: '2026-01-25' },
      { id: 'P-007', altId: 'p7', name: 'Zainab Iqbal', email: 'zainab.iqbal@email.com', phone: '0306-7777777', status: 'Active', registrationDate: '2026-01-26', registeredAt: '2026-01-26' },
      { id: 'P-008', altId: 'p8', name: 'Omar Farooq', email: 'omar.farooq@email.com', phone: '0307-8888888', status: 'Active', registrationDate: '2026-01-27', registeredAt: '2026-01-27' },
      { id: 'P-009', altId: 'p9', name: 'Maryam Siddiqui', email: 'maryam.s@email.com', phone: '0308-9999999', status: 'Active', registrationDate: '2026-01-28', registeredAt: '2026-01-28' },
      { id: 'P-010', altId: 'p10', name: 'Ali Haider', email: 'ali.haider@email.com', phone: '0309-1010101', status: 'Active', registrationDate: '2026-01-29', registeredAt: '2026-01-29' }
    ];
  }

  function getSeedAttempts() {
    return [
      {
        id: 'R-001',
        altId: 'r1',
        participantId: 'P-001',
        quizId: 'QZ-001',
        date: '2026-08-20T10:00:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 720,
        answers: [
          { questionId: 'Q-001', selected: 'B', isCorrect: true },
          { questionId: 'Q-002', selected: 'C', isCorrect: true },
          { questionId: 'Q-003', selected: 'A', isCorrect: true },
          { questionId: 'Q-004', selected: 'h1', isCorrect: true },
          { questionId: 'Q-005', selected: 'padding border', isCorrect: false }
        ]
      },
      {
        id: 'R-002',
        altId: 'r2',
        participantId: 'P-002',
        quizId: 'QZ-001',
        date: '2026-08-22T11:30:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 4,
        score: 4,
        percentage: 67,
        status: 'Passed',
        timeTaken: 800,
        answers: [
          { questionId: 'Q-001', selected: 'B', isCorrect: true },
          { questionId: 'Q-002', selected: 'A', isCorrect: false },
          { questionId: 'Q-003', selected: 'A', isCorrect: true },
          { questionId: 'Q-004', selected: 'h1', isCorrect: true },
          { questionId: 'Q-005', selected: 'content padding border margin', isCorrect: true }
        ]
      },
      {
        id: 'R-003',
        altId: 'r3',
        participantId: 'P-003',
        quizId: 'QZ-002',
        date: '2026-08-26T09:15:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 900,
        answers: [
          { questionId: 'Q-006', selected: 'B', isCorrect: true },
          { questionId: 'Q-007', selected: 'A', isCorrect: true },
          { questionId: 'Q-008', selected: 'map', isCorrect: true },
          { questionId: 'Q-009', selected: 'wrong answer', isCorrect: false },
          { questionId: 'Q-010', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-004',
        altId: 'r4',
        participantId: 'P-004',
        quizId: 'QZ-002',
        date: '2026-08-29T14:40:00',
        totalQuestions: 5,
        correct: 3,
        incorrect: 2,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 3,
        score: 3,
        percentage: 50,
        status: 'Failed',
        timeTaken: 1100,
        answers: [
          { questionId: 'Q-006', selected: 'A', isCorrect: false },
          { questionId: 'Q-007', selected: 'A', isCorrect: true },
          { questionId: 'Q-008', selected: 'map', isCorrect: true },
          { questionId: 'Q-009', selected: 'none', isCorrect: false },
          { questionId: 'Q-010', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-005',
        altId: 'r5',
        participantId: 'P-005',
        quizId: 'QZ-003',
        date: '2026-09-02T08:50:00',
        totalQuestions: 5,
        correct: 5,
        incorrect: 0,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 6,
        score: 6,
        percentage: 100,
        status: 'Passed',
        timeTaken: 550,
        answers: [
          { questionId: 'Q-011', selected: 'B', isCorrect: true },
          { questionId: 'Q-012', selected: 'B', isCorrect: true },
          { questionId: 'Q-013', selected: 'append', isCorrect: true },
          { questionId: 'Q-014', selected: 'python style guide', isCorrect: true },
          { questionId: 'Q-015', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-006',
        altId: 'r6',
        participantId: 'P-001',
        quizId: 'QZ-004',
        date: '2026-09-05T16:20:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 980,
        answers: [
          { questionId: 'Q-016', selected: 'A', isCorrect: true },
          { questionId: 'Q-017', selected: 'B', isCorrect: true },
          { questionId: 'Q-018', selected: 'redundancy', isCorrect: true },
          { questionId: 'Q-019', selected: 'acid', isCorrect: false },
          { questionId: 'Q-020', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-007',
        altId: 'r7',
        participantId: 'P-007',
        quizId: 'QZ-005',
        date: '2026-09-08T10:10:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 820,
        answers: [
          { questionId: 'Q-021', selected: 'B', isCorrect: true },
          { questionId: 'Q-022', selected: 'A', isCorrect: true },
          { questionId: 'Q-023', selected: 'unit', isCorrect: true },
          { questionId: 'Q-024', selected: 'O(log n)', isCorrect: true },
          { questionId: 'Q-025', selected: 'A', isCorrect: false }
        ]
      },
      {
        id: 'R-008',
        altId: 'r8',
        participantId: 'P-008',
        quizId: 'QZ-006',
        date: '2026-09-12T12:00:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 490,
        answers: [
          { questionId: 'Q-026', selected: 'C', isCorrect: true },
          { questionId: 'Q-027', selected: 'A', isCorrect: true },
          { questionId: 'Q-028', selected: '2', isCorrect: true },
          { questionId: 'Q-029', selected: '6', isCorrect: true },
          { questionId: 'Q-030', selected: 'D', isCorrect: false }
        ]
      },
      {
        id: 'R-009',
        altId: 'r9',
        participantId: 'P-009',
        quizId: 'QZ-007',
        date: '2026-09-15T09:00:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 410,
        answers: [
          { questionId: 'Q-031', selected: 'A', isCorrect: true },
          { questionId: 'Q-032', selected: 'B', isCorrect: true },
          { questionId: 'Q-033', selected: 'pacific', isCorrect: true },
          { questionId: 'Q-034', selected: 'africa', isCorrect: true },
          { questionId: 'Q-035', selected: 'B', isCorrect: false }
        ]
      },
      {
        id: 'R-010',
        altId: 'r10',
        participantId: 'P-010',
        quizId: 'QZ-001',
        date: '2026-09-18T15:30:00',
        totalQuestions: 5,
        correct: 2,
        incorrect: 3,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 2,
        score: 2,
        percentage: 33,
        status: 'Failed',
        timeTaken: 950,
        answers: [
          { questionId: 'Q-001', selected: 'B', isCorrect: true },
          { questionId: 'Q-002', selected: 'A', isCorrect: false },
          { questionId: 'Q-003', selected: 'B', isCorrect: false },
          { questionId: 'Q-004', selected: 'p', isCorrect: false },
          { questionId: 'Q-005', selected: 'content padding', isCorrect: false }
        ]
      },
      {
        id: 'R-011',
        altId: 'r11',
        participantId: 'P-002',
        quizId: 'QZ-003',
        date: '2026-09-22T11:15:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 680,
        answers: [
          { questionId: 'Q-011', selected: 'B', isCorrect: true },
          { questionId: 'Q-012', selected: 'B', isCorrect: true },
          { questionId: 'Q-013', selected: 'append', isCorrect: true },
          { questionId: 'Q-014', selected: 'python style guide', isCorrect: true },
          { questionId: 'Q-015', selected: 'A', isCorrect: false }
        ]
      },
      {
        id: 'R-012',
        altId: 'r12',
        participantId: 'P-003',
        quizId: 'QZ-006',
        date: '2026-09-26T13:40:00',
        totalQuestions: 5,
        correct: 5,
        incorrect: 0,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 6,
        score: 6,
        percentage: 100,
        status: 'Passed',
        timeTaken: 460,
        answers: [
          { questionId: 'Q-026', selected: 'C', isCorrect: true },
          { questionId: 'Q-027', selected: 'A', isCorrect: true },
          { questionId: 'Q-028', selected: '2', isCorrect: true },
          { questionId: 'Q-029', selected: '6', isCorrect: true },
          { questionId: 'Q-030', selected: 'C', isCorrect: true }
        ]
      },
      {
        id: 'R-013',
        altId: 'r13',
        participantId: 'P-004',
        quizId: 'QZ-005',
        date: '2026-09-30T10:05:00',
        totalQuestions: 5,
        correct: 2,
        incorrect: 3,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 2,
        score: 2,
        percentage: 33,
        status: 'Failed',
        timeTaken: 1190,
        answers: [
          { questionId: 'Q-021', selected: 'A', isCorrect: false },
          { questionId: 'Q-022', selected: 'B', isCorrect: false },
          { questionId: 'Q-023', selected: 'unit', isCorrect: true },
          { questionId: 'Q-024', selected: 'O(n)', isCorrect: false },
          { questionId: 'Q-025', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-014',
        altId: 'r14',
        participantId: 'P-005',
        quizId: 'QZ-002',
        date: '2026-10-04T17:00:00',
        totalQuestions: 5,
        correct: 5,
        incorrect: 0,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 6,
        score: 6,
        percentage: 100,
        status: 'Passed',
        timeTaken: 750,
        answers: [
          { questionId: 'Q-006', selected: 'B', isCorrect: true },
          { questionId: 'Q-007', selected: 'A', isCorrect: true },
          { questionId: 'Q-008', selected: 'map', isCorrect: true },
          { questionId: 'Q-009', selected: 'function with lexical scope', isCorrect: true },
          { questionId: 'Q-010', selected: 'B', isCorrect: true }
        ]
      },
      {
        id: 'R-015',
        altId: 'r15',
        participantId: 'P-007',
        quizId: 'QZ-007',
        date: '2026-10-08T09:50:00',
        totalQuestions: 5,
        correct: 5,
        incorrect: 0,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 6,
        score: 6,
        percentage: 100,
        status: 'Passed',
        timeTaken: 380,
        answers: [
          { questionId: 'Q-031', selected: 'A', isCorrect: true },
          { questionId: 'Q-032', selected: 'B', isCorrect: true },
          { questionId: 'Q-033', selected: 'pacific', isCorrect: true },
          { questionId: 'Q-034', selected: 'africa', isCorrect: true },
          { questionId: 'Q-035', selected: 'C', isCorrect: true }
        ]
      },
      {
        id: 'R-016',
        altId: 'r16',
        participantId: 'P-008',
        quizId: 'QZ-009',
        date: '2026-10-12T14:20:00',
        totalQuestions: 5,
        correct: 4,
        incorrect: 1,
        unanswered: 0,
        totalMarks: 6,
        obtainedMarks: 5,
        score: 5,
        percentage: 83,
        status: 'Passed',
        timeTaken: 490,
        answers: [
          { questionId: 'Q-041', selected: 'A', isCorrect: true },
          { questionId: 'Q-042', selected: 'chlorophyll', isCorrect: true },
          { questionId: 'Q-043', selected: 'C', isCorrect: true },
          { questionId: 'Q-044', selected: 'proton', isCorrect: false },
          { questionId: 'Q-045', selected: 'C', isCorrect: true }
        ]
      }
    ];
  }

  function getSeedNotifications() {
    return [
      { id: 'notif_1', title: 'New attempt submitted', desc: 'Omar Farooq completed General Science & Physics Concepts', time: '2 hours ago', page: 'results' },
      { id: 'notif_2', title: 'Quiz deadline approaching', desc: 'HTML & CSS Fundamentals registration ends soon', time: '1 day ago', page: 'quizzes' },
      { id: 'notif_3', title: 'High achievement recorded', desc: 'Zainab Iqbal scored 100% on World General Knowledge', time: '3 days ago', page: 'leaderboard' },
      { id: 'notif_4', title: 'Participant registered', desc: 'Ali Haider completed profile verification', time: '5 days ago', page: 'participants' }
    ];
  }

  /* ---------- Database Seeding & Reset ---------- */
  function seedIfNeeded(force = false) {
    if (!force && localStorage.getItem(KEYS.empty) === '1') return;
    const version = localStorage.getItem(KEYS.version);
    const hasData = safeRead(KEYS.categories, null) && safeRead(KEYS.quizzes, null) && safeRead(KEYS.questions, null);

    if (!force && version === DATA_VERSION && hasData) return;

    safeWrite(KEYS.categories, getSeedCategories());
    safeWrite(KEYS.questions, getSeedQuestions());
    safeWrite(KEYS.quizzes, getSeedQuizzes());
    safeWrite(KEYS.participants, getSeedParticipants());
    safeWrite(KEYS.attempts, getSeedAttempts());
    safeWrite('qms_results', getSeedAttempts());
    safeWrite(KEYS.settings, defaultSettings());
    safeWrite(KEYS.notifications, getSeedNotifications());
    safeWrite(KEYS.theme, 'light');
    safeWrite(KEYS.version, DATA_VERSION);

    safeWrite(KEYS.users, [
      {
        id: 'u_admin',
        fullName: 'System Admin',
        email: 'admin@quizpro.local',
        phone: '0300-0000000',
        password: 'admin123',
        passwordHash: hashPassword('admin123')
      },
      {
        id: 'u_admin2',
        fullName: 'QuizMaster Admin',
        email: 'admin@quizmaster.com',
        phone: '0300-1111111',
        password: 'admin123',
        passwordHash: hashPassword('admin123')
      }
    ]);

    localStorage.removeItem(KEYS.empty);
    localStorage.setItem(KEYS.seeded, '1');
  }

  function resetDemoData() {
    Object.values(KEYS).forEach((k) => {
      localStorage.removeItem(k);
    });
    localStorage.removeItem('qms_results');
    localStorage.removeItem('qms_notification_reads');
    clearSessionStores();
    seedIfNeeded(true);
  }

  function resetAllData() {
    [KEYS.categories, KEYS.questions, KEYS.quizzes, KEYS.participants, KEYS.attempts].forEach((key) => {
      safeWrite(key, []);
    });
    safeWrite('qms_results', []);
    safeWrite(KEYS.notifications, []);
    safeWrite(KEYS.settings, defaultSettings());
    safeWrite(KEYS.theme, 'light');
    safeWrite(KEYS.version, DATA_VERSION);
    safeWrite(KEYS.users, [
      {
        id: 'u_admin',
        fullName: 'System Admin',
        email: 'admin@quizpro.local',
        phone: '0300-0000000',
        password: 'admin123',
        passwordHash: hashPassword('admin123')
      },
      {
        id: 'u_admin2',
        fullName: 'QuizMaster Admin',
        email: 'admin@quizmaster.com',
        phone: '0300-1111111',
        password: 'admin123',
        passwordHash: hashPassword('admin123')
      }
    ]);
    safeWrite(KEYS.loginAttempts, { count: 0, lockedUntil: 0 });
    localStorage.removeItem('qms_notification_reads');
    clearSessionStores();
    localStorage.removeItem(KEYS.seeded);
    localStorage.setItem(KEYS.empty, '1');
  }

  /* ---------- Backward Compatible Collection Wrapper for QMS.quizzes etc. ---------- */
  function createCollectionWrapper(name) {
    return {
      all() {
        return getAll(name);
      },
      get(id) {
        return getById(name, id);
      },
      save(list) {
        safeWrite(resolveKey(name), list);
        if (name === 'attempts' || name === 'results') safeWrite('qms_results', list);
      },
      create(item) {
        return create(name, item);
      },
      update(id, changes) {
        return update(name, id, changes);
      },
      remove(id) {
        return remove(name, id);
      }
    };
  }

  /* ---------- Unified Storage & QMS API ---------- */
  const Storage = {
    init: seedIfNeeded,
    getAll,
    getById,
    create,
    update,
    remove,
    nextId,
    resetDemoData,
    resetAllData,
    search,
    filter,
    sort,
    paginate,
    averageScore,
    passRate,
    attemptsPerPeriod,
    getCategoryStats,
    getQuizStats,
    getParticipantStats,
    getQuestionAnalysis,
    getLeaderboard,
    defaultSettings,
    getSettings,
    saveSettings
  };

  const QMS = {
    KEYS,
    DATA_VERSION,
    Storage,
    init: seedIfNeeded,
    seedIfNeeded,
    resetDemoData,
    resetAllData,

    // CRUD & queries
    getAll,
    getById,
    create,
    update,
    remove,
    nextId,
    search,
    filter,
    sort,
    paginate,

    // Collections API (preserves full backward compatibility with UI code)
    categories: createCollectionWrapper('categories'),
    questions: createCollectionWrapper('questions'),
    quizzes: createCollectionWrapper('quizzes'),
    participants: createCollectionWrapper('participants'),
    attempts: createCollectionWrapper('attempts'),
    results: createCollectionWrapper('attempts'),

    // Settings
    defaultSettings,
    getSettings,
    saveSettings,

    // Auth
    getSession,
    setSession,
    isAuthenticated,
    login,
    logout,
    registerUser,
    hashPassword,
    requireAuthRedirect,
    getUsers,
    saveUsers,

    // Aggregations
    averageScore,
    passRate,
    attemptsPerPeriod,
    getCategoryStats,
    getQuizStats,
    getParticipantStats,
    getQuestionAnalysis,
    getLeaderboard,

    // Helpers
    categoryName,
    participantName,
    quizTitle,
    gradeAttempt,
    isAnswerCorrect,
    normalizeQuestionType,
    exportCSV,
    escapeHtml,
    uid
  };

  // Expose globally for both conventions (window.Storage & window.QMS)
  if (typeof window !== 'undefined') {
    window.Storage = Storage;
    window.QMS = QMS;
  }
  if (typeof global !== 'undefined') {
    global.Storage = Storage;
    global.QMS = QMS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Storage, QMS };
  }

  // Auto-initialize on script load
  seedIfNeeded();
})();
