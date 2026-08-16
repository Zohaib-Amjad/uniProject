/**
 * Quiz Management System — LocalStorage data layer + seed data
 */
const QMS = (() => {
  const KEYS = {
    categories: 'qms_categories',
    questions: 'qms_questions',
    quizzes: 'qms_quizzes',
    participants: 'qms_participants',
    results: 'qms_results',
    settings: 'qms_settings',
    session: 'qms_session_v3',
    users: 'qms_users',
    seeded: 'qms_seeded_v3',
    loginAttempts: 'qms_login_attempts'
  };

  const defaultSettings = () => ({
    systemName: 'QuizPro Admin',
    adminName: 'System Admin',
    email: 'admin@quizpro.local',
    defaultDuration: 30,
    defaultPassing: 60,
    enableTimer: true,
    randomQuestions: false,
    randomAnswers: false,
    allowRetakes: true,
    showAnswers: true,
    theme: 'light',
    compactSidebar: false,
    fontSize: 'medium'
  });

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function collection(key) {
    return {
      all() {
        return read(KEYS[key], []);
      },
      get(id) {
        return this.all().find((x) => x.id === id) || null;
      },
      save(list) {
        write(KEYS[key], list);
      },
      create(item) {
        const list = this.all();
        const row = { id: item.id || uid(key.slice(0, 3)), ...item };
        list.push(row);
        this.save(list);
        return row;
      },
      update(id, patch) {
        const list = this.all();
        const i = list.findIndex((x) => x.id === id);
        if (i < 0) return null;
        list[i] = { ...list[i], ...patch, id };
        this.save(list);
        return list[i];
      },
      remove(id) {
        const list = this.all().filter((x) => x.id !== id);
        this.save(list);
        return true;
      }
    };
  }

  const categories = collection('categories');
  const questions = collection('questions');
  const quizzes = collection('quizzes');
  const participants = collection('participants');
  const results = collection('results');

  function getSettings() {
    return { ...defaultSettings(), ...read(KEYS.settings, {}) };
  }

  function saveSettings(patch) {
    const next = { ...getSettings(), ...patch };
    write(KEYS.settings, next);
    return next;
  }

  /** Frontend demo hash — not real cryptographic security without a backend */
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
    // purge legacy session keys
    localStorage.removeItem('qms_session');
    sessionStorage.removeItem('qms_session');
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
    if (session.remember) localStorage.setItem(KEYS.session, payload);
    else sessionStorage.setItem(KEYS.session, payload);
  }

  function isAuthenticated() {
    return !!getSession();
  }

  function getLoginAttempts() {
    return read(KEYS.loginAttempts, { count: 0, lockedUntil: 0 });
  }

  function saveLoginAttempts(data) {
    write(KEYS.loginAttempts, data);
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

    const users = getUsers();
    const hash = hashPassword(pass);
    const idx = users.findIndex((u) => String(u.email || '').toLowerCase() === normalized);
    const user = idx >= 0 ? users[idx] : null;
    const valid =
      user &&
      ((user.passwordHash && user.passwordHash === hash) ||
        (user.password && user.password === pass));

    if (!valid) {
      const count = (attempts.count || 0) + 1;
      const lockedUntil = count >= 5 ? Date.now() + 30_000 : 0;
      saveLoginAttempts({ count: lockedUntil ? 0 : count, lockedUntil });
      return { ok: false, error: 'Invalid email or password.' };
    }

    // migrate legacy plain password → hash (demo hardening)
    if (!user.passwordHash || user.password) {
      users[idx] = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone || '',
        passwordHash: hash
      };
      saveUsers(users);
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
      passwordHash: hashPassword(password)
    };
    users.push(row);
    saveUsers(users);
    return { ok: true, user: { id: row.id, fullName: row.fullName, email: row.email } };
  }

  function getUsers() {
    return read(KEYS.users, []);
  }

  function saveUsers(users) {
    write(KEYS.users, users);
  }

  function requireAuthRedirect(loginPage = 'login.html') {
    if (!isAuthenticated()) {
      const next = encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash);
      location.replace(`${loginPage}?next=${next}`);
      return false;
    }
    return true;
  }

  function seedIfNeeded() {
    if (localStorage.getItem(KEYS.seeded) === '1' && categories.all().length) return;

    const cats = [
      { id: 'cat_prog', name: 'Programming', description: 'Coding and software development quizzes', status: 'Active', createdAt: '2026-01-10' },
      { id: 'cat_math', name: 'Mathematics', description: 'Algebra, arithmetic and problem solving', status: 'Active', createdAt: '2026-01-11' },
      { id: 'cat_sci', name: 'Science', description: 'Physics, chemistry and biology basics', status: 'Active', createdAt: '2026-01-12' },
      { id: 'cat_eng', name: 'English', description: 'Grammar, vocabulary and comprehension', status: 'Active', createdAt: '2026-01-13' },
      { id: 'cat_gk', name: 'General Knowledge', description: 'Current affairs and general awareness', status: 'Active', createdAt: '2026-01-14' },
      { id: 'cat_cs', name: 'Computer Science', description: 'CS fundamentals, databases and networks', status: 'Active', createdAt: '2026-01-15' }
    ];

    const qs = [
      // HTML & CSS / Programming
      { id: 'q1', text: 'Which language is primarily used to structure webpages?', type: 'mcq', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'HTML defines structure.', status: 'Active', options: { A: 'CSS', B: 'HTML', C: 'Python', D: 'SQL' }, correctAnswer: 'B' },
      { id: 'q2', text: 'Which CSS property changes text color?', type: 'mcq', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'color sets text color.', status: 'Active', options: { A: 'font-style', B: 'background', C: 'color', D: 'border' }, correctAnswer: 'C' },
      { id: 'q3', text: 'CSS stands for Cascading Style Sheets.', type: 'truefalse', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'Correct expansion.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q4', text: 'The HTML tag used for the largest heading is _____.', type: 'fillblank', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'h1 is largest.', status: 'Active', options: {}, correctAnswer: 'h1' },
      { id: 'q5', text: 'What does the CSS box model consist of?', type: 'short', categoryId: 'cat_prog', difficulty: 'Medium', marks: 2, explanation: 'Content, padding, border, margin.', status: 'Active', options: {}, correctAnswer: 'content padding border margin' },
      // JavaScript
      { id: 'q6', text: 'Which keyword declares a block-scoped variable in JS?', type: 'mcq', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'let is block-scoped.', status: 'Active', options: { A: 'var', B: 'let', C: 'define', D: 'int' }, correctAnswer: 'B' },
      { id: 'q7', text: 'typeof null returns "object" in JavaScript.', type: 'truefalse', categoryId: 'cat_prog', difficulty: 'Medium', marks: 1, explanation: 'Historical quirk.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q8', text: 'Array method used to transform each item is _____.', type: 'fillblank', categoryId: 'cat_prog', difficulty: 'Medium', marks: 1, explanation: 'map transforms arrays.', status: 'Active', options: {}, correctAnswer: 'map' },
      { id: 'q9', text: 'What is a closure in JavaScript?', type: 'short', categoryId: 'cat_prog', difficulty: 'Hard', marks: 2, explanation: 'Function with preserved outer scope.', status: 'Active', options: {}, correctAnswer: 'function with access to outer scope' },
      { id: 'q10', text: 'Which method parses a JSON string?', type: 'mcq', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'JSON.parse', status: 'Active', options: { A: 'JSON.stringify', B: 'JSON.parse', C: 'JSON.decode', D: 'parse.JSON' }, correctAnswer: 'B' },
      // Python
      { id: 'q11', text: 'Which keyword defines a function in Python?', type: 'mcq', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'def defines functions.', status: 'Active', options: { A: 'func', B: 'def', C: 'function', D: 'lambda' }, correctAnswer: 'B' },
      { id: 'q12', text: 'Python is a statically typed language.', type: 'truefalse', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'Python is dynamically typed.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'B' },
      { id: 'q13', text: 'The Python list method to add an item at the end is _____.', type: 'fillblank', categoryId: 'cat_prog', difficulty: 'Easy', marks: 1, explanation: 'append', status: 'Active', options: {}, correctAnswer: 'append' },
      { id: 'q14', text: 'What does PEP 8 relate to?', type: 'short', categoryId: 'cat_prog', difficulty: 'Medium', marks: 2, explanation: 'Style guide.', status: 'Active', options: {}, correctAnswer: 'python style guide' },
      // Database / CS
      { id: 'q15', text: 'SQL command to retrieve data is SELECT.', type: 'truefalse', categoryId: 'cat_cs', difficulty: 'Easy', marks: 1, explanation: 'SELECT reads rows.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q16', text: 'Primary key uniquely identifies a row.', type: 'mcq', categoryId: 'cat_cs', difficulty: 'Easy', marks: 1, explanation: 'Primary key is unique.', status: 'Active', options: { A: 'Foreign key', B: 'Primary key', C: 'Index only', D: 'View' }, correctAnswer: 'B' },
      { id: 'q17', text: 'Normalization reduces data _____.', type: 'fillblank', categoryId: 'cat_cs', difficulty: 'Medium', marks: 1, explanation: 'redundancy', status: 'Active', options: {}, correctAnswer: 'redundancy' },
      { id: 'q18', text: 'What does ACID stand for in databases?', type: 'short', categoryId: 'cat_cs', difficulty: 'Hard', marks: 2, explanation: 'Atomicity Consistency Isolation Durability', status: 'Active', options: {}, correctAnswer: 'atomicity consistency isolation durability' },
      { id: 'q19', text: 'Which structure uses FIFO?', type: 'mcq', categoryId: 'cat_cs', difficulty: 'Medium', marks: 1, explanation: 'Queue is FIFO.', status: 'Active', options: { A: 'Stack', B: 'Queue', C: 'Tree', D: 'Graph' }, correctAnswer: 'B' },
      { id: 'q20', text: 'HTTP is a stateful protocol.', type: 'truefalse', categoryId: 'cat_cs', difficulty: 'Medium', marks: 1, explanation: 'HTTP is stateless.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'B' },
      // Math
      { id: 'q21', text: 'What is 15% of 200?', type: 'mcq', categoryId: 'cat_math', difficulty: 'Easy', marks: 1, explanation: '0.15*200=30', status: 'Active', options: { A: '20', B: '25', C: '30', D: '35' }, correctAnswer: 'C' },
      { id: 'q22', text: 'The square root of 81 is 9.', type: 'truefalse', categoryId: 'cat_math', difficulty: 'Easy', marks: 1, explanation: '9*9=81', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q23', text: 'Area of a circle formula uses πr_____.', type: 'fillblank', categoryId: 'cat_math', difficulty: 'Easy', marks: 1, explanation: 'squared', status: 'Active', options: {}, correctAnswer: '2' },
      { id: 'q24', text: 'Solve: 2x + 6 = 18. What is x?', type: 'short', categoryId: 'cat_math', difficulty: 'Medium', marks: 2, explanation: 'x=6', status: 'Active', options: {}, correctAnswer: '6' },
      // Science
      { id: 'q25', text: 'Water chemical formula is H2O.', type: 'truefalse', categoryId: 'cat_sci', difficulty: 'Easy', marks: 1, explanation: 'Two hydrogen one oxygen.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q26', text: 'Photosynthesis primarily occurs in the _____.', type: 'fillblank', categoryId: 'cat_sci', difficulty: 'Medium', marks: 1, explanation: 'leaves/chloroplast', status: 'Active', options: {}, correctAnswer: 'leaves' },
      { id: 'q27', text: 'Unit of force is:', type: 'mcq', categoryId: 'cat_sci', difficulty: 'Easy', marks: 1, explanation: 'Newton', status: 'Active', options: { A: 'Joule', B: 'Watt', C: 'Newton', D: 'Pascal' }, correctAnswer: 'C' },
      // English / GK
      { id: 'q28', text: 'Synonym of "rapid" is:', type: 'mcq', categoryId: 'cat_eng', difficulty: 'Easy', marks: 1, explanation: 'fast/quick', status: 'Active', options: { A: 'slow', B: 'quick', C: 'lazy', D: 'dull' }, correctAnswer: 'B' },
      { id: 'q29', text: 'The capital of Japan is Tokyo.', type: 'truefalse', categoryId: 'cat_gk', difficulty: 'Easy', marks: 1, explanation: 'Tokyo is capital.', status: 'Active', options: { A: 'True', B: 'False' }, correctAnswer: 'A' },
      { id: 'q30', text: 'Who wrote "Hamlet"?', type: 'short', categoryId: 'cat_eng', difficulty: 'Medium', marks: 2, explanation: 'Shakespeare', status: 'Active', options: {}, correctAnswer: 'william shakespeare' },
      { id: 'q31', text: 'CPU stands for Central Processing _____.', type: 'fillblank', categoryId: 'cat_cs', difficulty: 'Easy', marks: 1, explanation: 'Unit', status: 'Active', options: {}, correctAnswer: 'unit' },
      { id: 'q32', text: 'Which planet is known as the Red Planet?', type: 'mcq', categoryId: 'cat_gk', difficulty: 'Easy', marks: 1, explanation: 'Mars', status: 'Active', options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Mercury' }, correctAnswer: 'B' }
    ];

    const quizDefs = [
      { id: 'quiz_html', title: 'HTML & CSS Fundamentals', description: 'Test your basics of web structure and styling.', categoryId: 'cat_prog', subject: 'HTML & CSS', difficulty: 'Easy', duration: 20, passingPercentage: 60, maxAttempts: 3, startDate: '2026-02-01', endDate: '2026-12-31', status: 'Active', instructions: 'Read each question carefully. No negative marking.', questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'], randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-01' },
      { id: 'quiz_js', title: 'JavaScript Essentials', description: 'Core JavaScript concepts for beginners.', categoryId: 'cat_prog', subject: 'JavaScript', difficulty: 'Medium', duration: 25, passingPercentage: 65, maxAttempts: 2, startDate: '2026-02-05', endDate: '2026-12-31', status: 'Active', instructions: 'Timer enabled. Submit before time ends.', questionIds: ['q6', 'q7', 'q8', 'q9', 'q10'], randomizeQuestions: false, randomizeAnswers: true, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-05' },
      { id: 'quiz_py', title: 'Python Basics', description: 'Introductory Python programming quiz.', categoryId: 'cat_prog', subject: 'Python', difficulty: 'Easy', duration: 20, passingPercentage: 55, maxAttempts: 3, startDate: '2026-02-08', endDate: '2026-12-31', status: 'Active', instructions: 'Answer all questions.', questionIds: ['q11', 'q12', 'q13', 'q14'], randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-08' },
      { id: 'quiz_db', title: 'Database Concepts', description: 'SQL and relational database fundamentals.', categoryId: 'cat_cs', subject: 'Database', difficulty: 'Medium', duration: 30, passingPercentage: 60, maxAttempts: 2, startDate: '2026-02-10', endDate: '2026-12-31', status: 'Active', instructions: 'Focus on accuracy.', questionIds: ['q15', 'q16', 'q17', 'q18'], randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: false, displayTimer: true, negativeMarking: true, createdAt: '2026-02-10' },
      { id: 'quiz_cs', title: 'Computer Science Core', description: 'Data structures and networking basics.', categoryId: 'cat_cs', subject: 'Computer Science', difficulty: 'Medium', duration: 25, passingPercentage: 60, maxAttempts: 3, startDate: '2026-02-12', endDate: '2026-12-31', status: 'Active', instructions: 'Mark for review if unsure.', questionIds: ['q19', 'q20', 'q31', 'q16'], randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-12' },
      { id: 'quiz_math', title: 'Mathematics Practice', description: 'Arithmetic and algebra practice set.', categoryId: 'cat_math', subject: 'Mathematics', difficulty: 'Easy', duration: 15, passingPercentage: 50, maxAttempts: 5, startDate: '2026-02-15', endDate: '2026-12-31', status: 'Active', instructions: 'Show working mentally before answering.', questionIds: ['q21', 'q22', 'q23', 'q24'], randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-15' },
      { id: 'quiz_gk', title: 'General Knowledge Mix', description: 'Science, GK and awareness questions.', categoryId: 'cat_gk', subject: 'General Knowledge', difficulty: 'Easy', duration: 15, passingPercentage: 60, maxAttempts: 3, startDate: '2026-02-18', endDate: '2026-12-31', status: 'Active', instructions: 'One attempt recommended.', questionIds: ['q25', 'q27', 'q29', 'q32'], randomizeQuestions: true, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-18' },
      { id: 'quiz_eng', title: 'English Language Skills', description: 'Vocabulary and literature basics.', categoryId: 'cat_eng', subject: 'English', difficulty: 'Medium', duration: 20, passingPercentage: 60, maxAttempts: 2, startDate: '2026-02-20', endDate: '2026-12-31', status: 'Draft', instructions: 'Draft quiz for review.', questionIds: ['q28', 'q30'], randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: false, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-20' },
      { id: 'quiz_sci', title: 'Science Basics', description: 'Introductory science concepts quiz.', categoryId: 'cat_sci', subject: 'Science', difficulty: 'Easy', duration: 15, passingPercentage: 60, maxAttempts: 3, startDate: '2026-02-22', endDate: '2026-12-31', status: 'Active', instructions: 'Answer all science questions carefully.', questionIds: ['q25', 'q26', 'q27'], randomizeQuestions: false, randomizeAnswers: false, showCorrectAnswers: true, allowRetake: true, displayTimer: true, negativeMarking: false, createdAt: '2026-02-22' }
    ].map((q) => ({ ...q, questionCount: q.questionIds.length }));

    const parts = [
      { id: 'p1', name: 'Ayesha Khan', email: 'ayesha.khan@email.com', phone: '0300-1111111', status: 'Active', registeredAt: '2026-01-20' },
      { id: 'p2', name: 'Bilal Ahmed', email: 'bilal.ahmed@email.com', phone: '0301-2222222', status: 'Active', registeredAt: '2026-01-21' },
      { id: 'p3', name: 'Sara Malik', email: 'sara.malik@email.com', phone: '0302-3333333', status: 'Active', registeredAt: '2026-01-22' },
      { id: 'p4', name: 'Hassan Raza', email: 'hassan.raza@email.com', phone: '0303-4444444', status: 'Active', registeredAt: '2026-01-23' },
      { id: 'p5', name: 'Fatima Noor', email: 'fatima.noor@email.com', phone: '0304-5555555', status: 'Active', registeredAt: '2026-01-24' },
      { id: 'p6', name: 'Usman Ali', email: 'usman.ali@email.com', phone: '0305-6666666', status: 'Inactive', registeredAt: '2026-01-25' },
      { id: 'p7', name: 'Zainab Iqbal', email: 'zainab.iqbal@email.com', phone: '0306-7777777', status: 'Active', registeredAt: '2026-01-26' },
      { id: 'p8', name: 'Omar Farooq', email: 'omar.farooq@email.com', phone: '0307-8888888', status: 'Active', registeredAt: '2026-01-27' },
      { id: 'p9', name: 'Maryam Siddiqui', email: 'maryam.s@email.com', phone: '0308-9999999', status: 'Active', registeredAt: '2026-01-28' },
      { id: 'p10', name: 'Ali Haider', email: 'ali.haider@email.com', phone: '0309-1010101', status: 'Active', registeredAt: '2026-01-29' }
    ];

    const sampleResults = [
      { id: 'r1', participantId: 'p1', quizId: 'quiz_html', date: '2026-03-01T10:00:00', score: 5, totalMarks: 6, percentage: 83, status: 'Passed', timeTaken: 720, correct: 4, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 5 },
      { id: 'r2', participantId: 'p2', quizId: 'quiz_html', date: '2026-03-01T11:00:00', score: 4, totalMarks: 6, percentage: 67, status: 'Passed', timeTaken: 800, correct: 4, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 4 },
      { id: 'r3', participantId: 'p3', quizId: 'quiz_js', date: '2026-03-02T09:30:00', score: 5, totalMarks: 6, percentage: 83, status: 'Passed', timeTaken: 900, correct: 4, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 5 },
      { id: 'r4', participantId: 'p4', quizId: 'quiz_js', date: '2026-03-02T14:00:00', score: 3, totalMarks: 6, percentage: 50, status: 'Failed', timeTaken: 1100, correct: 3, incorrect: 2, unanswered: 0, answers: {}, obtainedMarks: 3 },
      { id: 'r5', participantId: 'p5', quizId: 'quiz_py', date: '2026-03-03T08:45:00', score: 5, totalMarks: 5, percentage: 100, status: 'Passed', timeTaken: 600, correct: 4, incorrect: 0, unanswered: 0, answers: {}, obtainedMarks: 5 },
      { id: 'r6', participantId: 'p1', quizId: 'quiz_db', date: '2026-03-03T16:20:00', score: 4, totalMarks: 5, percentage: 80, status: 'Passed', timeTaken: 1000, correct: 3, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 4 },
      { id: 'r7', participantId: 'p7', quizId: 'quiz_cs', date: '2026-03-04T10:10:00', score: 3, totalMarks: 4, percentage: 75, status: 'Passed', timeTaken: 850, correct: 3, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 3 },
      { id: 'r8', participantId: 'p8', quizId: 'quiz_math', date: '2026-03-04T12:00:00', score: 4, totalMarks: 5, percentage: 80, status: 'Passed', timeTaken: 500, correct: 3, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 4 },
      { id: 'r9', participantId: 'p9', quizId: 'quiz_gk', date: '2026-03-05T09:00:00', score: 3, totalMarks: 4, percentage: 75, status: 'Passed', timeTaken: 420, correct: 3, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 3 },
      { id: 'r10', participantId: 'p10', quizId: 'quiz_html', date: '2026-03-05T15:30:00', score: 2, totalMarks: 6, percentage: 33, status: 'Failed', timeTaken: 950, correct: 2, incorrect: 3, unanswered: 0, answers: {}, obtainedMarks: 2 },
      { id: 'r11', participantId: 'p2', quizId: 'quiz_py', date: '2026-03-06T11:15:00', score: 4, totalMarks: 5, percentage: 80, status: 'Passed', timeTaken: 700, correct: 3, incorrect: 1, unanswered: 0, answers: {}, obtainedMarks: 4 },
      { id: 'r12', participantId: 'p3', quizId: 'quiz_math', date: '2026-03-06T13:40:00', score: 5, totalMarks: 5, percentage: 100, status: 'Passed', timeTaken: 480, correct: 4, incorrect: 0, unanswered: 0, answers: {}, obtainedMarks: 5 },
      { id: 'r13', participantId: 'p4', quizId: 'quiz_cs', date: '2026-03-07T10:05:00', score: 2, totalMarks: 4, percentage: 50, status: 'Failed', timeTaken: 1200, correct: 2, incorrect: 2, unanswered: 0, answers: {}, obtainedMarks: 2 },
      { id: 'r14', participantId: 'p5', quizId: 'quiz_js', date: '2026-03-07T17:00:00', score: 6, totalMarks: 6, percentage: 100, status: 'Passed', timeTaken: 780, correct: 5, incorrect: 0, unanswered: 0, answers: {}, obtainedMarks: 6 },
      { id: 'r15', participantId: 'p7', quizId: 'quiz_gk', date: '2026-03-08T09:50:00', score: 4, totalMarks: 4, percentage: 100, status: 'Passed', timeTaken: 390, correct: 4, incorrect: 0, unanswered: 0, answers: {}, obtainedMarks: 4 }
    ];

    write(KEYS.categories, cats);
    write(KEYS.questions, qs);
    write(KEYS.quizzes, quizDefs);
    write(KEYS.participants, parts);
    write(KEYS.results, sampleResults);
    write(KEYS.settings, defaultSettings());
    write(KEYS.users, [
      {
        id: 'u_admin',
        fullName: 'System Admin',
        email: 'admin@quizpro.local',
        phone: '0300-0000000',
        passwordHash: hashPassword('admin123')
      }
    ]);
    clearSessionStores();
    localStorage.setItem(KEYS.seeded, '1');
  }

  function categoryName(id) {
    return (categories.get(id) || {}).name || '—';
  }

  function participantName(id) {
    return (participants.get(id) || {}).name || '—';
  }

  function quizTitle(id) {
    return (quizzes.get(id) || {}).title || '—';
  }

  function countBy(list, pred) {
    return list.filter(pred).length;
  }

  function normalizeAnswer(v) {
    return String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function isAnswerCorrect(question, selected) {
    if (selected == null || selected === '') return false;
    const sel = normalizeAnswer(selected);
    const correct = normalizeAnswer(question.correctAnswer);
    if (question.type === 'mcq' || question.type === 'truefalse') {
      return sel === correct || sel === normalizeAnswer((question.options || {})[question.correctAnswer]);
    }
    return sel === correct || correct.includes(sel) || sel.includes(correct);
  }

  function gradeAttempt({ quiz, questionList, answers, timeTaken }) {
    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;
    let obtained = 0;
    let totalMarks = 0;
    const breakdown = [];

    questionList.forEach((q) => {
      totalMarks += Number(q.marks) || 1;
      const selected = answers[q.id];
      const empty = selected == null || String(selected).trim() === '';
      let result = 'unanswered';
      if (empty) {
        unanswered += 1;
      } else if (isAnswerCorrect(q, selected)) {
        correct += 1;
        obtained += Number(q.marks) || 1;
        result = 'correct';
      } else {
        incorrect += 1;
        if (quiz.negativeMarking) obtained = Math.max(0, obtained - 0.25);
        result = 'incorrect';
      }
      breakdown.push({
        questionId: q.id,
        question: q.text,
        selectedAnswer: empty ? '—' : String(selected),
        correctAnswer: q.type === 'mcq' || q.type === 'truefalse' ? `${q.correctAnswer}${q.options && q.options[q.correctAnswer] ? ' — ' + q.options[q.correctAnswer] : ''}` : String(q.correctAnswer),
        result
      });
    });

    const percentage = totalMarks ? Math.round((obtained / totalMarks) * 100) : 0;
    const passed = percentage >= (Number(quiz.passingPercentage) || 60);
    return {
      correct,
      incorrect,
      unanswered,
      obtainedMarks: Math.round(obtained * 100) / 100,
      totalMarks,
      percentage,
      status: passed ? 'Passed' : 'Failed',
      timeTaken,
      breakdown
    };
  }

  function exportCSV(filename, rows) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function resetDemoData() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    seedIfNeeded();
  }

  return {
    KEYS,
    seedIfNeeded,
    categories,
    questions,
    quizzes,
    participants,
    results,
    getSettings,
    saveSettings,
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
    categoryName,
    participantName,
    quizTitle,
    countBy,
    gradeAttempt,
    isAnswerCorrect,
    exportCSV,
    resetDemoData,
    uid
  };
})();

// Auto-seed
QMS.seedIfNeeded();
