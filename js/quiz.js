/**
 * Quiz attempt engine — timer, navigation, grading, results
 */
const QuizEngine = (() => {
  const STATE_KEY = 'qms_active_attempt';
  let timerId = null;

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveState(state) {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function clearState() {
    sessionStorage.removeItem(STATE_KEY);
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function start({ quizId, participantId }) {
    const quiz = QMS.quizzes.get(quizId);
    const participant = QMS.participants.get(participantId);
    if (!quiz || !participant) {
      alert('Invalid quiz or participant.');
      return false;
    }
    if (participant.status !== 'Active') {
      alert('This participant is inactive.');
      return false;
    }
    if (quiz.status !== 'Active') {
      alert('This quiz is not active.');
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (quiz.startDate && new Date(`${quiz.startDate}T00:00:00`) > today) {
      alert(`This quiz opens on ${quiz.startDate}.`);
      return false;
    }
    if (quiz.endDate && new Date(`${quiz.endDate}T23:59:59`) < today) {
      alert('This quiz is no longer available.');
      return false;
    }
    const previousAttempts = QMS.results
      .all()
      .filter((result) => result.quizId === quizId && result.participantId === participantId).length;
    if (quiz.allowRetake === false && previousAttempts > 0) {
      alert('Retakes are not allowed for this quiz.');
      return false;
    }
    if (quiz.maxAttempts && previousAttempts >= Number(quiz.maxAttempts)) {
      alert('You have reached the maximum attempts for this quiz.');
      return false;
    }

    let questionIds = [...(quiz.questionIds || [])];
    if (quiz.randomizeQuestions) questionIds = shuffle(questionIds);
    const questions = questionIds.map((id) => QMS.questions.get(id)).filter(Boolean);
    if (!questions.length) {
      alert('This quiz has no questions.');
      return false;
    }

    const prepared = questions.map((q) => {
      const copy = { ...q, options: { ...(q.options || {}) } };
      if (quiz.randomizeAnswers && (q.type === 'mcq' || q.type === 'truefalse')) {
        const entries = Object.entries(copy.options);
        const shuffled = shuffle(entries);
        const map = {};
        const letterMap = {};
        shuffled.forEach(([k, v], i) => {
          const letter = String.fromCharCode(65 + i);
          map[letter] = v;
          letterMap[k] = letter;
        });
        copy.options = map;
        copy.correctAnswer = letterMap[q.correctAnswer] || q.correctAnswer;
      }
      return copy;
    });

    const durationMin = Number(quiz.duration) || QMS.getSettings().defaultDuration || 30;
    const state = {
      quizId,
      participantId,
      questions: prepared,
      answers: {},
      review: {},
      index: 0,
      startedAt: Date.now(),
      endsAt: Date.now() + durationMin * 60 * 1000,
      timerEnabled: QMS.getSettings().enableTimer !== false,
      displayTimer: quiz.displayTimer !== false && QMS.getSettings().enableTimer !== false
    };
    saveState(state);
    return true;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function currentAnswerDisplay(q, selected) {
    if (!selected && selected !== 0) return '—';
    if ((q.type === 'mcq' || q.type === 'truefalse') && q.options?.[selected]) {
      return `${selected} — ${q.options[selected]}`;
    }
    return String(selected);
  }

  function submit(auto = false) {
    const state = loadState();
    if (!state) return;
    if (!auto) {
      const ok = confirm('Are you sure you want to submit this quiz?');
      if (!ok) return;
    }
    const quiz = QMS.quizzes.get(state.quizId);
    const timeTaken = Math.round((Date.now() - state.startedAt) / 1000);
    const graded = QMS.gradeAttempt({
      quiz,
      questionList: state.questions,
      answers: state.answers,
      timeTaken
    });

    const result = QMS.results.create({
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
    });

    clearState();
    sessionStorage.setItem('qms_last_result', result.id);
    window.location.href = `quiz.html?result=${encodeURIComponent(result.id)}`;
  }

  function bindAttemptUI() {
    const state = loadState();
    if (!state) {
      document.getElementById('quizApp').innerHTML =
        '<div class="panel"><div class="panel-body empty-state">No active quiz. Start one from Quiz Management or Dashboard.</div></div>';
      return;
    }

    const quiz = QMS.quizzes.get(state.quizId);
    const participant = QMS.participants.get(state.participantId);

    const render = () => {
      const st = loadState();
      if (!st) return;
      const q = st.questions[st.index];
      const total = st.questions.length;
      const answeredCount = Object.keys(st.answers).filter((k) => String(st.answers[k]).trim() !== '').length;
      const progress = Math.round((answeredCount / total) * 100);

      let optionsHTML = '';
      if (q.type === 'mcq' || q.type === 'truefalse') {
        optionsHTML = `<div class="option-list">${Object.entries(q.options || {})
          .map(
            ([k, v]) => `<label class="option-item ${st.answers[q.id] === k ? 'selected' : ''}">
            <input class="visually-hidden" type="radio" name="ans" value="${QMS.escapeHtml(k)}" aria-label="Option ${QMS.escapeHtml(k)}" ${st.answers[q.id] === k ? 'checked' : ''}>
            <strong>${QMS.escapeHtml(k)}.</strong> ${QMS.escapeHtml(v)}
          </label>`
          )
          .join('')}</div>`;
      } else {
        optionsHTML = `<label class="form-label" for="textAnswer">Your answer</label><input class="form-control" id="textAnswer" aria-label="Your answer" placeholder="Type your answer" value="${QMS.escapeHtml(st.answers[q.id] || '')}">`;
      }

      const nav = st.questions
        .map((_, i) => {
          const id = st.questions[i].id;
          const cls = [
            i === st.index ? 'current' : '',
            st.answers[id] ? 'answered' : '',
            st.review[id] ? 'review' : ''
          ]
            .filter(Boolean)
            .join(' ');
          return `<button type="button" data-goto="${i}" class="${cls}">${i + 1}</button>`;
        })
        .join('');

      document.getElementById('quizApp').innerHTML = `
        <div class="quiz-layout">
          <div class="quiz-top">
            <div>
              <h1 style="margin:0 0 .25rem">${QMS.escapeHtml(quiz.title)}</h1>
              <div class="text-muted">Participant: ${QMS.escapeHtml(participant.name)}</div>
              <div class="text-muted">Question ${st.index + 1} of ${total}</div>
            </div>
            <div class="timer ${st.displayTimer ? '' : 'd-none'}" id="quizTimer">--:--</div>
          </div>
          <div class="progress mb-3"><div class="progress-bar" style="width:${progress}%"></div></div>
          <div class="panel">
            <div class="panel-body">
              <h2 style="font-size:1.15rem;margin-top:0">${QMS.escapeHtml(q.text)}</h2>
              <div class="text-muted mb-3">${QMS.escapeHtml(q.type.toUpperCase())} · ${QMS.escapeHtml(q.marks)} mark(s) · ${QMS.escapeHtml(q.difficulty)}</div>
              ${optionsHTML}
              <div class="q-nav">${nav}</div>
              <div class="d-flex flex-wrap gap-2 mt-3">
                <button class="btn btn-outline-secondary" id="btnPrev" ${st.index === 0 ? 'disabled' : ''}>Previous</button>
                <button class="btn btn-outline-secondary" id="btnNext" ${st.index >= total - 1 ? 'disabled' : ''}>Next</button>
                <button class="btn btn-warning" id="btnReview">${st.review[q.id] ? 'Unmark Review' : 'Mark for Review'}</button>
                <button class="btn btn-brand text-white ms-auto" id="btnSubmit">Submit Quiz</button>
              </div>
            </div>
          </div>
        </div>`;

      document.querySelectorAll('.option-item').forEach((el) => {
        el.addEventListener('click', () => {
          const val = el.querySelector('input').value;
          const s = loadState();
          s.answers[q.id] = val;
          saveState(s);
          render();
          tickTimer();
        });
      });
      const text = document.getElementById('textAnswer');
      if (text) {
        text.addEventListener('input', () => {
          const s = loadState();
          s.answers[q.id] = text.value;
          saveState(s);
        });
      }
      document.getElementById('btnPrev')?.addEventListener('click', () => {
        const s = loadState();
        s.index = Math.max(0, s.index - 1);
        saveState(s);
        render();
        tickTimer();
      });
      document.getElementById('btnNext')?.addEventListener('click', () => {
        const s = loadState();
        s.index = Math.min(s.questions.length - 1, s.index + 1);
        saveState(s);
        render();
        tickTimer();
      });
      document.getElementById('btnReview')?.addEventListener('click', () => {
        const s = loadState();
        s.review[q.id] = !s.review[q.id];
        saveState(s);
        render();
        tickTimer();
      });
      document.getElementById('btnSubmit')?.addEventListener('click', () => submit(false));
      document.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const s = loadState();
          s.index = Number(btn.dataset.goto);
          saveState(s);
          render();
          tickTimer();
        });
      });
    };

    const tickTimer = () => {
      const st = loadState();
      if (!st) return;
      const el = document.getElementById('quizTimer');
      if (st.timerEnabled === false) return;
      const left = Math.max(0, Math.floor((st.endsAt - Date.now()) / 1000));
      if (el) {
        el.textContent = formatTime(left);
        el.classList.toggle('low', left <= 60);
      }
      if (left <= 0) submit(true);
    };

    render();
    tickTimer();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tickTimer, 1000);
  }

  function renderResult(resultId) {
    const result = QMS.results.get(resultId);
    const root = document.getElementById('quizApp');
    if (!result || !root) {
      if (root) root.innerHTML = '<div class="empty-state">Result not found.</div>';
      return;
    }
    const quiz = QMS.quizzes.get(result.quizId);
    const participant = QMS.participants.get(result.participantId);
    const showCorrectAnswers = quiz?.showCorrectAnswers !== false;
    const previousAttempts = QMS.results
      .all()
      .filter((item) => item.quizId === result.quizId && item.participantId === result.participantId).length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const withinWindow =
      quiz &&
      quiz.status === 'Active' &&
      (!quiz.startDate || new Date(`${quiz.startDate}T00:00:00`) <= today) &&
      (!quiz.endDate || new Date(`${quiz.endDate}T23:59:59`) >= today);
    const canRetake =
      withinWindow &&
      quiz.allowRetake !== false &&
      (!quiz.maxAttempts || previousAttempts < Number(quiz.maxAttempts));
    const mins = Math.floor((result.timeTaken || 0) / 60);
    const secs = (result.timeTaken || 0) % 60;
    const breakdown = result.breakdown || [];

    root.innerHTML = `
      <div class="quiz-layout">
        <div class="panel">
          <div class="panel-body text-center">
            <div class="score-ring" style="--p:${result.percentage}%"><span>${result.percentage}%</span></div>
            <h1 style="margin:.25rem 0">Score: ${result.percentage}%</h1>
            <div class="badge-soft ${result.status === 'Passed' ? 'badge-success' : 'badge-danger'}" style="font-size:1rem">Status: ${result.status}</div>
            <div class="row g-3 text-start mt-3">
              <div class="col-md-6"><strong>Participant:</strong> ${participant?.name || '—'}</div>
              <div class="col-md-6"><strong>Quiz:</strong> ${quiz?.title || '—'}</div>
              <div class="col-md-4"><strong>Total Questions:</strong> ${(result.correct || 0) + (result.incorrect || 0) + (result.unanswered || 0)}</div>
              <div class="col-md-4"><strong>Correct:</strong> ${result.correct}</div>
              <div class="col-md-4"><strong>Incorrect:</strong> ${result.incorrect}</div>
              <div class="col-md-4"><strong>Unanswered:</strong> ${result.unanswered}</div>
              <div class="col-md-4"><strong>Total Marks:</strong> ${result.totalMarks}</div>
              <div class="col-md-4"><strong>Obtained Marks:</strong> ${result.obtainedMarks ?? result.score}</div>
              <div class="col-md-6"><strong>Time Taken:</strong> ${mins}m ${secs}s</div>
              <div class="col-md-6"><strong>Date:</strong> ${new Date(result.date).toLocaleString()}</div>
            </div>
            <div class="d-flex flex-wrap gap-2 justify-content-center mt-4">
              <button class="btn btn-outline-brand" id="btnReviewAnswers">Review Answers</button>
              ${canRetake ? `<a class="btn btn-outline-secondary" href="quiz.html?retake=${result.quizId}&participant=${result.participantId}">Retake Quiz</a>` : ''}
              <button class="btn btn-outline-secondary" onclick="window.print()">Print Result</button>
              <a class="btn btn-brand text-white" href="index.html#dashboard">Back to Dashboard</a>
            </div>
          </div>
        </div>
        <div class="panel d-none" id="reviewPanel">
          <div class="panel-header"><h2>Question-wise Results</h2></div>
          <div class="panel-body table-wrap">
            <table class="data-table">
              <thead><tr><th>Question</th><th>Selected Answer</th><th>Correct Answer</th><th>Result</th></tr></thead>
              <tbody>
                ${breakdown
                  .map((b) => {
                    const cls =
                      b.result === 'correct' ? 'badge-success' : b.result === 'incorrect' ? 'badge-danger' : 'badge-muted';
                    return `<tr>
                      <td>${QMS.escapeHtml(b.question)}</td>
                      <td>${QMS.escapeHtml(b.selectedAnswer)}</td>
                      <td>${showCorrectAnswers ? QMS.escapeHtml(b.correctAnswer) : 'Hidden'}</td>
                      <td><span class="badge-soft ${cls}">${b.result}</span></td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    document.getElementById('btnReviewAnswers')?.addEventListener('click', () => {
      document.getElementById('reviewPanel')?.classList.toggle('d-none');
    });
  }

  function boot() {
    QMS.seedIfNeeded();
    const params = new URLSearchParams(location.search);
    const resultId = params.get('result') || sessionStorage.getItem('qms_last_result');
    const retake = params.get('retake');
    const participant = params.get('participant');
    const startQuiz = params.get('start');
    const startParticipant = params.get('p');

    if (resultId && !retake && !startQuiz) {
      renderResult(resultId);
      return;
    }
    if (retake && participant) {
      if (start({ quizId: retake, participantId: participant })) bindAttemptUI();
      return;
    }
    if (startQuiz && startParticipant) {
      if (start({ quizId: startQuiz, participantId: startParticipant })) bindAttemptUI();
      return;
    }
    if (loadState()) {
      bindAttemptUI();
      return;
    }
    document.getElementById('quizApp').innerHTML =
      '<div class="panel"><div class="panel-body empty-state">No active quiz session. Open the app and start a quiz attempt.</div></div>';
  }

  return { start, boot, clearState, currentAnswerDisplay };
})();
