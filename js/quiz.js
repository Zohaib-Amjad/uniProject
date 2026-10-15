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
  module.exports = QuizEngine;
}
