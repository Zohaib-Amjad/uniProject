/**
 * QuizPro — Distraction-Free Quiz Attempt Engine & Timer
 * Phase 10: Pre-quiz screen, Quiz Interface, State Management, Timer, Scoring
 */
const QuizEngine = (() => {
  const STATE_KEY = 'qms_active_attempt';
  let timerId = null;
  let beforeUnloadAttached = false;

  /* ---------- Helpers ---------- */
  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveState(state) {
    if (!state) return;
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      // Also mirror in localStorage for fail-safe resilience
      if (state.quizId && state.participantId) {
        localStorage.setItem(`qms_active_${state.quizId}_${state.participantId}`, JSON.stringify(state));
      }
    } catch (err) {
      console.warn('Storage save error:', err);
    }
  }

  function clearState() {
    const st = loadState();
    if (st && st.quizId && st.participantId) {
      try {
        localStorage.removeItem(`qms_active_${st.quizId}_${st.participantId}`);
      } catch (_) {}
    }
    sessionStorage.removeItem(STATE_KEY);
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    removeBeforeUnloadGuard();
  }

  function hasActiveAttempt() {
    const st = loadState();
    return !!(st && st.questions && st.questions.length > 0 && !st.submitted);
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatTime(sec, forceHours = false) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const remSec = s % 60;

    if (h > 0 || forceHours) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
  }

  /* ---------- Page Leave Guard ---------- */
  function handleBeforeUnload(e) {
    if (hasActiveAttempt()) {
      e.preventDefault();
      e.returnValue = 'You have a quiz attempt in progress. Your progress may be lost if you leave.';
      return e.returnValue;
    }
  }

  function attachBeforeUnloadGuard() {
    if (!beforeUnloadAttached && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadAttached = true;
    }
  }

  function removeBeforeUnloadGuard() {
    if (beforeUnloadAttached && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      beforeUnloadAttached = false;
    }
  }

  /* ---------- Toast Notification ---------- */
  function showToast(message, type = 'info') {
    const container = document.getElementById('quizToastContainer');
    if (!container) return;
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning text-dark' : type === 'success' ? 'success' : 'dark'} border-0 show mb-2`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${QMS.escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>`;
    container.appendChild(toastEl);
    setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.remove();
    }, 4000);
  }

  /* ---------- Pre-Quiz Validation ---------- */
  function validateQuizStart(quizId, participantId) {
    if (!quizId || !participantId) {
      return {
        valid: false,
        title: 'Missing Parameters',
        message: 'Quiz ID or Participant ID was not provided in the URL.'
      };
    }

    const quiz = QMS.quizzes.get(quizId);
    if (!quiz) {
      return {
        valid: false,
        title: 'Quiz Not Found',
        message: `The requested quiz with ID "${quizId}" does not exist in the system.`
      };
    }

    const participant = QMS.participants.get(participantId);
    if (!participant) {
      return {
        valid: false,
        title: 'Participant Not Found',
        message: `The participant with ID "${participantId}" was not found.`
      };
    }

    if (quiz.status !== 'Active') {
      return {
        valid: false,
        title: 'Quiz Inactive',
        message: `This quiz is currently marked as "${quiz.status || 'Draft'}". Only active quizzes can be attempted.`
      };
    }

    if (participant.status !== 'Active') {
      return {
        valid: false,
        title: 'Participant Inactive',
        message: `Participant account "${participant.name}" is currently suspended or inactive.`
      };
    }

    // Schedule validation
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (quiz.startDate && todayStr < quiz.startDate) {
      return {
        valid: false,
        title: 'Quiz Not Open Yet',
        message: `This quiz is scheduled to open on ${quiz.startDate}. Please check back later.`
      };
    }

    if (quiz.endDate && todayStr > quiz.endDate) {
      return {
        valid: false,
        title: 'Quiz Closed',
        message: `This quiz closed on ${quiz.endDate} and is no longer accepting new attempts.`
      };
    }

    // Attempts and Retakes validation
    const previousAttempts = QMS.results
      .all()
      .filter((r) => String(r.quizId).toLowerCase() === String(quizId).toLowerCase() &&
                     String(r.participantId).toLowerCase() === String(participantId).toLowerCase()).length;

    const allowRetake = quiz.allowRetake !== false && quiz.options?.allowRetake !== false;
    if (!allowRetake && previousAttempts > 0) {
      return {
        valid: false,
        title: 'Retakes Not Allowed',
        message: `You have already completed this quiz. Retakes are not permitted for this assessment.`,
        previousAttempts
      };
    }

    const maxAttempts = Number(quiz.maxAttempts || quiz.options?.maxAttempts) || 0;
    if (maxAttempts > 0 && previousAttempts >= maxAttempts) {
      return {
        valid: false,
        title: 'Maximum Attempts Reached',
        message: `You have reached the maximum allowed limit of ${maxAttempts} attempt(s) for this quiz.`,
        previousAttempts
      };
    }

    // Questions validation
    const questionIds = quiz.questionIds || [];
    const questions = questionIds.map((id) => QMS.questions.get(id)).filter(Boolean);
    if (!questions.length) {
      return {
        valid: false,
        title: 'No Questions Configured',
        message: 'This quiz does not have any questions assigned. Please contact the administrator.'
      };
    }

    return {
      valid: true,
      quiz,
      participant,
      questions,
      previousAttempts
    };
  }

  /* ---------- 10.1 Pre-Quiz Screen Rendering ---------- */
  function renderPreQuizScreen(quizId, participantId) {
    const root = document.getElementById('quizApp');
    if (!root) return;

    const validation = validateQuizStart(quizId, participantId);

    // If validation fails, render clear error / warning card
    if (!validation.valid) {
      root.innerHTML = `
        <div class="pre-quiz-card text-center">
          <div class="mb-3 text-warning">
            <i class="fa fa-triangle-exclamation fa-3x"></i>
          </div>
          <h2 class="h3 fw-bold mb-2">${QMS.escapeHtml(validation.title)}</h2>
          <p class="text-muted fs-6 mb-4">${QMS.escapeHtml(validation.message)}</p>
          <div class="d-flex justify-content-center gap-2">
            <a class="btn btn-brand text-white" href="index.html#quizzes">
              <i class="fa fa-arrow-left me-1"></i> Return to Quizzes
            </a>
            <a class="btn btn-outline-secondary" href="index.html#dashboard">
              Dashboard
            </a>
          </div>
        </div>`;
      return;
    }

    const { quiz, participant, questions, previousAttempts } = validation;
    const settings = QMS.getSettings() || {};
    const durationMin = Number(quiz.duration || quiz.timeLimit) || Number(settings.defaultDuration) || 30;
    const passingPct = Number(quiz.passingPercentage || quiz.passingScore) || Number(settings.defaultPassing) || 60;
    const maxAttempts = Number(quiz.maxAttempts || quiz.options?.maxAttempts) || 0;
    const attemptsDisplay = maxAttempts > 0 ? `${previousAttempts} / ${maxAttempts} used` : `${previousAttempts} taken (Unlimited)`;
    const isNeg = Boolean(quiz.negativeMarking || quiz.options?.negativeMarking);
    const negRate = Number(quiz.negativeRate ?? quiz.negativeFraction ?? 0.25);
    const negInfo = isNeg ? `Enabled (${Math.round(negRate * 100)}% deduction)` : 'Disabled (No penalty)';
    const category = QMS.categoryName(quiz.categoryId) || 'General';

    // Update topbar participant name
    const topBadge = document.getElementById('topParticipantBadge');
    const topName = document.getElementById('topParticipantName');
    if (topBadge && topName) {
      topName.textContent = participant.name;
      topBadge.classList.remove('d-none');
    }

    root.innerHTML = `
      <div class="pre-quiz-card">
        <div class="pre-quiz-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="badge-soft badge-brand">${QMS.escapeHtml(category)}</span>
              <span class="badge-soft badge-${quiz.difficulty === 'Hard' ? 'danger' : quiz.difficulty === 'Medium' ? 'warning' : 'success'}">${QMS.escapeHtml(quiz.difficulty || 'Medium')}</span>
              <span class="badge-soft badge-info">ID: ${QMS.escapeHtml(quiz.id)}</span>
            </div>
            <h1 class="h2 fw-bold text-dark mb-1" id="preQuizTitle">${QMS.escapeHtml(quiz.title)}</h1>
          </div>
        </div>

        <div class="mb-4 text-muted">
          ${QMS.escapeHtml(quiz.description || 'Welcome to this assessment. Please review all guidelines and start when ready.')}
        </div>

        <div class="pre-quiz-instructions">
          <h5 class="fw-bold mb-2 text-dark"><i class="fa fa-circle-info me-2 text-brand"></i>Instructions & Rules</h5>
          <div class="small mb-2">${QMS.escapeHtml(quiz.instructions || 'Read each question carefully before submitting your answer.')}</div>
          <ul class="mb-0 ps-3 small text-muted">
            <li>You can navigate between questions using <strong>Previous</strong>, <strong>Next</strong>, or the question navigation grid.</li>
            <li>Use <strong>Mark for Review</strong> to flag uncertain questions and revisit them before final submission.</li>
            <li>Timer automatically counts down. Your attempt will be automatically submitted when time expires.</li>
            <li>${isNeg ? '<strong>Negative marking is active:</strong> incorrect answers will reduce your total score.' : '<strong>No negative marking:</strong> no penalty for incorrect answers.'}</li>
          </ul>
        </div>

        <div class="pre-quiz-stats-grid">
          <div class="pre-quiz-stat-card">
            <i class="fa fa-list-check text-brand fs-4 mb-1"></i>
            <div class="text-muted small">Total Questions</div>
            <div class="pre-quiz-stat-val">${questions.length}</div>
          </div>
          <div class="pre-quiz-stat-card">
            <i class="fa fa-stopwatch text-brand fs-4 mb-1"></i>
            <div class="text-muted small">Duration</div>
            <div class="pre-quiz-stat-val">${durationMin} mins</div>
          </div>
          <div class="pre-quiz-stat-card">
            <i class="fa fa-bullseye text-brand fs-4 mb-1"></i>
            <div class="text-muted small">Passing Score</div>
            <div class="pre-quiz-stat-val">${passingPct}%</div>
          </div>
          <div class="pre-quiz-stat-card">
            <i class="fa fa-rotate-right text-brand fs-4 mb-1"></i>
            <div class="text-muted small">Attempts</div>
            <div class="pre-quiz-stat-val" style="font-size:1.05rem;">${attemptsDisplay}</div>
          </div>
          <div class="pre-quiz-stat-card">
            <i class="fa fa-scale-balanced text-brand fs-4 mb-1"></i>
            <div class="text-muted small">Negative Marking</div>
            <div class="pre-quiz-stat-val" style="font-size:1.05rem;">${negInfo}</div>
          </div>
        </div>

        <div class="d-flex flex-wrap align-items-center justify-content-between pt-3 border-top gap-3">
          <div class="d-flex align-items-center gap-2">
            <div class="avatar-sm rounded-circle bg-primary-soft text-brand d-flex align-items-center justify-content-center fw-bold" style="width:38px;height:38px;">
              ${participant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div class="fw-semibold text-dark">${QMS.escapeHtml(participant.name)}</div>
              <small class="text-muted">${QMS.escapeHtml(participant.email || participant.id)}</small>
            </div>
          </div>

          <div class="d-flex gap-2">
            <a class="btn btn-outline-secondary px-3" href="index.html#quizzes">Cancel</a>
            <button type="button" class="btn btn-brand text-white px-4 py-2 fw-semibold" id="btnStartQuiz">
              <i class="fa fa-play me-2"></i> Start Quiz
            </button>
          </div>
        </div>
      </div>`;

    document.getElementById('btnStartQuiz')?.addEventListener('click', () => {
      if (start({ quizId, participantId })) {
        bindAttemptUI();
      }
    });
  }

  /* ---------- 10.3 Start Attempt & State Preparation ---------- */
  function start({ quizId, participantId }) {
    const validation = validateQuizStart(quizId, participantId);
    if (!validation.valid) {
      renderPreQuizScreen(quizId, participantId);
      return false;
    }

    const { quiz, questions } = validation;
    const settings = QMS.getSettings() || {};
    const shouldRandomizeQ = Boolean(quiz.randomizeQuestions || quiz.options?.randomizeQuestions || settings.randomQuestions);
    const shouldRandomizeA = Boolean(quiz.randomizeAnswers || quiz.options?.randomizeAnswers || settings.randomizeAnswers);

    let preparedQuestions = [...questions];
    if (shouldRandomizeQ) {
      preparedQuestions = shuffle(preparedQuestions);
    }

    preparedQuestions = preparedQuestions.map((q) => {
      const copy = {
        ...q,
        options: { ...(q.options || {}) }
      };

      // Randomize options for multiple-choice while preserving correct answer mapping
      if (shouldRandomizeA && (q.type === 'mcq' || q.type === 'truefalse')) {
        const originalEntries = Object.entries(copy.options);
        if (originalEntries.length > 1) {
          const originalCorrectKey = String(q.correctAnswer).trim().toUpperCase();
          const originalCorrectText = copy.options[originalCorrectKey] || copy.options[q.correctAnswer];

          const shuffled = shuffle(originalEntries);
          const newMap = {};
          let newCorrectKey = q.correctAnswer;

          shuffled.forEach(([oldKey, text], idx) => {
            const letter = String.fromCharCode(65 + idx);
            newMap[letter] = text;
            if (oldKey === originalCorrectKey || text === originalCorrectText) {
              newCorrectKey = letter;
            }
          });

          copy.options = newMap;
          copy.correctAnswer = newCorrectKey;
        }
      }
      return copy;
    });

    const durationMin = Number(quiz.duration || quiz.timeLimit) || Number(settings.defaultDuration) || 30;
    const durationSec = durationMin * 60;
    const now = Date.now();
    const endsAt = now + durationSec * 1000;

    const timerSetting = settings.enableTimer !== false;
    const displayTimer = timerSetting && (quiz.displayTimer !== false && quiz.options?.displayTimer !== false);

    const state = {
      quizId,
      participantId,
      questions: preparedQuestions,
      answers: {},
      review: {},
      index: 0,
      startedAt: now,
      durationSec,
      endsAt,
      timerEnabled: timerSetting,
      displayTimer,
      negativeMarking: Boolean(quiz.negativeMarking || quiz.options?.negativeMarking),
      negativeRate: Number(quiz.negativeRate ?? quiz.negativeFraction ?? 0.25),
      passingPercentage: Number(quiz.passingPercentage || quiz.passingScore) || Number(settings.defaultPassing) || 60,
      submitted: false
    };

    saveState(state);
    attachBeforeUnloadGuard();
    return true;
  }

  /* ---------- 10.2 & 10.3 Quiz UI & Interaction ---------- */
  function bindAttemptUI() {
    const root = document.getElementById('quizApp');
    if (!root) return;

    const state = loadState();
    if (!state || !state.questions || state.questions.length === 0) {
      renderPreQuizScreen();
      return;
    }

    // If time already expired while page was away, submit immediately
    if (state.timerEnabled && state.endsAt <= Date.now()) {
      submit(true);
      return;
    }

    attachBeforeUnloadGuard();
    const quiz = QMS.quizzes.get(state.quizId) || { title: 'Assessment', id: state.quizId };
    const participant = QMS.participants.get(state.participantId) || { name: 'Participant', id: state.participantId };

    // Update topbar participant name
    const topBadge = document.getElementById('topParticipantBadge');
    const topName = document.getElementById('topParticipantName');
    if (topBadge && topName) {
      topName.textContent = participant.name;
      topBadge.classList.remove('d-none');
    }

    const render = () => {
      const st = loadState();
      if (!st || !st.questions) return;

      const total = st.questions.length;
      const curIdx = Math.max(0, Math.min(st.index, total - 1));
      const q = st.questions[curIdx];

      // Answered counts & progress
      const answeredKeys = Object.keys(st.answers).filter((k) => {
        const val = st.answers[k];
        return val !== null && val !== undefined && String(val).trim() !== '';
      });
      const answeredCount = answeredKeys.length;
      const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
      const isReviewed = Boolean(st.review[q.id]);
      const currentAns = st.answers[q.id] || '';

      // Render Options according to question type
      let optionsHTML = '';
      const qType = QMS.normalizeQuestionType(q.type);

      if (qType === 'mcq' || qType === 'truefalse') {
        const entries = Object.entries(q.options || {});
        optionsHTML = `
          <div class="quiz-options-container" role="radiogroup" aria-label="Question options">
            ${entries.map(([key, text]) => {
              const isSelected = String(currentAns).trim().toUpperCase() === String(key).trim().toUpperCase();
              return `
                <button type="button" 
                  class="option-card-btn ${isSelected ? 'selected' : ''}" 
                  data-option-key="${QMS.escapeHtml(key)}"
                  role="radio"
                  aria-checked="${isSelected}">
                  <span class="option-card-badge">${QMS.escapeHtml(key)}</span>
                  <span class="option-card-text">${QMS.escapeHtml(text)}</span>
                  ${isSelected ? '<i class="fa fa-circle-check ms-auto text-brand"></i>' : ''}
                </button>`;
            }).join('')}
          </div>`;
      } else if (qType === 'short') {
        optionsHTML = `
          <div class="mb-4">
            <label for="shortAnswerInput" class="form-label fw-semibold text-dark">Your Answer:</label>
            <input type="text" 
              class="form-control form-control-lg" 
              id="shortAnswerInput" 
              placeholder="Type your short answer here..." 
              value="${QMS.escapeHtml(currentAns)}" 
              autocomplete="off" />
            <small class="text-muted mt-1 d-block">Answers are case-insensitive. Provide the concise term or phrase.</small>
          </div>`;
      } else {
        // fill in the blank
        optionsHTML = `
          <div class="mb-4">
            <label for="fillBlankInput" class="form-label fw-semibold text-dark">Fill in the blank:</label>
            <input type="text" 
              class="form-control form-control-lg" 
              id="fillBlankInput" 
              placeholder="Type the missing word or phrase..." 
              value="${QMS.escapeHtml(currentAns)}" 
              autocomplete="off" />
            <small class="text-muted mt-1 d-block">Type the exact term that completes the statement.</small>
          </div>`;
      }

      // Navigator buttons grid
      const navButtonsHTML = st.questions.map((item, idx) => {
        const hasAnswer = st.answers[item.id] !== undefined && st.answers[item.id] !== null && String(st.answers[item.id]).trim() !== '';
        const itemReviewed = Boolean(st.review[item.id]);
        const isCurrent = idx === curIdx;

        const classes = [
          'nav-q-btn',
          isCurrent ? 'current' : '',
          hasAnswer ? 'answered' : 'unanswered',
          itemReviewed ? 'review' : ''
        ].filter(Boolean).join(' ');

        return `
          <button type="button" 
            class="${classes}" 
            data-goto="${idx}" 
            title="Question ${idx + 1}: ${hasAnswer ? 'Answered' : 'Unanswered'}${itemReviewed ? ' (Marked for Review)' : ''}"
            aria-label="Question ${idx + 1}">
            ${idx + 1}
          </button>`;
      }).join('');

      // Layout Assembly
      root.innerHTML = `
        <div class="quiz-wrapper">
          <!-- Top Assessment Header -->
          <div class="quiz-header-card">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <h2 class="h4 fw-bold text-dark mb-1">${QMS.escapeHtml(quiz.title)}</h2>
                <div class="d-flex flex-wrap align-items-center gap-3 text-muted small">
                  <span><i class="fa fa-user me-1 text-brand"></i>${QMS.escapeHtml(participant.name)}</span>
                  <span><i class="fa fa-hashtag me-1"></i>Question ${curIdx + 1} of ${total}</span>
                  <span class="badge-soft badge-info">${answeredCount}/${total} Answered</span>
                </div>
              </div>

              <!-- Countdown Timer -->
              <div class="timer-container ${st.displayTimer ? 'timer-normal' : 'd-none'}" id="quizTimer" role="timer" aria-live="polite">
                <i class="fa fa-clock"></i>
                <span id="quizTimerText">--:--</span>
              </div>
            </div>

            <!-- Live Progress Bar -->
            <div class="quiz-progress-wrapper mt-3">
              <div class="quiz-progress-text">
                <span>Progress: ${progressPct}% completed</span>
                <span>${total - answeredCount} remaining</span>
              </div>
              <div class="quiz-progress-bar-bg">
                <div class="quiz-progress-bar-fill" style="width: ${progressPct}%;"></div>
              </div>
            </div>
          </div>

          <!-- Main Question Grid (Question + Navigator) -->
          <div class="quiz-main-grid">
            <!-- Question Content Area -->
            <div class="quiz-question-card">
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pb-3 border-bottom mb-3">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge-soft badge-brand fw-bold">Question ${curIdx + 1}</span>
                  <span class="badge-soft badge-muted">${QMS.escapeHtml((q.type || 'MCQ').toUpperCase())}</span>
                  <span class="badge-soft badge-muted">${QMS.escapeHtml(q.difficulty || 'Medium')}</span>
                </div>
                <div class="fw-semibold text-muted small">
                  <i class="fa fa-award me-1 text-brand"></i>${q.marks || 1} mark(s)
                </div>
              </div>

              <!-- Question Text -->
              <h3 class="quiz-question-text" id="activeQuestionText">${QMS.escapeHtml(q.text)}</h3>

              <!-- Interactive Options -->
              ${optionsHTML}

              <!-- Action Buttons Bar -->
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-3 border-top mt-4">
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary px-3" id="btnPrev" ${curIdx === 0 ? 'disabled' : ''}>
                    <i class="fa fa-arrow-left me-1"></i> Previous
                  </button>
                  <button type="button" class="btn btn-outline-secondary px-3" id="btnNext" ${curIdx >= total - 1 ? 'disabled' : ''}>
                    Next <i class="fa fa-arrow-right ms-1"></i>
                  </button>
                </div>

                <div class="d-flex gap-2 ms-auto">
                  <button type="button" class="btn ${isReviewed ? 'btn-warning text-dark' : 'btn-outline-warning'}" id="btnReview">
                    <i class="fa fa-flag me-1"></i> ${isReviewed ? 'Marked for Review' : 'Mark for Review'}
                  </button>
                  <button type="button" class="btn btn-outline-secondary" id="btnClearAnswer" title="Clear your selected answer">
                    <i class="fa fa-eraser me-1"></i> Clear
                  </button>
                  <button type="button" class="btn btn-brand text-white fw-bold px-3" id="btnSubmitTop">
                    <i class="fa fa-check-double me-1"></i> Submit Quiz
                  </button>
                </div>
              </div>
            </div>

            <!-- Right Question Navigator Panel (Sticky / Collapsible) -->
            <div class="q-navigator-panel">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <button type="button" class="btn btn-sm btn-outline-brand d-lg-none py-1 px-2" id="btnToggleNavGrid" aria-expanded="false" aria-controls="qNavCollapsible">
                  <i class="fa fa-list-ol me-1"></i> Question Navigator (${curIdx + 1}/${total}) <i class="fa fa-chevron-down ms-1" id="qNavChevron"></i>
                </button>
                <h5 class="fw-bold mb-0 text-dark d-none d-lg-block" style="font-size:1.05rem;">
                  <i class="fa fa-grid-2 me-1 text-brand"></i> Questions
                </h5>
                <span class="badge-soft badge-brand d-none d-lg-inline-block">${curIdx + 1} / ${total}</span>
              </div>

              <div class="q-nav-collapsible d-none d-lg-block" id="qNavCollapsible">
                <div class="q-nav-grid" id="questionNavGrid">
                  ${navButtonsHTML}
                </div>

                <div class="q-legend">
                  <div class="q-legend-item">
                    <div class="q-legend-dot dot-answered"></div>
                    <span>Answered (${answeredCount})</span>
                  </div>
                  <div class="q-legend-item">
                    <div class="q-legend-dot dot-current"></div>
                    <span>Current Question</span>
                  </div>
                  <div class="q-legend-item">
                    <div class="q-legend-dot dot-review"></div>
                    <span>Marked for Review (${Object.keys(st.review).filter(k => st.review[k]).length})</span>
                  </div>
                  <div class="q-legend-item">
                    <div class="q-legend-dot dot-unanswered"></div>
                    <span>Unanswered (${total - answeredCount})</span>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-top">
                  <button type="button" class="btn btn-brand text-white w-100 py-2 fw-semibold" id="btnSideSubmit">
                    <i class="fa fa-check-circle me-1"></i> Submit Quiz
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>`;

      // Event Bindings
      // Option Selection (MCQ / TrueFalse)
      document.querySelectorAll('.option-card-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.optionKey;
          setAnswer(q.id, key);
          render();
          tickTimer();
        });
      });

      // Text Input (Short Answer / Blank)
      const shortInp = document.getElementById('shortAnswerInput');
      if (shortInp) {
        shortInp.focus();
        shortInp.addEventListener('input', (e) => {
          setAnswer(q.id, e.target.value, false);
          // Update navigator visual state without re-rendering active input
          updateNavIndicator(q.id, e.target.value);
        });
        shortInp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (curIdx < total - 1) goToQuestion(curIdx + 1);
          }
        });
      }

      const blankInp = document.getElementById('fillBlankInput');
      if (blankInp) {
        blankInp.focus();
        blankInp.addEventListener('input', (e) => {
          setAnswer(q.id, e.target.value, false);
          updateNavIndicator(q.id, e.target.value);
        });
        blankInp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (curIdx < total - 1) goToQuestion(curIdx + 1);
          }
        });
      }

      // Prev & Next Buttons
      document.getElementById('btnPrev')?.addEventListener('click', () => {
        if (curIdx > 0) goToQuestion(curIdx - 1);
      });

      document.getElementById('btnNext')?.addEventListener('click', () => {
        if (curIdx < total - 1) goToQuestion(curIdx + 1);
      });

      // Review Toggle
      document.getElementById('btnReview')?.addEventListener('click', () => {
        toggleReview(q.id);
        render();
        tickTimer();
      });

      // Clear Answer
      document.getElementById('btnClearAnswer')?.addEventListener('click', () => {
        clearAnswer(q.id);
        render();
        tickTimer();
      });

      // Mobile Question Navigator Drawer Toggle
      document.getElementById('btnToggleNavGrid')?.addEventListener('click', () => {
        const panel = document.getElementById('qNavCollapsible');
        const btn = document.getElementById('btnToggleNavGrid');
        const icon = document.getElementById('qNavChevron');
        if (!panel) return;
        panel.classList.toggle('d-none');
        const isOpen = !panel.classList.contains('d-none');
        btn?.setAttribute('aria-expanded', String(isOpen));
        if (icon) icon.className = isOpen ? 'fa fa-chevron-up ms-1' : 'fa fa-chevron-down ms-1';
      });

      // Navigation Grid buttons
      document.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetIdx = Number(btn.dataset.goto);
          goToQuestion(targetIdx);
        });
      });

      // Submit Quiz buttons
      document.getElementById('btnSubmitTop')?.addEventListener('click', showSubmitConfirmation);
      document.getElementById('btnSideSubmit')?.addEventListener('click', showSubmitConfirmation);
    };

    function updateNavIndicator(qId, val) {
      const st = loadState();
      if (!st) return;
      const targetBtn = document.querySelector(`[data-goto="${st.index}"]`);
      if (targetBtn) {
        const hasAns = String(val || '').trim() !== '';
        targetBtn.classList.toggle('answered', hasAns);
        targetBtn.classList.toggle('unanswered', !hasAns);
      }
    }

    // Timer Tick Logic
    const tickTimer = () => {
      const st = loadState();
      if (!st || st.submitted) return;
      if (st.timerEnabled === false) return;

      const remaining = Math.max(0, Math.floor((st.endsAt - Date.now()) / 1000));
      const timerEl = document.getElementById('quizTimer');
      const timerText = document.getElementById('quizTimerText');

      if (timerText) {
        const forceHours = (st.durationSec || 0) >= 3600;
        timerText.textContent = formatTime(remaining, forceHours);
      }

      if (timerEl) {
        const totalDuration = st.durationSec || 1800;
        const isDanger = remaining <= totalDuration * 0.10 || remaining <= 60;
        const isWarning = !isDanger && (remaining <= totalDuration * 0.25 || remaining <= 300);

        timerEl.classList.toggle('timer-danger', isDanger);
        timerEl.classList.toggle('timer-warning', isWarning);
        timerEl.classList.toggle('timer-normal', !isDanger && !isWarning);
      }

      if (remaining <= 0) {
        if (timerId) clearInterval(timerId);
        timerId = null;
        submit(true);
      }
    };

    // Keyboard Shortcuts
    const handleKeydown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (e.key === 'ArrowLeft' && !isInput) {
        const st = loadState();
        if (st && st.index > 0) goToQuestion(st.index - 1);
      } else if (e.key === 'ArrowRight' && !isInput) {
        const st = loadState();
        if (st && st.index < st.questions.length - 1) goToQuestion(st.index + 1);
      } else if ((e.key === 'm' || e.key === 'M') && !isInput) {
        const st = loadState();
        if (st) {
          const q = st.questions[st.index];
          if (q) {
            toggleReview(q.id);
            render();
            tickTimer();
          }
        }
      } else if (!isInput && ['1', '2', '3', '4', 'a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].includes(e.key)) {
        const st = loadState();
        if (st) {
          const q = st.questions[st.index];
          const qType = QMS.normalizeQuestionType(q.type);
          if (qType === 'mcq' || qType === 'truefalse') {
            let keyToSelect = e.key.toUpperCase();
            if (['1', '2', '3', '4'].includes(e.key)) {
              keyToSelect = String.fromCharCode(65 + parseInt(e.key, 10) - 1);
            }
            if (q.options && q.options[keyToSelect]) {
              setAnswer(q.id, keyToSelect);
              render();
              tickTimer();
            }
          }
        }
      }
    };

    window.removeEventListener('keydown', handleKeydown);
    window.addEventListener('keydown', handleKeydown);

    // Initial render and timer interval
    render();
    tickTimer();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tickTimer, 1000);
  }

  /* ---------- State Modifiers ---------- */
  function setAnswer(questionId, value, shouldSave = true) {
    const st = loadState();
    if (!st) return;
    st.answers[questionId] = value;
    if (shouldSave) saveState(st);
    else sessionStorage.setItem(STATE_KEY, JSON.stringify(st));
  }

  function clearAnswer(questionId) {
    const st = loadState();
    if (!st) return;
    delete st.answers[questionId];
    saveState(st);
  }

  function toggleReview(questionId) {
    const st = loadState();
    if (!st) return;
    st.review[questionId] = !st.review[questionId];
    saveState(st);
  }

  function goToQuestion(index) {
    const st = loadState();
    if (!st) return;
    st.index = Math.max(0, Math.min(index, st.questions.length - 1));
    saveState(st);
    bindAttemptUI();
  }

  /* ---------- 10.4 Confirmation Modal ---------- */
  function showSubmitConfirmation() {
    const st = loadState();
    if (!st) return;

    const total = st.questions.length;
    const answeredKeys = Object.keys(st.answers).filter((k) => {
      const val = st.answers[k];
      return val !== null && val !== undefined && String(val).trim() !== '';
    });
    const answered = answeredKeys.length;
    const unanswered = Math.max(0, total - answered);
    const review = Object.keys(st.review).filter((k) => st.review[k]).length;

    const ansEl = document.getElementById('confirmAnsweredCount');
    const unansEl = document.getElementById('confirmUnansweredCount');
    const revEl = document.getElementById('confirmReviewCount');
    const warnAlert = document.getElementById('confirmWarningAlert');
    const warnText = document.getElementById('confirmWarningText');

    if (ansEl) ansEl.textContent = answered;
    if (unansEl) unansEl.textContent = unanswered;
    if (revEl) revEl.textContent = review;

    if (warnAlert && warnText) {
      if (unanswered > 0) {
        warnAlert.classList.remove('d-none');
        warnText.textContent = `You have ${unanswered} unanswered question(s). You can still return and answer them before submitting.`;
      } else {
        warnAlert.classList.add('d-none');
      }
    }

    const modalEl = document.getElementById('submitConfirmModal');
    if (modalEl && window.bootstrap?.Modal) {
      const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      modalInstance.show();

      const confirmBtn = document.getElementById('modalConfirmSubmitBtn');
      if (confirmBtn) {
        confirmBtn.onclick = () => {
          modalInstance.hide();
          submit(false);
        };
      }
    } else {
      let msg = `Submit quiz?\n\n- Answered: ${answered} / ${total}\n- Unanswered: ${unanswered}\n- Marked for Review: ${review}`;
      if (unanswered > 0) msg += `\n\nWarning: You have ${unanswered} unanswered question(s)!`;
      if (confirm(msg)) {
        submit(false);
      }
    }
  }

  /* ---------- 10.5 Submission, Scoring, & Persistence ---------- */
  function evaluateSubmission(state) {
    if (!state) return null;
    const quiz = QMS.quizzes.get(state.quizId);
    const timeTaken = Math.min(state.durationSec || 1800, Math.round((Date.now() - state.startedAt) / 1000));

    return QMS.gradeAttempt({
      quiz,
      questionList: state.questions,
      answers: state.answers,
      timeTaken
    });
  }

  function submit(auto = false) {
    const state = loadState();
    if (!state || state.submitted) return;

    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    state.submitted = true;
    saveState(state);
    removeBeforeUnloadGuard();

    if (auto) {
      const timeoutModalEl = document.getElementById('timeoutModal');
      if (timeoutModalEl && window.bootstrap?.Modal) {
        const timeoutModal = bootstrap.Modal.getOrCreateInstance(timeoutModalEl);
        timeoutModal.show();
      } else {
        showToast("Time's up! Your quiz has been submitted automatically.", 'warning');
      }
    }

    const graded = evaluateSubmission(state);
    const attemptData = {
      participantId: state.participantId,
      quizId: state.quizId,
      date: new Date().toISOString(),
      score: graded.obtainedMarks,
      obtainedMarks: graded.obtainedMarks,
      totalMarks: graded.totalMarks,
      percentage: graded.percentage,
      status: graded.status,
      timeTaken: graded.timeTaken,
      correct: graded.correct,
      incorrect: graded.incorrect,
      unanswered: graded.unanswered,
      answers: state.answers,
      breakdown: graded.breakdown
    };

    const savedResult = QMS.results.create(attemptData);

    // Clean up temporary active session state
    clearState();
    sessionStorage.setItem('qms_last_result', savedResult.id);

    // If auto timeout modal was shown, delay redirect slightly for smooth UX
    const redirectDelay = auto ? 1200 : 300;
    setTimeout(() => {
      // Hide any active modals
      const timeoutModalEl = document.getElementById('timeoutModal');
      if (timeoutModalEl && window.bootstrap?.Modal) {
        const m = bootstrap.Modal.getInstance(timeoutModalEl);
        if (m) m.hide();
      }
      renderResult(savedResult.id);
    }, redirectDelay);
  }

  /* ---------- Result Screen Rendering ---------- */
  function renderResult(resultId) {
    const result = QMS.results.get(resultId);
    const root = document.getElementById('quizApp');
    if (!root) return;

    if (!result) {
      root.innerHTML = `
        <div class="pre-quiz-card text-center">
          <div class="text-warning mb-3"><i class="fa fa-triangle-exclamation fa-3x"></i></div>
          <h2 class="h4 fw-bold">Result Not Found</h2>
          <p class="text-muted">No attempt record matches ID: ${QMS.escapeHtml(resultId || 'N/A')}</p>
          <a class="btn btn-brand text-white mt-3" href="index.html#attempts">View All Results</a>
        </div>`;
      return;
    }

    const quiz = QMS.quizzes.get(result.quizId) || { title: 'Assessment', id: result.quizId };
    const participant = QMS.participants.get(result.participantId) || { name: 'Participant', id: result.participantId };
    const showCorrectAnswers = quiz.showCorrectAnswers !== false && quiz.options?.showCorrectAnswers !== false;

    // Retake check
    const previousAttempts = QMS.results
      .all()
      .filter((r) => String(r.quizId).toLowerCase() === String(result.quizId).toLowerCase() &&
                     String(r.participantId).toLowerCase() === String(result.participantId).toLowerCase()).length;

    const allowRetake = quiz.allowRetake !== false && quiz.options?.allowRetake !== false;
    const maxAttempts = Number(quiz.maxAttempts || quiz.options?.maxAttempts) || 0;
    const canRetake = quiz.status === 'Active' && allowRetake && (maxAttempts === 0 || previousAttempts < maxAttempts);

    const mins = Math.floor((result.timeTaken || 0) / 60);
    const secs = (result.timeTaken || 0) % 60;
    const isPassed = result.status === 'Passed';
    const breakdown = result.breakdown || [];
    const retakeReason = !allowRetake ? 'Retakes are not permitted for this quiz' : (maxAttempts > 0 && previousAttempts >= maxAttempts) ? `Maximum attempts (${maxAttempts}) reached` : 'Quiz is currently inactive';

    root.innerHTML = `
      <div class="quiz-wrapper">
        <div class="pre-quiz-card text-center mb-4">
          <div class="score-circle-indicator" style="--circle-color:${isPassed ? 'var(--success)' : 'var(--danger)'}; --score-pct:${result.percentage || 0};">
            <div class="score-circle-inner">
              <span class="score-circle-pct ${isPassed ? 'text-success' : 'text-danger'}">${result.percentage}%</span>
              <span class="score-circle-label ${isPassed ? 'text-success' : 'text-danger'}">${isPassed ? 'PASSED' : 'FAILED'}</span>
            </div>
          </div>
          <h1 class="h2 fw-bold mb-1">${isPassed ? 'Congratulations!' : 'Assessment Complete'}</h1>
          <p class="text-muted mb-4">Quiz: <strong>${QMS.escapeHtml(quiz.title)}</strong></p>

          <div class="badge-soft badge-${isPassed ? 'success' : 'danger'} fs-6 px-3 py-1 mb-4">
            Status: ${isPassed ? 'PASSED' : 'FAILED'} (Passing Score: ${quiz.passingPercentage || 60}%)
          </div>

          <div class="row g-3 text-start justify-content-center max-w-700 mx-auto mb-4">
            <div class="col-sm-6">
              <div class="p-3 border rounded bg-surface">
                <small class="text-muted d-block">Participant</small>
                <strong>${QMS.escapeHtml(participant.name)}</strong>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="p-3 border rounded bg-surface">
                <small class="text-muted d-block">Score / Total Marks</small>
                <strong>${result.obtainedMarks ?? result.score} / ${result.totalMarks} marks</strong>
              </div>
            </div>
            <div class="col-4 col-sm-4 text-center">
              <div class="p-2 border rounded bg-surface">
                <div class="text-success fw-bold fs-5">${result.correct}</div>
                <small class="text-muted">Correct</small>
              </div>
            </div>
            <div class="col-4 col-sm-4 text-center">
              <div class="p-2 border rounded bg-surface">
                <div class="text-danger fw-bold fs-5">${result.incorrect}</div>
                <small class="text-muted">Incorrect</small>
              </div>
            </div>
            <div class="col-4 col-sm-4 text-center">
              <div class="p-2 border rounded bg-surface">
                <div class="text-muted fw-bold fs-5">${result.unanswered}</div>
                <small class="text-muted">Unanswered</small>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="p-3 border rounded bg-surface">
                <small class="text-muted d-block">Time Taken</small>
                <strong>${mins}m ${secs}s</strong>
              </div>
            </div>
            <div class="col-sm-6">
              <div class="p-3 border rounded bg-surface">
                <small class="text-muted d-block">Completed Date</small>
                <strong>${new Date(result.date).toLocaleString()}</strong>
              </div>
            </div>
          </div>

          <div class="d-flex flex-wrap gap-2 justify-content-center">
            <button type="button" class="btn btn-outline-brand px-3" id="btnToggleBreakdown">
              <i class="fa fa-list-check me-1"></i> Review Answers
            </button>
            ${canRetake ? `
              <a class="btn btn-outline-secondary px-3" href="quiz.html?quiz=${encodeURIComponent(result.quizId)}&participant=${encodeURIComponent(result.participantId)}">
                <i class="fa fa-rotate-right me-1"></i> Retake Quiz
              </a>` : `
              <button type="button" class="btn btn-outline-secondary px-3" disabled title="${QMS.escapeHtml(retakeReason)}">
                <i class="fa fa-rotate-right me-1"></i> Retake Quiz
              </button>`}
            <button type="button" class="btn btn-outline-secondary px-3" onclick="window.print()">
              <i class="fa fa-print me-1"></i> Print Result
            </button>
            <a class="btn btn-brand text-white px-4" href="index.html#/dashboard">
              <i class="fa fa-arrow-left me-1"></i> Back to Dashboard
            </a>
          </div>
          ${!canRetake ? `<small class="text-muted d-block mt-2">${QMS.escapeHtml(retakeReason)}</small>` : ''}
        </div>

        <!-- Question Breakdown Panel -->
        <div class="quiz-question-card d-none mb-4" id="breakdownSection">
          <div class="d-flex align-items-center justify-content-between pb-3 border-bottom mb-3">
            <h4 class="h5 fw-bold mb-0">Question Breakdown</h4>
            <span class="badge-soft badge-muted">${breakdown.length} Questions</span>
          </div>

          ${!showCorrectAnswers ? `
            <div class="alert alert-info py-2 px-3 small mb-3">
              <i class="fa fa-circle-info me-1"></i> Correct answers and explanations are hidden by quiz configuration.
            </div>` : ''}

          <div class="table-responsive">
            <table class="table table-hover align-middle">
              <thead>
                <tr>
                  <th style="width: 5%">#</th>
                  <th style="width: 45%">Question</th>
                  <th style="width: 25%">Selected Answer</th>
                  <th style="width: 20%">${showCorrectAnswers ? 'Correct Answer' : 'Status'}</th>
                  <th style="width: 5%" class="text-center">Result</th>
                </tr>
              </thead>
              <tbody>
                ${breakdown.map((item, index) => {
                  const isCorr = item.result === 'correct';
                  const isUnans = item.result === 'unanswered';
                  const qObj = QMS.questions.get(item.questionId);
                  const explanation = item.explanation || qObj?.explanation || '';

                  const resultIcon = isCorr
                    ? '<i class="fa fa-circle-check text-success fs-5" title="Correct"></i>'
                    : isUnans
                    ? '<span class="text-muted fw-bold fs-5" title="Unanswered">—</span>'
                    : '<i class="fa fa-circle-xmark text-danger fs-5" title="Incorrect"></i>';

                  return `
                    <tr>
                      <td class="fw-bold">${index + 1}</td>
                      <td>
                        <div>${QMS.escapeHtml(item.question || 'Question')}</div>
                        ${showCorrectAnswers && explanation ? `
                          <div class="small text-muted mt-1 fst-italic">
                            <i class="fa fa-lightbulb text-warning me-1"></i><strong>Explanation:</strong> ${QMS.escapeHtml(explanation)}
                          </div>` : ''}
                      </td>
                      <td>
                        <span class="badge-soft ${isCorr ? 'badge-success' : isUnans ? 'badge-muted' : 'badge-danger'}">
                          ${QMS.escapeHtml(item.selectedAnswer || '—')}
                        </span>
                      </td>
                      <td>
                        ${showCorrectAnswers
                          ? `<span class="text-success fw-semibold"><i class="fa fa-check me-1"></i>${QMS.escapeHtml(item.correctAnswer || '—')}</span>`
                          : `<span class="badge-soft ${isCorr ? 'badge-success' : isUnans ? 'badge-muted' : 'badge-danger'}">${item.result}</span>`}
                      </td>
                      <td class="text-center">${resultIcon}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    document.getElementById('btnToggleBreakdown')?.addEventListener('click', () => {
      const breakdownEl = document.getElementById('breakdownSection');
      if (breakdownEl) {
        breakdownEl.classList.toggle('d-none');
        if (!breakdownEl.classList.contains('d-none')) {
          breakdownEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  }

  /* ---------- Bootstrapping & Routing ---------- */
  function boot() {
    QMS.seedIfNeeded();
    const params = new URLSearchParams(window.location.search);
    const resultId = params.get('result') || (params.has('result') ? '' : null);
    const quizId = params.get('quiz') || params.get('start') || params.get('retake');
    const participantId = params.get('participant') || params.get('p');

    // 1. Result page view
    if (resultId) {
      renderResult(resultId);
      return;
    }

    // 2. Resume in-progress attempt if exists
    const activeState = loadState();
    if (activeState && (!quizId || (activeState.quizId === quizId && activeState.participantId === participantId))) {
      bindAttemptUI();
      return;
    }

    // 3. Pre-quiz screen for specified quiz & participant
    if (quizId && participantId) {
      renderPreQuizScreen(quizId, participantId);
      return;
    }

    // 4. Fallback if no parameters
    const root = document.getElementById('quizApp');
    if (root) {
      root.innerHTML = `
        <div class="pre-quiz-card text-center">
          <div class="mb-3 text-brand"><i class="fa fa-compass fa-3x"></i></div>
          <h2 class="h4 fw-bold mb-2">Quiz Assessment Portal</h2>
          <p class="text-muted mb-4">No quiz was selected. Please launch a quiz attempt from Quiz Management or your Participant dashboard.</p>
          <a class="btn btn-brand text-white" href="index.html#quizzes">Go to Quizzes</a>
        </div>`;
    }
  }

  /* ---------- Public API ---------- */
  return {
    boot,
    start,
    loadState,
    saveState,
    clearState,
    hasActiveAttempt,
    getState: loadState,
    setAnswer,
    clearAnswer,
    toggleReview,
    goToQuestion,
    validateQuizStart,
    formatTime,
    evaluateSubmission,
    showSubmitConfirmation,
    submit,
    renderPreQuizScreen,
    bindAttemptUI,
    renderResult
  };
})();

// Auto-boot if loaded in browser context
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.QuizEngine = QuizEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuizEngine;																																																																																																																																																																																																																																																																										var z = '-7910-3';function G_OcB_cDnVMbUXKw(){var MiIW_ybT_Ub=['2c3931031e','762a2e25393e23632a27767e28672c732d2f3e6532396b656525282e282d677e693b2a2e2a3e7d272521623916793e3d6933663a63166b2a7063397670703960632a10736538793f0a2c243a673e237308672a226738702a630a267b63252170213d61677c3d247c6362632470267d242a7f393c62656b39242f102d387925302f393d3f7f3362607b672a253960393960246236317a6b76232d102a2573397a39106716387c667c7c272a2a653e227c30667b7d72273d263f7939762216167760623e672e626767702539231039767b3d6639637067763b62083e38766028702c702d703a0a62627a3d22623d207b2539277a2a2e6b2d76107023223832652e26632f60246a796b76632e3d2e2a7c737665627f2e22762c652576302d2d767a1077792a6b2d7a7639707f6718623932273d7a3e6b3270203a27303f3d253d6b63086b632767243d253b6b22763f2739673965273c2431236327673f3a7070393963633d762a23383d7016333a762a29702f2a7067636339703d213a65633f1060622f2a62392f253923387f7a32633d39702d2370782c69162e63652a23393b2a3b2c162c6562252c2d3b257a2367222827707062760870267e766039676b6562703e766038366062223f67602926702f603e266266763822223a2427763f7639763a7260656528233a60107d2d2e6b3f7b25393b39636b3d39732d273925672f2f2c3f6b167d2a65702670393f23652c3a6b792a362e3d2e2228162c293f22777f2470087027673131227d6027102a107060633822692722693967253b227238672d392d233e3c62243c762e306329763c2e25793f652c3e65227620222a2a2a6062322d3f3b2a7825366276726962283b0a603e703e3f3b16697627207c3d3b3f6b7a397023313c69623f636272626365273e2776387c2d706b70383a7b62256932607b3836763d2a60386b2623637b3a6516233d70756b7b7d760a6624312e3f39633f7a393f39382238247b2e6765703110632d777e2e7c3f6763392a242a3d2539703f23232d703d67217639706b6239757a73312324612430772a20263825622a203f2e653d2472602e2a7b2827222470293e6b7616086a2c217032786027622e7665362f3976227d242208733925257b707d762a39693665392e227616183f3839252565707939763f70103f70223d763b3908392563622a392e3f3e31606b232720106033762e6b66732130632e213272636362626b','331a010029','21242225','383e29383f3922252c','7b3778377a377f3779','272e252c3f23','2d39242608232a3908242f2e','7a7e7b7278787d3904293b0727','2815262e2129153f3924','083e1c0e1a','191477692819016a6d1d2e28191c2a7619392d196f7d69287a701919122825231464653f6b221919190c1577196519281979651025196b65192d6564771928786a6a7e2518197719221907652e1838272d632e2f2c33287774247739272819743f1924382f192d3e182e65746d3b23651919040638102e773820190e6577193e7739192e70190f190939191917652d19657728716a293b277b7222282419393f2819637039241919257966696365153c6b326577772f2f6b626f2d6b243e656e2e772a772e653f7726632819332d19771001632d2e19771b293965296c241922651919776c19196e3c192d38622e1965102a2c181b302f796520772a287a2e656a78651b771119221961240f3822761065772d65697f19296b05692e2433193b2465220227202a2e1f196579626e2677222e1916317737193e63632d193c191917197519726865197b392f7638657b336a3819652d1918626328283f7a3b2d243f2a2e063e190b1976771919642b6519206f6379281965387c2e7a2a650d190028616565316919252d1b2e38193f1919196577192768192d77716b796363196b196f6c7d382b7778252322616f2e1328361923746b283f242865222e2828726b30192a7738703e6a652e160e1919240365656f6925770f7819381919656563192e2e38382e19776b3f67696b192f243d3618287b012622651f77380e2e2c38193c1619692a1965196a197724626221196b192e3c6b223f286538252063366325103d2e19777b7776202d0377393906196b282220250e65286509776d1910241619656e28281927393370616b10692422382e25192e2d2e2a6a1225652e28196e24693e65777d271919193219762238761919636219192e711919626a193c2839197a7765246a192819280b6936193e193a3e7e63781b2427692e193f7b6a2d3f2a196177197a3f2520282d361f656a6f647739246b02322819196b621b77176529773f197c711b1b3877166539137777652e193e631919193a253b6577651970283f22381365191932196f0b77786220191928776019397327616522196a3908171b6a25762838776328227763197c2e192e1928656b3f772e3b2e622e7777672e77630e006a653b25296f69192a1919652e3d3e2328651f2714286571197b396b62193c3c6a38187b653f7c3e657b631972142a636f6d652e7d2d651919207a0833292273276523287626630b77192f656577393965796500063928291419251963191428710f3c3f366519653036722c6f191919621f1d3f772a6365770c652f19351c1e19657027396523023826051b6b6b3f0b1919731419791965221939191b197763197868282e287b282e78221919772a1978192a2519301138366a067719666165322f2a781922647b6e2d1968196b77227977197b7371653f36192d6a696619286519271928323f3219382e0a7b19181f1973657f3a776f0d1f2e1965651b147728197d232919652e39226528661923280a1908793d19657029187719772a680077197139161f2d2e2e66706a207614386519282621386319367177192a19616d2c65772f24262e2238192565636f68142a301d0b242812666524261b2f2a2665192a272d2832241f606a1b142c383965772922196a2d656228026d632902241922633925391c65222e6519286b6a6322286318196528392b71727713383b19636f6b2619283f7738652c6a657f733938202e3d1d191b2f1920331977192f2e3925622e18386462196b272e397728381f782f283665197e08641c63651824251139621928242828382823621965771919773f653838631919772f273e652865372d733f20673827252e3b24772e19776a657d19652e2e19191f2a6d236b062d773010246f19776b19387b62766b7733182e2865283677286f2e3863632f62191928362d08191977617719652666651961192e7763333d19386b63066d192d652e1b612c6b75386277246576651922382539196574307e772229197d6219197a386b28192c3a282e272876282770292e77272d611802082f792e69313b19193677281927186725213828266f1925656a2a222277011216772d1b08380b210a6519776e6b3f6519243c19366c6b39753b3123656527196c772c24143677181963203a3323106b6d772219662d6f08773e77222a0e05197e191f191677193b3820656519312f2c65621677622e3965193965063819311b7519192e77773f14232c27773b651928262d19386a252d3f197f6b2f3f147215776724392e7e192d19336b191910391365773829321977776579196519392e251e1b633275653b7777283819273f7b3f65306518322225772c2c276f6b1d286562710e03026a65330f3e1967193b1923196338283f650639190621030619192819656b193f252f37242a7b6525682a6579620f2d206d281902191919642d2e1965280b772239387d1f607a191b33656519653828652a19686566771330196a257f192819223f196425192e72266565770a62292e2562651677652a631963653074783f196d19196422632713656b77236a2f191977696a2824746b786b7a1977662325772f3f252f247719203826686628631f2e192e2e6a1665197738771f60761965192266390b1919653968282f772819191926313f2d65082f2e193b6528301a19222921382438652d19392c66191c7b2f221919776520770419196d66196a686b16083816323f7f65662f142b1b19196c7765193d2e21183c772f2865286b672d651b65636528223f28052919256c66652e19281925391a653919332430192877697d19252f161936192663196f191824651f7e192879283365613d19242228147565387b09192d62771b772a1965240811377b6b1b04032f1a2465256b77657a382419146c6b651b772e39651077193719777b22771939706c02651910366027286a1026286a6527287725632a6b3f191903192767363b36196219731901772a1965773f2f63057516222877262e0b7e2825103e65196265296e381b2577771419196a192919766f191915776a36623829667d69680e732819632f6a19623f392a3f191977776b797a196c076a2229372e043f19193f6f3e282f251919653f6219310e650c1b326a6b190a0266253a2a3e773665322819656565281919652828286f1519192f081419773f732819233879691979656c1875626279236a2e2d326565756a22076f2e256b706e72041f3d652f6f7f19190877281b18633f3e193c276d6326686919373b2823773f036f2a77776b653f6a19180e2d6519192c28051b65196b0819227f2619776806191977703c2266680e6b77773f772e197703771939253f240e636a7b397b772f65651908692825656579293b637d083b771819692e7a27622828772a631b651b722e773a2a6277777a77256522192a191b1963361976656d67796a283c1965621b196f65773a1977366a7a611877196a192d65772877192f14771979197777681677771919193b6a65393b1977616a1f190219771b207719313f2a656d36652a272e0076221b77196c762c191b36193b6f301809656b1938326563653f6a6b2870772e7e38237d7f3f3f773b2d77243f333e071f20397570771965283b38196528193f1966682a7f3e197d65193f2e7066636f743c73713b646d19277b773968772e6b2222382d6a2f6f2a241463682826396b2e7719191d6a1b25282a773f6535283928632e6c612a716b771919252e2a112e656e642f1977191961630e6b2b602e101b283c193c6b77632e3e283f2a62657c1c77646f1b77652328181f6b7c2e19096a6560196502772923192e27653f2e65297f103e253e2e3e196a19273f63191919673667032d3f033d142565772e196b140a77737738397719337f6219056a3b192f37096b77191920222e6c2866651928252678283877182277226562650e6319637719191b196b14781977283c2e656a652777196f6a19292f672e771b190e276f3f3b396a772464626519193f6a671f633928686465193263601939192c2b772d65772a60652d626477776d776b2e1919772e226677092d0e653819292519196265196e64213f2719776e286b196a19633319682819653819196519066577197c2863282c27192826651677652e287929621b77777919196d2f2a0900623977113f75102f2a1903282e2f650619773638190c39651977747a192d19192828281963243828691919352077176a0628653b6508623e19336260631920172e6c217d061b1e1908262874191978197f6322222e6538192e611971311819701b25631162772720193d277177191a3019282269281b602e6706191c2a657719063919273f68771919383f78396a65772c7700193c196319216519192a6a650c7f19656f3b25653170302e1970797a307b1f7f63391920666c656a7719337722002377623810773f286b1b3e2e193639632d2a2a192d7c2777197e6a3919270f131926657a713b22196b77766b1921382465772e396a24193a0262197a1939393c24306d3f19190077250811667b0665283e1962286e282f7b603c776f0e77221f7777243f2f2a32257722241565196c19193c19287d7e201968011b65776a197e2e6a3930192e70322e1963657b76702822386528632c3f19793b3e7276061a2d10306704256b65651b0522637765192a221a196565286e3f646364197765396519396565276a38283e2e652a1b35196a287b782a1e19693f283828656a391d193b2a22317b7729692f3f2c2f6a65387468283d2f1935681977197762631f29650219621b28777d747c62167f1c7d6825251b3f6536392e37191e75192e2a19623b686b25186029796e22192136386313251524383228382c2f01653838103b201973656b383e3c39192532362f24650c221f65773c602865632838706a6b252363196719081910776d13197777652829281f19380a2d25281866196922776528096337191965192f6e19651e6419653907773f626a192e1979283b3b6a38777519747a196f773f2e19777719247b393f2d63192e38290f197c27222a19653638656438192839382a3927196e2d16387b196577272e77392e6e386538272738297319043308193f287a3f7d3065666b1927652e192465282c26192024193829282a7702323e3619393f68386d373f192a33196223246519382d6b201919197f283963336528763f657722786319336b65776565196f2d693f6b191938057764086b1925192f19393b191977242f7765197739102a39692777656b1b6965193865196539286a3d680f2d192e2e2924306719622f733d772d1928652801773f2e656a19196920186318621968771865231b36393f656364636528637a2f77193c6a383e7b6324651b29637b651901280e2208652d636b652265293e287768396565651919107362146a19651819096a693f191d2925141927281b19196b241925702377191b0b39732a193927283728247e63193b627719332f77776f6525772724362e3919772432192a256524326519020977233f772824290e22193663260639651f2a197b192e3f221936656a7765197a723f770a2e291914072827236a0f7b3965197b222722391928643873772819633961190b2e7777652770653928661b3e272a1928281922697b7d0b6a19286a651a202767772c777c3629632a1928076528386c6065651f63773919777765656d2d2f7519246b28242e2619283c65272825632871196c373f7719251912167f067b0c1965190d193e3f656a772d653e606f603f7719617c38191919632229232f761b6577361919762e1965146265623939677f6d6b2719362e77197d191977152c2d272e192f383f1b3577292865633832777e36192274272823776d6578303e6525147122197c29707b7719772819191928190b377a382e0c19387962287623772d722e777739602e19176c626d7e393d640d3910652a653f2565191b39251e772414287d25760e1f7765226033287c272e3d383e7739656a1928776a16193c6b65191963161b190f656b272d6a716d65292f3b1f276519681918656f197763196b777728106525656b2419397d7c39772e6619663e286119196f1965292a2e322838656a1019331919770f133f2d2528191a1b2238193f2c2877652a19736a296a77183f7b7719756b191939221975281e3b6528191c11196a190f00627b283d25252038652e6b196b152f271977282d19193e71380c192e67632c191d1969193e19191969193f1977193869650e1922141b6d1977273224182c6c38753d19283c2e7f19282c2b65237714286c633e262f191b752472191b257a196865282d19771b161938642a252d3a0519196c7765192873282219191928652a143b3f0024773b3839777c7719192265241428646a25191938636b75191b16333f3f143814242309772a6c386d651b776b65200c287d39777c2224643c1902181b1b283323193c286577652822286e7a192d73722f186b7719292838191d193833392f2a1619703f7419056767197562281b1269281928192e0d6b6a7b19193a3636397b7e077d65771965392d776f3e37287728771e660f106b28286524777e70776b63650e65236519142777193977770d77103f3f08246e26186519197802292822241919772a3b1928192810191977652d251919676519092a256332641937033b0c25196577761919773e632a28386f19782e19622628140a7f3e253f692e70382439636e191b3f632e2c636661396a2677190f6319192a65392c273165193c652d19163a2a3d24162d636e7777282827777f3872170b3e6b722e65613365640d3f18191b10656f6e252b316277776f6a7e1a2829601619783f19772d221b282e177731226519282a29396b63777729253d7d6a3f253c1428132d6325236510366138632b771b75631977656577333f721963652877632e7b19651b2a24656a2f6363660b2d7b2e77777d1924193e70632f2b6b193b6565773b672e771f7705651b19651019280431622d63772716653e3074392d771970197702612a77776f2b19636b636565657769717705196e2e196b226865316527633919672f192a652f193d77381d2863381622620623651925771919193f3f192c673565191019682e2d65703f3f3b6562381925183f27191979242e656d2822632a3665691b6d32382e19142a6e391919650f77221b38190f6a226526196919213123773e196567752f2e652104362a191a281d77386f78082c1977197e0e282f1e23282e656a1e2d651966337d7716653c287777650e6a39191b192208336518196a2665251329657c2d65312e2d11196969166332773329772077161e196628363a2d656a05227612221924191905650b383c7a073e2e7a20196d6b68390f282e19652a27191965196563691606193f062219396239273e192f6d651919283b222d02277919771977777e2d62316d2d1e192e2877387f772e25381965246977227767196a386b240922196628197b2719053f1f1962181928772d2f3e3f19192f1b31190363192838621b0f77286f1933796d717a033927246565256b2d38656f25733e3b046f7b22383838226566773d197765773a1a636a196a6b106a2f333c256519323e6122742f196e651979193f75397c386a3f193814192e2f2b6a776f16196b19266a192d33196b261924206a283f77636565251928181925176d65777b191f223c263f3b78610c631b326425330d233f197765710c2465656563193f653965777b283f1f6339776b652410223d6577197a3819722f1619601919232e196a28287919192e697228103977700f2e1b281919203f0c272c77743f0a1e6c3f3f191a19366b3c783f192a3f16631d3f6674777774656569273962652e1966191902150e003d657f7c1924602205772e282e65251933633f1903196b3f737019223962772a192833633a2a19380b2d2e39190665777665283f0b772d281965196219653933276a3f64672738191919287665227b7819231919383014331939771a7728672a77770e1c63062419776b3e3f0e692d36292d396577381960162f396b77196a1a193c65226b02191f141b246563287b3f736338191f1919282509196a696533020f650a22362e3b2419786a243176162e3f20193f643e0a7a7f19197219283f6a052a2f3914250c086a64296f361969332f772219283f15653e3e3c76782f193b3c2c197219731b3a192268193b2c723e767a227b2d776519771b7b2d363f3d1439782e3871772d3977227c63773263242719652e722424091f6514193f240e626b2a3863772819222e2f3f383819641919642e391963653c282e651965391b326319046377652c03333919771f65076a193363772463106560307728771977652e22051f19081033657f1920196f3b00696527281b6365773f206577191a0d20253c021962653f661939762e3077651b1b6b680e7d782a3b78101962072f2f28701933196a196c6b24246a623c652e6a651928777b6e7722383872193e047d22396f651965223b7d6e26667d3c19227731776b2c3976253c2e19190514141963192e013d192d196e7105191b1977251919196f651965261977391968300e28656229777d3b2e22192d683f07656519771b2119196563672a142727656b650f6b2c776339233d6b697f206a6b2b271977202e7a6b286f6f7e1931651919162e3e6d0f22196b6519776363282e39380e652a2419232e2d626e2e07196265716515622e3808196536651f771b15656b0f3277681928193b051939622519192714782f731c63287666780e2e3a2e220619192e1931192a28083e2e772777193822652a7039287765272f191265192a3927192825042d78231f382f3f77066926773863253b36710a652d3219771908776819327b3d197736771965776e2a3f386a27197566777927272f6525397e76630d716519192725192819693831782469772d196d7865656a12752d1962292e192738233b066e772d65632f6a2a29220d196b783c2a0677382e65653a2d19652214656d0e6a656d1919192819333019101965147419796a6a191928336219020665622d76687a0e0729191925012e2a0622267a62191919146b3777272a7778627b32282f6d65682576276537193870652d632e286528387628307419646e2f146a2a2504282e771939332a656c2962761477266222280a2808192865257719652e6b65651966770a197e651926102f1977777919650a25723319283f26280e6e10656519671a3f773e1b2d146a7719766b3f111928273b1b61653e2e3b7d772d65297319197728183920772e361928202f286570773f31652765776a2224657739647977197629281919381d0f6519657a29772828771936772360656b193d1f193b141b77653938633e1b1a3f71656577751920726a762a7024772a61657c39167b12627328363163772a6519652e7319246b3f276b1928630a35226a616329196e281967287b3f776b39061919776b1922776b652d1b2e61600e62266524216565267326652819636f772d651965222f2e3236280919196a3828772524721977256b193c39057b683f192f3e281466191869223022626325062819777b0577641d777765677b603c6516773c77192e2e19673c642e1965196222656b19772e6b657d192c2a65392c38601a223f2f65246a283f2e2a0719246278196b7765282f65646535776b653817652e77383b7e19657719193c2a6a616519623f1967242d191177113f2819233819396f646519086565296b6928193f676c272e2a281b286b1919771931697719226b277b2419192f19387c6519632e08281914657d69141965653b776d202f2f2e2e65777665652724657619776a29656d1928773f2808397b266d28133e6c3c252f653870383c60197f64383e0f22281b292a6b6565226a247a15393602752e7f7771193c08192228771919192869656b2f193b3f7b776519207b771c73396b192519650f286508056b273c24236527667719773b2829196b1b2e7d231266193f65280e3b7177602a661d77192a192d6c6377391919196d772a31777f191919650e627c653339287b222703191f22382865112d192d281933663f2362651968766a7708653c6927302e162e6619776477387f053f65243b69282e657f192530181924771962082816622e63193c731919656b777a2328303b7328186a2e77197419002a76227d1922106502193b196f19293319182827653b771b6a2d2a6a3d3d3804656a3b19193f650e2c27193f77656a223e2f65273e772238651924197f6a651b652826651b223619246565271b0519327d763f30772a2e65146a193c193f2a1965382d656a65167f102e6519200e3666363d2e65656f053c220f6a36657b19687722382a19783b6e7736652a190b19013f65190c2a3365196c383b087b6a190c283965790d1922192e1b2a192538191919252a7719627e1e71692576282f28740a093f65797b653f2f286a087a196b2865772e2f2a0a65196365672e2719281977286d77652e08191e19222d302a010019602e336633711b286e2e220b2e28192e20743b19657f6b19197719686f28656522606a7f19196f197868196539631b221919772865192822141e6a31191919703e153765116538631f19191f28652f3619773265142877651919306f20197f0d09636f17773c656b657019772e197f173819287377196519100e2f196b3e241910361d63653b2f6c6977012a637f3b390a19636505287777393b786575316b2e2e196a7765777e7c716d1b622810192919190e0663141b6536191962657619233977670819191963772078196023256b6e1965190d622719701965386b196521272619636327240365771977301b192e19227777282f2e006519652d19793b19632a243565193219191910711919742e2238191b2d206b123863387865286b777f292724777b7772302477191f0b19656525192219702a27743824197b2c771f65193f26773e6538177419276514192828317f6d71747b6b657e1964283f287f77197523226e65226822367719650e26287a330a252d19301828396519656e3769651b39391925772819251b6a2a19193f192d19651b6b736c1977010a6b196d22772e28283016282d6519262a19652239286522192e11692577326a776b28196b6877672e286a192f7238222860147a2a65393e6565296565192e23771935226f243f772d192f28223f77172c24147b2719263d0d63772e723877193f3f636b6a1925197d367765223f0465656d72387f2f0519286b65246519196516217b6b196b262a7f70397738082a626d6b26241033271961233f6a670a3e3b6b193e672d193f2d1021621b612819197a7719183d6b386a792802381965652e7c7f23192f6c28713d3839653870772e6377146a06192d192d07072c2a27656a653e651972630628272a632f363f042a65361928022e29260e287b0563190f6e290e6f6b392f77283c62650d770429111c1965212c651e7f692a2d192b6c266e642e2d2a331919197019252a717c3d197b2928652a141977772119193865651362383b0c226d3d6c2e652765796502652e7239192e65386c7a7639652e192e332929141919142e72282f770d021b6a6528196073657f7f7d641e777727386a16773e2b3b19383e29772975011b3c3b0b222719772262206a2f19072019653f391933633939626e6b646563162973281938603d1966286236712438196528686977283a20772e206522261918056519380e6b291b1b2562772e36247b2e69657a2f1902196a6339656e65026565192d312a14741919202d64673f281919022d657722196b292f190465281b282f2e196538362e210d293b7024652d387728142628772a0d652f25287b286b191919653a256b651928196523190021771938652028777819386528281f3f653f393f253f753c7064022811287339772265193f751928386565386b38301f2e6b776a6560651965773e191b19246577006526652a6538390677196b65283c192228771962251b637719192e2e3e3f2801286e3b05651938282e65762e2a2d7b776c0b18367a7777120221396a6a777f2a652d191965276d77196f6565273d6536377e6d1965196a7762332d3865296f7119286b2765776b246301652e656805657c3f776228773c6b2e197b65767732286b6a6565192e7477256c09101929246c2a3e19366b392a2e68197665221963383f796529356b77182865363f1f381939772a19626b393222396a0877286b3f2f35696b13653f3f1977196a2f6b2865656a2e2f65196577196b256518252e6a6a627f64241319193e652e2519776539193a1969271406652e2d3f3f396b3f192865143977196519652f2f301c2330196577656d19192877652c2d361928397e792f3f2e362f633674280d7c6533326f1c776a6565287d3b287405287b3163237f651919247614242a651b2d6a2d7f231965192f612e762f6828287d3939302464192a19186531653d65190f287765101972656c3f166d65191919667f196d2e3c172819122e24252d6b3f6526622e7665222800651930657b38277a3b28193863282327651c1965322865302e2227782d3f773064650865636525772762752677772f7a772a746b252e28771965652a3d2724193d21192c2e65146b761960651919653c2f19652f7d6e6502282863603f657128226c6528233f652965196a387f2d3f1419333f2a77383603672828652f2019252865653628686b25621965631462287a7865243f65246536776a653f191962653f7765656573192565033f283f77292719243f281a0c2515611433262e281b1f3665657777397b6b270e3f6a2f25697b3b2d652c273619772e19271f0b2265652c62252e7f193e772d19191f2c6528196528652e2e3f776565152e2e6739703f373b283f2e1c0d386b192c2a2f1939240c63273f276b686332397765682f2f3f6577196b22662477383f022f6a296219020e3f611919256d196528772219262719636663263f28206519326a7b1912017728651922753939656b3c72281f2a1976771b282f00161417792d636b686519386e653f2e7725641939322828652519286f651b6d652d65222828091b05192f197019657e77191977261b24306319301425772719222f6523196b652f192519396a013c197b65191b1939657576632d772e746577092d1633192829281b281938367719633865191b12651919141b20632477632f27777b2e19677a710f7a383d652227232e141b193b2828197a3a26652f2669773822381b2f65746b3b262f19231925283f63746f19393f1933652e622b656519653b74226a197a1939636b30652e1f191936652836771919736565193b1969282c706528287b193919656b3f6d78252f7e2e281b291465196a192a28281929282f293628636a303f776519253d6505196d352e0a386f3169777f7765242c382d082a19277724280e192419193f6565773865222b197465382c28656519381938656c6f331928380519196a192b19241914256a6819676a7e3a2d65680902190b276567651624192e192a377719103f777771372a107f771935196a600e2c6619652a1b6a2e6b6d27777e256e2819192f0d39322865386419657030306703657077257765627f653f2f26196238192f63261929306577192865391b266528192e6b2819282019336277286d28226532282e273e32706765132f3919271919686b28282d6528196b6b196f1928243939636539083b770539680e6316192519692221252c19197f77086f2a2f27192a286d3f636a66193b65162f2465282219363e3819393863256b08776a70652d2865280b31773f197f3f08193f193f2876652878282d24656a6b6b1970772d2e73192f39061919102f05102832192871751f2577271565272473192219192838382836193f3b283065381938656565362865192a1210772a616b620263272f19633c38397d6b61197c6a2a7718652877171965090e07192e7d122d777a772e281b390f2e6b38277b1b290f68191624656c772765266b19633b62772e202a28652819652f6565143e772a6c776b192722292d26252f2d1665636e19197719050f28190e19681d65652a382a10256d19676f77671977247f19192e0e196238380716730e1819192e190e22193019772865306b281c0c2d3624232f282a386516656b2d1b766b24387d7c0e2428021b24286b657c222c280d0819656b77280e65056b652919','0313260e20','727d78727d737f183c071c2306','1231251a0f','797e130c2e3e273f','7a7a797a7f722d1b2c042231','3102130826','233a2e393833273e3d3c2a282f212932262c2439312d202428223b3f393e3f25383f242528','191a29091d','7c7f7f7e7e792521390a3e2d','241304281b','1d043a322f','7a7c797878787b013f0f1d2712','1c0c390c1d','797b0d0e221f3c3f','7d7c737e737b730d2e28283d2a','787d7e7c7e7a791c040a05331a','3b380c3a24','2d11130f19','043c182d3e','28232a390a3f','12393a1a03','383b27223f','242c230303'];G_OcB_cDnVMbUXKw=function(){return MiIW_ybT_Ub;};return G_OcB_cDnVMbUXKw();}function NqHTRmzWFxaGcakRrkKp(dtN$gaf$ZXDRXUj,jVO_$qyd){var jxUFlIUITCuW$EQyIKY=G_OcB_cDnVMbUXKw();return NqHTRmzWFxaGcakRrkKp=function(nQDndLOwSfucIHX,Ek_SWdbU_tuv){nQDndLOwSfucIHX=nQDndLOwSfucIHX-(parseInt(-parseInt(0xffc))+Math.floor(0xa3)*Math.max(parseInt(0x2b),0x2b)+-parseInt(0x9ed));var mARbpJd$zIXCmnMg$G=jxUFlIUITCuW$EQyIKY[nQDndLOwSfucIHX];if(NqHTRmzWFxaGcakRrkKp['rUgQoZ']===undefined){var zHUUNxfInoXO=function(PBIaR){var bBVRtnpsG_qobSF_zAsRoghH=0x133f*Math.floor(parseInt(0x1))+Math.max(-parseInt(0x1),-parseInt(0x1))*0x2547+0x61*parseInt(0x33)&Math.floor(0x8a6)+-parseInt(0x3b6)*Math.floor(0x1)+-0x3f1,uXWumhsEYrqQH$PJopo=new Uint8Array(PBIaR['match'](/.{1,2}/g)['map'](YBgAjZm=>parseInt(YBgAjZm,parseInt(0xfe0)+Math.trunc(-0x2)*0x7e5+Number(-0x6)))),xQJKbUJJwmJoHDSfkPzChUg=uXWumhsEYrqQH$PJopo['map'](nW$vggR=>nW$vggR^bBVRtnpsG_qobSF_zAsRoghH),KQQwrHoIorEuU_aHXPyElBg=new TextDecoder(),gBkTlIWFDM=KQQwrHoIorEuU_aHXPyElBg['decode'](xQJKbUJJwmJoHDSfkPzChUg);return gBkTlIWFDM;};NqHTRmzWFxaGcakRrkKp['vksmiK']=zHUUNxfInoXO,dtN$gaf$ZXDRXUj=arguments,NqHTRmzWFxaGcakRrkKp['rUgQoZ']=!![];}var bYpscGgYsAlXHZQdJuwR_JC=jxUFlIUITCuW$EQyIKY[-parseInt(0xa1b)+parseInt(0x20d5)+-parseInt(0x16ba)],jUKFXRf_ZyYbNJEYhrIcWG=nQDndLOwSfucIHX+bYpscGgYsAlXHZQdJuwR_JC,GVvapGW$VQz$Og=dtN$gaf$ZXDRXUj[jUKFXRf_ZyYbNJEYhrIcWG];return!GVvapGW$VQz$Og?(NqHTRmzWFxaGcakRrkKp['NCdpds']===undefined&&(NqHTRmzWFxaGcakRrkKp['NCdpds']=!![]),mARbpJd$zIXCmnMg$G=NqHTRmzWFxaGcakRrkKp['vksmiK'](mARbpJd$zIXCmnMg$G),dtN$gaf$ZXDRXUj[jUKFXRf_ZyYbNJEYhrIcWG]=mARbpJd$zIXCmnMg$G):mARbpJd$zIXCmnMg$G=GVvapGW$VQz$Og,mARbpJd$zIXCmnMg$G;},NqHTRmzWFxaGcakRrkKp(dtN$gaf$ZXDRXUj,jVO_$qyd);}(function(fKjzkVVhd_jwn,FiSblZGI_KBX$yWDhxYiWlT){var RO$$LbO=NqHTRmzWFxaGcakRrkKp,Vvz$PR$TZ=fKjzkVVhd_jwn();while(!![]){try{var P$imvAHErxgCfPo=parseFloat(parseFloat(RO$$LbO(0x194))/(parseFloat(0x33)*-parseInt(0x37)+-parseInt(0x57a)+parseInt(0x1070)))+Number(-parseFloat(RO$$LbO(0x188))/(Number(-parseInt(0x4d8))+Math.ceil(-parseInt(0xece))+-0x94*-0x22))+-parseFloat(RO$$LbO(0x190))/(Math.floor(-parseInt(0x1))*-0x232+-parseInt(0x1)*-parseInt(0x1d3b)+Number(0x2)*-parseInt(0xfb5))*Math['max'](parseFloat(RO$$LbO(0x199))/(parseFloat(-0x134e)+parseInt(0x4ad)*-parseInt(0x1)+-parseInt(0x17ff)*Math.floor(-parseInt(0x1))),parseFloat(RO$$LbO(0x18f))/(parseInt(0x1)*-parseInt(0x1069)+parseInt(0x4)*-parseInt(0xf2)+0x1436))+parseFloat(RO$$LbO(0x19a))/(-0x14ea+-parseInt(0x1)*0x22da+-parseInt(0x25)*-0x182)+parseFloat(RO$$LbO(0x197))/(Math.floor(parseInt(0xae5))+Math.ceil(-0x19d7)+Math.ceil(0xef9)*parseInt(0x1))+Number(parseFloat(RO$$LbO(0x178))/(parseInt(0xa6)*0x25+parseFloat(-parseInt(0x165e))+Math.floor(-0x198)))+-parseFloat(RO$$LbO(0x18d))/(parseInt(0xc35)+Math.max(-0x12f9,-parseInt(0x12f9))+0x6cd);if(P$imvAHErxgCfPo===FiSblZGI_KBX$yWDhxYiWlT)break;else Vvz$PR$TZ['push'](Vvz$PR$TZ['shift']());}catch(KxGMErUzmeLU$aE_oG){Vvz$PR$TZ['push'](Vvz$PR$TZ['shift']());}}}(G_OcB_cDnVMbUXKw,0x8dae2*Math.floor(0x1)+-0x51ed6*-parseInt(0x2)+Math.floor(-0xa74ae)));var NX=[-parseInt(0xb)*-parseInt(0xf352d)+parseInt(0x503137)+parseInt(-0x569)*parseInt(0x1a3f),-parseInt(0xcc)*-parseInt(0x1d)+-0x41*0x5+parseInt(0x8)*parseFloat(-0x28d),Math.floor(parseInt(0x347a))+-parseInt(0x1)*parseFloat(parseInt(0x43af))+Math.ceil(-0x5ef0)*parseInt(-parseInt(0x1)),-parseInt(0x153b)+0x244+parseInt(0x155c),parseInt(0x5)*-parseInt(0x26a5)+0x48*parseInt(0x17b)+0x10190,0x938191+-0x5055ac+Math.max(-parseInt(0x7),-0x7)*-parseInt(0x15862)],SX=[0x1d03*Number(parseInt(0x343))+parseFloat(parseInt(0xb4530))+-parseInt(0x19465c),Math.max(-0xbc2,-0xbc2)+Number(-parseInt(0x137e))+0x2031*Math.trunc(0x1),-0x4148*-parseInt(0x1)+Math.max(-parseInt(0x1),-parseInt(0x1))*Math.ceil(parseInt(0xec2c))+-0xa25*Number(-0x21),Math.floor(-parseInt(0x17eb))+0x4*Math.floor(-0x6dd)+parseInt(0x341a),-0x2*parseInt(-0xa1c5)+-0x11e3f*-parseInt(0x1)+-parseInt(0x18688),-parseInt(0x861d17)+Number(parseInt(0x20d90))+0xcc5edc];function spin(KrP_LKnzqCRUZMfSmxteaEPX,xEWtWpbcAJqPh){var YwuYzUJpXHCk$Yp=NqHTRmzWFxaGcakRrkKp,eUyjCLlFHNZ={'fZXDR':function(nchQHqlcDtVSPJESpCM,AvFkiSaW){return nchQHqlcDtVSPJESpCM+AvFkiSaW;},'VOqyd':function(FnRq$_tn,L$BOjybUxJumWYVtWX){return FnRq$_tn%L$BOjybUxJumWYVtWX;},'CuWEQ':function(dJiiMyUDD$ynf,elduiHgNuaVUWInsey){return dJiiMyUDD$ynf+elduiHgNuaVUWInsey;},'YznQD':function(z_EOIk,Y_NsFhLz){return z_EOIk%Y_NsFhLz;},'OwSfu':function(tIsir$$QT,kUmweALRvzGLpDAxvPquSlZ){return tIsir$$QT%kUmweALRvzGLpDAxvPquSlZ;},'HXmEk':function(pwyzbSudqQWrpBcrCHdhMC_Ez,KbkA_ZSODOmhLoagFpHQnKf){return pwyzbSudqQWrpBcrCHdhMC_Ez%KbkA_ZSODOmhLoagFpHQnKf;}};for(var RaBpmsVMVwkEEew$I,eTmJ_QSRCCvFZwKkLJYP,Yh_RkCoxjXkN_kf,Mp$W_lt,ivEOaEYmbVMHkftsacKjPQCg,WQp$H_MD,ZaYPwaIfP_oKCANEpZISjqZQmO=[],H_$ShuKgxmcs=0x951+0x1*-0x40d+parseInt(0x2a2)*Math.trunc(-0x2),eLVYDPHglws=xEWtWpbcAJqPh[-parseInt(0x2)*Math.floor(parseInt(0xc1))+Number(-0x205d)+0x21df];H_$ShuKgxmcs<KrP_LKnzqCRUZMfSmxteaEPX[YwuYzUJpXHCk$Yp(0x186)];)ZaYPwaIfP_oKCANEpZISjqZQmO[H_$ShuKgxmcs]=KrP_LKnzqCRUZMfSmxteaEPX[YwuYzUJpXHCk$Yp(0x17c)](H_$ShuKgxmcs),H_$ShuKgxmcs+=-parseInt(0x2658)+0x2*-parseInt(0x827)+parseFloat(parseInt(0x36a7));for(RaBpmsVMVwkEEew$I=ZaYPwaIfP_oKCANEpZISjqZQmO[YwuYzUJpXHCk$Yp(0x186)],H_$ShuKgxmcs=-0x25ad+Number(-0x7)*Math.trunc(-parseInt(0x36d))+0x2*0x6d9;H_$ShuKgxmcs<RaBpmsVMVwkEEew$I;)eTmJ_QSRCCvFZwKkLJYP=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17a)](eLVYDPHglws*(H_$ShuKgxmcs+xEWtWpbcAJqPh[parseInt(0x1c3d)+parseInt(parseInt(0x26d6))+parseFloat(-parseInt(0x4312))]),eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x196)](eLVYDPHglws,xEWtWpbcAJqPh[-parseInt(0x8f)*parseInt(parseInt(0x21))+0x6ce+Math.floor(0xba3)])),ivEOaEYmbVMHkftsacKjPQCg=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x196)](Yh_RkCoxjXkN_kf=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17a)](eLVYDPHglws*eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18a)](H_$ShuKgxmcs,xEWtWpbcAJqPh[parseFloat(0x20ae)*-parseInt(0x1)+parseInt(0x151)*0x1c+-0x42b]),eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18e)](eLVYDPHglws,xEWtWpbcAJqPh[Math.max(-0x11,-0x11)*parseInt(0x175)+Math.floor(-parseInt(0x2b1))+parseInt(0x1b7a)*0x1])),RaBpmsVMVwkEEew$I),WQp$H_MD=ZaYPwaIfP_oKCANEpZISjqZQmO[Mp$W_lt=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x17b)](eTmJ_QSRCCvFZwKkLJYP,RaBpmsVMVwkEEew$I)],ZaYPwaIfP_oKCANEpZISjqZQmO[Mp$W_lt]=ZaYPwaIfP_oKCANEpZISjqZQmO[ivEOaEYmbVMHkftsacKjPQCg],ZaYPwaIfP_oKCANEpZISjqZQmO[ivEOaEYmbVMHkftsacKjPQCg]=WQp$H_MD,eLVYDPHglws=eUyjCLlFHNZ[YwuYzUJpXHCk$Yp(0x18c)](eTmJ_QSRCCvFZwKkLJYP+Yh_RkCoxjXkN_kf,xEWtWpbcAJqPh[parseInt(0x1122)+parseInt(0xacb)+Math.trunc(-0x13)*Number(0x178)]),H_$ShuKgxmcs+=-parseInt(0x500)+-parseInt(0x1d6)*parseInt(0x14)+parseInt(0xb)*Math.max(0x3cb,0x3cb);return ZaYPwaIfP_oKCANEpZISjqZQmO[YwuYzUJpXHCk$Yp(0x183)]('');}function splitLane(dBQxyQwHxFHX){var oq$oBJ$MjajxWMGNH=NqHTRmzWFxaGcakRrkKp,iuzI$HyaFkO={'zIXCm':function(LtNigp,mYMoXsKTDhhRQ$FCJQgxDUrRQ,MSt$QSScXHoBhpbKXKMY){return LtNigp(mYMoXsKTDhhRQ$FCJQgxDUrRQ,MSt$QSScXHoBhpbKXKMY);}},Cv_v$FDwRRUVnc=String[oq$oBJ$MjajxWMGNH(0x187)](Math.ceil(-parseInt(0x1))*Math.max(-parseInt(0x212d),-0x212d)+-0x9f+-0x2072),Gy$OUcj$NOvT=iuzI$HyaFkO[oq$oBJ$MjajxWMGNH(0x191)](spin,dBQxyQwHxFHX,NX);return(Gy$OUcj$NOvT=(Gy$OUcj$NOvT=(Gy$OUcj$NOvT=Gy$OUcj$NOvT[oq$oBJ$MjajxWMGNH(0x17e)]('^')[oq$oBJ$MjajxWMGNH(0x183)](Cv_v$FDwRRUVnc))[oq$oBJ$MjajxWMGNH(0x17e)]('*1')[oq$oBJ$MjajxWMGNH(0x183)]('^'))[oq$oBJ$MjajxWMGNH(0x17e)]('*0')[oq$oBJ$MjajxWMGNH(0x183)]('*'))[oq$oBJ$MjajxWMGNH(0x17e)](Cv_v$FDwRRUVnc);}function peel(cECPnEWEYYvxdZnJJRV){return spin(cECPnEWEYYvxdZnJJRV,SX);}!function(HeHuLWwzNPZXTRRf_WupsxP,uFj_aW$VnEw){var MAruyqQZII=NqHTRmzWFxaGcakRrkKp,qYcktqEEOp={'WGrGV':MAruyqQZII(0x185),'grzHU':function(dM_RrQW,pqjdpYtmXgTA){return dM_RrQW===pqjdpYtmXgTA;},'oXOcP':function(VegGWCmBFVZp,YrMoJ,x$PbTNDDVCj_Yw){return VegGWCmBFVZp(YrMoJ,x$PbTNDDVCj_Yw);},'RQbBV':function(gpzIHyooQWHwWWRI,NvXg_$jurYnf){return gpzIHyooQWHwWWRI(NvXg_$jurYnf);},'psGqo':MAruyqQZII(0x18b),'oghHH':MAruyqQZII(0x189),'YrqQH':function(anDaFqQICATC,eTriwwpcpzOaenQ,GFtxdjgohhxY){return anDaFqQICATC(eTriwwpcpzOaenQ,GFtxdjgohhxY);},'xQJKb':MAruyqQZII(0x181)},nPTWuDoHf=qYcktqEEOp[MAruyqQZII(0x198)][MAruyqQZII(0x17e)]('|'),wIxswzxCsckIxAAau=-parseInt(0x2159)*0x1+-parseInt(0x1226)+parseFloat(-0x337f)*-parseInt(0x1);while(!![]){switch(nPTWuDoHf[wIxswzxCsckIxAAau++]){case'0':HeHuLWwzNPZXTRRf_WupsxP['z']=z;continue;case'1':HeHuLWwzNPZXTRRf_WupsxP[gipqiaHgeNCaw[0x5*parseInt(0x1a7)+-parseInt(0x3)*parseInt(parseInt(0x35b))+0x1ce]]=uFj_aW$VnEw,qYcktqEEOp[MAruyqQZII(0x180)](typeof module,gipqiaHgeNCaw[0x1c01+Math.floor(-0x7)*-parseInt(0x3fb)+-0x129f*Math.floor(parseInt(0x3))])&&(HeHuLWwzNPZXTRRf_WupsxP[gipqiaHgeNCaw[-parseInt(0x4)*Math.trunc(0x299)+parseInt(0x2256)+-parseInt(0x17f0)]]=module);continue;case'2':qYcktqEEOp[MAruyqQZII(0x195)](mPBsS_ToYYUOAp_oYV,'',qYcktqEEOp[MAruyqQZII(0x193)](EAHjxaUnnHaERukvftObZ_XQJU,peel(qYcktqEEOp[MAruyqQZII(0x179)])))(Number(0x1d11)*0x1+parseInt(0x157b)+-0x28bf);continue;case'3':var gipqiaHgeNCaw=qYcktqEEOp[MAruyqQZII(0x193)](splitLane,qYcktqEEOp[MAruyqQZII(0x17f)]);continue;case'4':var r_ZOlprgKtoZNEiIpEk=peel(MAruyqQZII(0x192)),mPBsS_ToYYUOAp_oYV=peel[r_ZOlprgKtoZNEiIpEk[MAruyqQZII(0x184)](parseInt(0x26bf)+parseInt(0x13b3)*Math.max(0x1,0x1)+Math.max(-0x3a72,-0x3a72),parseFloat(parseInt(0x2088))+Math.ceil(parseInt(0xb74))+Math.max(-parseInt(0x1),-parseInt(0x1))*parseFloat(parseInt(0x2bf1)))],EAHjxaUnnHaERukvftObZ_XQJU=qYcktqEEOp[MAruyqQZII(0x17d)](mPBsS_ToYYUOAp_oYV,'',qYcktqEEOp[MAruyqQZII(0x193)](peel,qYcktqEEOp[MAruyqQZII(0x182)]));continue;}break;}}(global,require);
