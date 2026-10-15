/**
 * QuizPro Admin — app shell, routing, CRUD modules
 */
const App = (() => {
  let currentPage = 'dashboard';
  let quizPage = 1, quizPageSize = 5;
  let questionPage = 1, questionPageSize = 5;
  let catPage = 1, catPageSize = 5;
  let partPage = 1, partPageSize = 5;
  let resPage = 1, resPageSize = 5;
  let attPage = 1, attPageSize = 5;
  let lbPage = 1, lbPageSize = 10;
  const pageSize = 5;
  const sortState = {
    quizzes: { key: 'createdAt', dir: 'desc' },
    questions: { key: 'id', dir: 'asc' },
    categories: { key: 'name', dir: 'asc' },
    participants: { key: 'name', dir: 'asc' },
    results: { key: 'date', dir: 'desc' },
    attempts: { key: 'date', dir: 'desc' }
  };
  let notifications = [];
  let activeEditQuiz = null;
  let selectedQuizQuestionIds = new Set();

  /* ---------- Shared UI Utilities ---------- */
  function toast(message, type = 'success', duration = 3500) {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    const icons = {
      success: 'fa-solid fa-circle-check',
      error: 'fa-solid fa-circle-xmark',
      danger: 'fa-solid fa-circle-xmark',
      warning: 'fa-solid fa-triangle-exclamation',
      info: 'fa-solid fa-circle-info'
    };
    const normType = type === 'danger' ? 'error' : type;
    const el = document.createElement('div');
    el.className = `toast-item ${normType}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="d-flex align-items-start gap-2">
        <i class="${icons[type] || icons.info} mt-1"></i>
        <div class="flex-grow-1">${esc(message)}</div>
        <button type="button" class="btn-close btn-close-sm ms-2" aria-label="Close" style="font-size:0.75rem"></button>
      </div>
    `;
    const closeBtn = el.querySelector('.btn-close');
    let timer = setTimeout(() => {
      el.remove ? el.remove() : (el.parentNode && el.parentNode.removeChild(el));
    }, duration);

    closeBtn?.addEventListener('click', () => {
      clearTimeout(timer);
      el.remove ? el.remove() : (el.parentNode && el.parentNode.removeChild(el));
    });

    wrap.appendChild(el);
  }

  function confirmDialog({
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'danger'
  } = {}) {
    return new Promise((resolve) => {
      const modalEl = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const msgEl = document.getElementById('confirmModalMessage');
      const confirmBtn = document.getElementById('confirmModalConfirmBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');

      if (!modalEl) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.innerHTML = esc(message);
      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        confirmBtn.className = `btn btn-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'primary'}`;
      }
      if (cancelBtn) cancelBtn.textContent = cancelText;

      let bsModal = null;
      if (window.bootstrap?.Modal) {
        bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      }

      function cleanup(result) {
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn?.removeEventListener('click', onCancel);
        modalEl.removeEventListener('hidden.bs.modal', onDismiss);
        if (bsModal) bsModal.hide();
        else modalEl.classList.remove('show', 'd-block');
        resolve(result);
      }

      function onConfirm() {
        cleanup(true);
      }
      function onCancel() {
        cleanup(false);
      }
      function onDismiss() {
        cleanup(false);
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn?.addEventListener('click', onCancel);
      modalEl.addEventListener('hidden.bs.modal', onDismiss, { once: true });

      if (bsModal) {
        bsModal.show();
      } else {
        modalEl.classList.add('show', 'd-block');
      }
    });
  }

  let lastActiveElementBeforeModal = null;

  function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    lastActiveElementBeforeModal = document.activeElement;
    el._triggerElement = document.activeElement;
    if (window.bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(el).show();
    } else {
      el.classList.add('show', 'd-block');
    }
    trapFocus(el);
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el._focusTrapHandler) {
      el.removeEventListener('keydown', el._focusTrapHandler);
      delete el._focusTrapHandler;
    }
    if (window.bootstrap?.Modal) {
      bootstrap.Modal.getInstance(el)?.hide();
    } else {
      el.classList.remove('show', 'd-block');
    }
    const trigger = el._triggerElement || lastActiveElementBeforeModal;
    if (trigger && typeof trigger.focus === 'function') {
      setTimeout(() => trigger.focus(), 60);
    }
  }

  function trapFocus(modalEl) {
    const focusable = modalEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    setTimeout(() => first.focus(), 80);

    function onKeyDown(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        closeModal(modalEl.id);
      }
    }
    if (modalEl._focusTrapHandler) {
      modalEl.removeEventListener('keydown', modalEl._focusTrapHandler);
    }
    modalEl._focusTrapHandler = onKeyDown;
    modalEl.addEventListener('keydown', onKeyDown);
  }

  function renderAlert(type = 'info', message = '', dismissible = true) {
    const icons = {
      success: 'fa-solid fa-circle-check',
      danger: 'fa-solid fa-circle-xmark',
      error: 'fa-solid fa-circle-xmark',
      warning: 'fa-solid fa-triangle-exclamation',
      info: 'fa-solid fa-circle-info'
    };
    const alertType = type === 'error' ? 'danger' : type;
    return `
      <div class="alert alert-${alertType} ${dismissible ? 'alert-dismissible' : ''} fade show d-flex align-items-center gap-2" role="alert">
        <i class="${icons[type] || icons.info}"></i>
        <div>${esc(message)}</div>
        ${dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' : ''}
      </div>
    `;
  }

  /* ---------- Format Helpers ---------- */
  function formatDate(val, includeTime = false) {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val);
      return includeTime ? d.toLocaleString() : d.toLocaleDateString();
    } catch {
      return String(val);
    }
  }

  function formatDuration(seconds, format = 'mm:ss') {
    const totalSec = Math.max(0, Math.round(Number(seconds) || 0));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    if (format === 'words') {
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
    return `${mm}:${ss}`;
  }

  function formatPercent(val, decimals = 1) {
    if (val == null || val === '') return '0%';
    const num = Number(val);
    if (isNaN(num)) return '0%';
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(num * factor) / factor;
    return `${rounded}%`;
  }

  function formatCSV(val) {
    return `"${String(val ?? '').replace(/"/g, '""')}"`;
  }

  function debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ---------- Table Helpers ---------- */
  const TableHelper = {
    renderPagination({ containerId, currentPage, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }) {
      const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
      if (!el) return;
      if (totalItems === 0) {
        el.innerHTML = '';
        return;
      }
      const start = (currentPage - 1) * pageSize + 1;
      const end = Math.min(totalItems, currentPage * pageSize);
      const showingText = `Showing ${start}–${end} of ${totalItems}`;

      let pageBtns = '';
      for (let p = 1; p <= totalPages; p++) {
        if (totalPages > 7) {
          if (p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 2) {
            if (p === 2 || p === totalPages - 1) {
              pageBtns += `<span class="px-1 text-muted">…</span>`;
            }
            continue;
          }
        }
        pageBtns += `<button type="button" class="btn btn-sm ${p === currentPage ? 'btn-brand text-white' : 'btn-outline-secondary'}" data-page-num="${p}">${p}</button>`;
      }

      el.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between align-items-center w-100 gap-2">
          <div class="text-muted small">${showingText}</div>
          <div class="d-flex align-items-center gap-1">
            <select class="form-select form-select-sm page-size-select me-2" style="width:auto;display:inline-block">
              <option value="5" ${pageSize === 5 ? 'selected' : ''}>5 / page</option>
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 / page</option>
              <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 / page</option>
            </select>
            <button type="button" class="btn btn-sm btn-outline-secondary" ${currentPage <= 1 ? 'disabled' : ''} data-page-action="prev"><i class="fa-solid fa-chevron-left"></i> Prev</button>
            <div class="btn-group btn-group-sm mx-1">${pageBtns}</div>
            <button type="button" class="btn btn-sm btn-outline-secondary" ${currentPage >= totalPages ? 'disabled' : ''} data-page-action="next">Next <i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
      `;

      el.querySelectorAll('[data-page-num]').forEach((btn) => {
        btn.addEventListener('click', () => onPageChange(Number(btn.dataset.pageNum)));
      });
      el.querySelector('[data-page-action="prev"]')?.addEventListener('click', () => {
        if (currentPage > 1) onPageChange(currentPage - 1);
      });
      el.querySelector('[data-page-action="next"]')?.addEventListener('click', () => {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
      });
      el.querySelector('.page-size-select')?.addEventListener('change', (e) => {
        if (onPageSizeChange) onPageSizeChange(Number(e.target.value));
      });
    },

    renderEmpty(message = 'No records found', icon = 'fa-solid fa-inbox') {
      return `
        <div class="empty-state text-center py-4">
          <div class="stat-icon mx-auto mb-2" style="width:48px;height:48px;font-size:1.25rem;border-radius:12px;">
            <i class="${icon}"></i>
          </div>
          <p class="text-muted mb-0">${esc(message)}</p>
        </div>
      `;
    }
  };

  /* ---------- Validation Utilities ---------- */
  const Validators = {
    required(value, fieldName = 'Field') {
      const valid = value !== null && value !== undefined && String(value).trim().length > 0;
      return { valid, message: valid ? '' : `${fieldName} is required.` };
    },
    email(value) {
      const v = String(value || '').trim();
      if (!v) return { valid: false, message: 'Email address is required.' };
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      return { valid, message: valid ? '' : 'Please enter a valid email address.' };
    },
    phone(value) {
      const v = String(value || '').trim();
      if (!v) return { valid: false, message: 'Phone number is required.' };
      const valid = /^[\d\s+\-()]{7,20}$/.test(v);
      return { valid, message: valid ? '' : 'Please enter a valid phone number.' };
    },
    minLength(value, min = 6, fieldName = 'Password') {
      const v = String(value || '');
      const valid = v.length >= min;
      return { valid, message: valid ? '' : `${fieldName} must be at least ${min} characters.` };
    },
    match(val1, val2, fieldName = 'Confirmation') {
      const valid = val1 === val2;
      return { valid, message: valid ? '' : `${fieldName} does not match.` };
    },
    number(value, min = 0, max = Infinity, fieldName = 'Value') {
      const num = Number(value);
      if (isNaN(num) || String(value).trim() === '') return { valid: false, message: `${fieldName} must be a valid number.` };
      if (num < min) return { valid: false, message: `${fieldName} cannot be less than ${min}.` };
      if (num > max) return { valid: false, message: `${fieldName} cannot exceed ${max}.` };
      return { valid: true, message: '' };
    },
    positiveInteger(value, fieldName = 'Value', max = 9999) {
      const num = Number(value);
      if (!Number.isInteger(num) || num <= 0) return { valid: false, message: `${fieldName} must be a positive whole number.` };
      if (num > max) return { valid: false, message: `${fieldName} cannot exceed ${max}.` };
      return { valid: true, message: '' };
    },
    quizDuration(value) {
      return this.positiveInteger(value, 'Quiz duration', 360);
    },
    passingPercentage(value) {
      return this.number(value, 0, 100, 'Passing percentage');
    },
    percentage(value, fieldName = 'Passing percentage') {
      return this.number(value, 0, 100, fieldName);
    },
    marks(value) {
      const num = Number(value);
      if (isNaN(num) || num <= 0) return { valid: false, message: 'Marks must be a positive number greater than 0.' };
      return { valid: true, message: '' };
    },
    questionCount(value) {
      return this.positiveInteger(value, 'Number of questions', 100);
    },
    dateRange(startDate, endDate) {
      if (!startDate || !endDate) return { valid: false, message: 'Both start and end dates are required.' };
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return { valid: false, message: 'Invalid date format.' };
      if (end < start) return { valid: false, message: 'End date must be on or after start date.' };
      return { valid: true, message: '' };
    },
    uniqueName(collection, field, value, excludeId = null) {
      const items = (QMS[collection]?.all ? QMS[collection].all() : Storage.getAll(collection)) || [];
      const valLower = String(value || '').trim().toLowerCase();
      const duplicate = items.some((item) => {
        if (excludeId && (item.id === excludeId || item.altId === excludeId)) return false;
        return String(item[field] || '').trim().toLowerCase() === valLower;
      });
      return { valid: !duplicate, message: duplicate ? `This ${field} already exists. Please choose a unique name.` : '' };
    }
  };

  function setFieldValidation(inputEl, isValid, errorMessage = '') {
    if (!inputEl) return;
    inputEl.classList.toggle('is-invalid', !isValid);
    inputEl.classList.toggle('is-valid', isValid);
    let feedback = inputEl.parentNode ? inputEl.parentNode.querySelector('.invalid-feedback') : null;
    if (!feedback && inputEl.parentNode) {
      feedback = document.createElement('div');
      feedback.className = 'invalid-feedback';
      inputEl.parentNode.appendChild(feedback);
    }
    if (feedback) {
      feedback.textContent = errorMessage;
      feedback.style.display = isValid ? 'none' : 'block';
    }
  }

  function clearFormValidation(formEl) {
    if (!formEl) return;
    formEl.querySelectorAll('.is-invalid, .is-valid').forEach((el) => {
      el.classList.remove('is-invalid', 'is-valid');
    });
    formEl.querySelectorAll('.invalid-feedback').forEach((el) => {
      el.textContent = '';
      el.style.display = 'none';
    });
  }

  function validateForm(formEl, validations = []) {
    let allValid = true;
    const errors = [];
    validations.forEach((v) => {
      const el = typeof v.input === 'string' ? document.getElementById(v.input) : v.input;
      if (!el) return;
      const res = v.validator(el.value, ...(v.args || []));
      setFieldValidation(el, res.valid, res.message);
      if (!res.valid) {
        allValid = false;
        errors.push(res.message);
      }
    });
    if (!allValid && errors.length) {
      toast(`Validation error: ${errors[0]}`, 'error');
    }
    return allValid;
  }

  function requireAuth() {
    // Professional flow: logged out by default — must login with email/password
    if (!QMS.isAuthenticated()) {
      location.replace('login.html?v=3&next=' + encodeURIComponent('index.html' + (location.hash || '#/dashboard')));
      return false;
    }
    document.body.classList.add('auth-ready');
    return true;
  }

  function applySettingsUI() {
    const s = QMS.getSettings();
    const theme = s.theme || 'light';
    const font = s.fontSize || 'medium';
    const sysName = s.systemName || 'QuizPro Admin';
    const adminName = s.adminName || QMS.getSession()?.fullName || 'Admin';

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-font-size', font);
    document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
    document.documentElement.classList.add(`font-${font}`);

    document.body.classList.toggle('compact-sidebar', !!s.compactSidebar);
    const sidebar = document.getElementById('sidebar');
    sidebar?.classList.toggle('compact', !!s.compactSidebar);

    const nameEls = document.querySelectorAll('[data-system-name]');
    nameEls.forEach((el) => (el.textContent = sysName));

    const userName = document.getElementById('topUserName');
    if (userName) userName.textContent = adminName;
    const avatar = document.getElementById('topAvatar');
    if (avatar) avatar.textContent = (adminName || 'A').charAt(0).toUpperCase();

    const topIcon = document.getElementById('topThemeIcon');
    if (topIcon) topIcon.className = theme === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';

    const currentTitle = PAGE_TITLES[currentPage] || (currentPage === '404' ? '404 Not Found' : 'Dashboard');
    document.title = `${currentTitle} — ${sysName}`;

    const compactCheck = document.getElementById('setCompact');
    if (compactCheck) compactCheck.checked = !!s.compactSidebar;
    const themeSelect = document.getElementById('setTheme');
    if (themeSelect && themeSelect.value !== theme) themeSelect.value = theme;
    const fontSelect = document.getElementById('setFont');
    if (fontSelect && fontSelect.value !== font) fontSelect.value = font;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    QMS.saveSettings({ theme: next });
    const topIcon = document.getElementById('topThemeIcon');
    if (topIcon) topIcon.className = next === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    const setThemeSelect = document.getElementById('setTheme');
    if (setThemeSelect) setThemeSelect.value = next;
    toast(`Switched to ${next} mode`, 'info');
    if (currentPage === 'dashboard' && typeof Dashboard !== 'undefined' && Dashboard?.updateTheme) {
      Dashboard.updateTheme();
    }
    if (currentPage === 'reports' && typeof Reports !== 'undefined' && Reports?.updateTheme) {
      Reports.updateTheme();
    }
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

  const PAGE_TITLES = {
    'dashboard': 'Dashboard',
    'quizzes': 'Quiz Management',
    'create-quiz': 'Create Quiz',
    'questions': 'Question Bank',
    'categories': 'Categories',
    'participants': 'Participants',
    'attempts': 'Quiz Attempts',
    'results': 'Results',
    'reports': 'Reports & Analytics',
    'leaderboard': 'Leaderboard',
    'settings': 'Settings',
    '404': '404 Not Found'
  };

  /* ---------- Hash-Based SPA Router ---------- */
  function parseHash(hash) {
    let clean = String(hash || '').replace(/^#\/?/, '').trim();
    if (!clean) clean = 'dashboard';
    const parts = clean.split('/').filter(Boolean);
    const main = parts[0] || 'dashboard';
    const sub = parts[1] || '';
    const param = parts[2] || '';
    return { raw: clean, main, sub, param, parts };
  }

  function handleRoute(hash = location.hash) {
    if (!requireAuth()) return;
    const { main, sub, param } = parseHash(hash);

    if (main === 'quizzes' && sub === 'create') {
      activeEditQuiz = null;
      showPage('create-quiz', 'Create Quiz');
      initCreateQuizPage(null);
      return;
    }
    if (main === 'quizzes' && sub === 'edit' && param) {
      const q = QMS.quizzes.get(param);
      if (q) {
        activeEditQuiz = q;
        showPage('create-quiz', 'Edit Quiz');
        initCreateQuizPage(q);
      } else {
        toast('Quiz not found: ' + param, 'error');
        showPage('quizzes', 'Quiz Management');
      }
      return;
    }
    if (main === 'questions' && sub === 'add') {
      showPage('questions', 'Question Bank');
      setTimeout(() => openQuestionModal(null), 60);
      return;
    }
    if (main === 'questions' && sub === 'edit' && param) {
      showPage('questions', 'Question Bank');
      const q = QMS.questions.get(param);
      if (q) {
        setTimeout(() => openQuestionModal(q), 60);
      } else {
        toast('Question not found: ' + param, 'error');
      }
      return;
    }

    if (main === 'attempts') {
      showPage('attempts', 'Quiz Attempts');
      const targetPid = sub || (new URLSearchParams(window.location.hash.split('?')[1] || '').get('participant'));
      if (targetPid) {
        setTimeout(() => {
          const sel = document.getElementById('attFilterPart');
          if (sel) {
            sel.value = targetPid;
            attPage = 1;
            renderAttempts();
          }
        }, 50);
      }
      return;
    }

    const routeAliases = {
      'dashboard': 'dashboard',
      'quizzes': 'quizzes',
      'create-quiz': 'create-quiz',
      'questions': 'questions',
      'categories': 'categories',
      'participants': 'participants',
      'attempts': 'attempts',
      'results': 'results',
      'reports': 'reports',
      'leaderboard': 'leaderboard',
      'settings': 'settings'
    };

    const targetPage = routeAliases[main];
    if (targetPage) {
      if (targetPage !== 'create-quiz') activeEditQuiz = null;
      showPage(targetPage);
    } else {
      showPage('404', '404 Not Found');
    }
  }

  function showPage(page, customTitle = null) {
    currentPage = page;
    const cleanHash = `/${page}`;
    if (location.hash !== `#${cleanHash}` && location.hash !== `#${page}`) {
      if (
        !location.hash.startsWith('#/quizzes/create') &&
        !location.hash.startsWith('#/quizzes/edit') &&
        !location.hash.startsWith('#/questions/add') &&
        !location.hash.startsWith('#/questions/edit') &&
        !location.hash.startsWith('#/attempts')
      ) {
        history.replaceState(null, '', `#${cleanHash}`);
      }
    }

    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
    } else {
      document.getElementById('page-404')?.classList.add('active');
    }

    setActiveNav(page === 'create-quiz' ? 'create-quiz' : page);

    const title = customTitle || PAGE_TITLES[page] || (page === '404' ? '404 Not Found' : page);
    document.title = `${title} — ${QMS.getSettings().systemName || 'QuizPro Admin'}`;

    const breadcrumbs = document.getElementById('appBreadcrumbs');
    if (breadcrumbs) {
      if (page === 'dashboard') {
        breadcrumbs.innerHTML = `
          <a href="#/dashboard"><i class="fa-solid fa-house me-1"></i>Home</a>
          <span class="sep">/</span>
          <span class="active">Dashboard</span>
        `;
      } else if (page === 'create-quiz') {
        const isEdit = !!(activeEditQuiz || document.getElementById('cqId')?.value);
        breadcrumbs.innerHTML = `
          <a href="#/dashboard"><i class="fa-solid fa-house me-1"></i>Home</a>
          <span class="sep">/</span>
          <a href="#/quizzes">Quizzes</a>
          <span class="sep">/</span>
          <span class="active">${isEdit ? 'Edit Quiz' : 'Create Quiz'}</span>
        `;
      } else if (page === '404') {
        breadcrumbs.innerHTML = `
          <a href="#/dashboard"><i class="fa-solid fa-house me-1"></i>Home</a>
          <span class="sep">/</span>
          <span class="active">404 Not Found</span>
        `;
      } else {
        breadcrumbs.innerHTML = `
          <a href="#/dashboard"><i class="fa-solid fa-house me-1"></i>Home</a>
          <span class="sep">/</span>
          <span class="active">${esc(title)}</span>
        `;
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeMobileSidebar();
    if (page !== '404') renderPage(page);
    applyAccessibilityLabels();
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('show');
    document.getElementById('btnToggleSidebar')?.setAttribute('aria-expanded', 'false');
  }

  function openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarBackdrop')?.classList.add('show');
    document.getElementById('btnToggleSidebar')?.setAttribute('aria-expanded', 'true');
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyAccessibilityLabels() {
    document.querySelectorAll('input, select, textarea').forEach((control) => {
      if (control.getAttribute('aria-label') || (control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`))) return;
      const nearbyLabel = control.closest('.mb-3, .col-md-3, .col-md-4, .col-md-6, .col-12, .toolbar, .filter-group')?.querySelector('.form-label');
      const placeholder = control.getAttribute('placeholder');
      const fallback = control.id
        ? control.id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ')
        : (placeholder || control.name || control.type || 'input field');
      control.setAttribute('aria-label', nearbyLabel?.textContent.trim() || fallback);
    });

    document.querySelectorAll('button, .btn, a[role="button"]').forEach((button) => {
      if (button.getAttribute('aria-label')) return;
      const text = button.textContent.trim();
      if (text) return;
      const title = button.getAttribute('title');
      if (title) {
        button.setAttribute('aria-label', title);
        return;
      }
      const icon = button.querySelector('i');
      if (icon) {
        const cls = icon.className || '';
        let label = 'Action button';
        if (cls.includes('fa-bars')) label = 'Toggle navigation drawer';
        else if (cls.includes('fa-moon') || cls.includes('fa-sun')) label = 'Toggle theme';
        else if (cls.includes('fa-bell')) label = 'View notifications';
        else if (cls.includes('fa-magnifying-glass')) label = 'Search';
        else if (cls.includes('fa-trash')) label = 'Delete';
        else if (cls.includes('fa-pen')) label = 'Edit';
        else if (cls.includes('fa-eye')) label = 'View details';
        else if (cls.includes('fa-copy')) label = 'Duplicate';
        else if (cls.includes('fa-chevron-left') || cls.includes('fa-arrow-left')) label = 'Previous page';
        else if (cls.includes('fa-chevron-right') || cls.includes('fa-arrow-right')) label = 'Next page';
        button.setAttribute('aria-label', label);
      }
    });

    document.querySelectorAll('.btn-close').forEach((button) => button.setAttribute('aria-label', 'Close dialog'));
    document.getElementById('btnToggleSidebar')?.setAttribute('aria-expanded', document.getElementById('sidebar')?.classList.contains('open') ? 'true' : 'false');
    document.getElementById('btnNotifications')?.setAttribute('aria-expanded', !document.getElementById('notifPanel')?.classList.contains('d-none') ? 'true' : 'false');
    document.getElementById('profileChip')?.setAttribute('aria-expanded', !document.getElementById('profileMenu')?.classList.contains('d-none') ? 'true' : 'false');
    document.getElementById('toastWrap')?.setAttribute('role', 'status');
    document.getElementById('toastWrap')?.setAttribute('aria-live', 'polite');
    document.getElementById('notifList')?.setAttribute('aria-live', 'polite');
  }

  function statusBadge(status, type = 'status') {
    const map = {
      Active: 'badge-success',
      Passed: 'badge-success',
      Draft: 'badge-warning',
      Inactive: 'badge-muted',
      Failed: 'badge-danger',
      Archived: 'badge-info',
      Easy: 'badge-success',
      Medium: 'badge-warning',
      Hard: 'badge-danger',
      mcq: 'badge-info',
      truefalse: 'badge-secondary',
      short: 'badge-muted',
      fillblank: 'badge-warning'
    };
    return `<span class="badge-soft ${map[status] || 'badge-muted'}">${esc(status)}</span>`;
  }

  function optionCategories(selected = '', activeOnly = false) {
    return QMS.categories
      .all()
      .filter((c) => !activeOnly || c.status === 'Active')
      .map((c) => `<option value="${c.id}" ${c.id === selected || (c.altId && c.altId === selected) ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');
  }

  function optionParticipants(selected = '', activeOnly = false) {
    return QMS.participants
      .all()
      .filter((p) => !activeOnly || p.status === 'Active')
      .map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`)
      .join('');
  }

  function optionQuizzes(selected = '', activeOnly = false) {
    return QMS.quizzes
      .all()
      .filter((q) => !activeOnly || q.status === 'Active')
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

  /* ---------- Dashboard helpers & Leaderboard Aggregator (Phase 13) ---------- */
  function leaderboardRows(filters = {}) {
    const results = QMS.results.all().filter((r) => {
      if (filters.quizId && r.quizId !== filters.quizId) return false;
      if (filters.categoryId) {
        const q = QMS.quizzes.get(r.quizId);
        if (!q || q.categoryId !== filters.categoryId) return false;
      }
      if (filters.period && filters.period !== 'all') {
        const d = new Date(r.date || 0);
        const now = new Date();
        const days = filters.period === 'week' ? 7
          : filters.period === 'month' ? 30
          : filters.period === '3months' ? 90
          : filters.period === 'year' ? 365
          : 3650;
        if ((now - d) / 86400000 > days) return false;
      }
      return true;
    });

    const list = QMS.participants
      .all()
      .map((p) => {
        const rows = results.filter((r) => r.participantId === p.id);
        const scores = rows.map((r) => Number(r.percentage) || 0);
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const best = scores.length ? Math.max(...scores) : 0;
        const points = rows.reduce((sum, r) => sum + (Number(r.obtainedMarks ?? r.score) || 0), 0);
        const totalTime = rows.reduce((sum, r) => sum + (Number(r.timeTaken ?? r.timeSpent) || 0), 0);
        const quizSet = new Set(rows.map((r) => r.quizId));
        return {
          id: p.id,
          name: p.name,
          totalQuizzes: quizSet.size,
          avg,
          best,
          points,
          totalTime,
          attempts: rows.length
        };
      })
      .filter((r) => r.attempts > 0)
      .sort((a, b) => b.points - a.points || b.avg - a.avg || a.totalTime - b.totalTime);

    return list.map((item, idx) => ({
      ...item,
      rank: idx + 1
    }));
  }

  /* ---------- Quizzes (Phase 6) ---------- */
  function filteredQuizzes() {
    const q = (document.getElementById('quizSearch')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('quizFilterCat')?.value || '';
    const diff = document.getElementById('quizFilterDiff')?.value || '';
    const status = document.getElementById('quizFilterStatus')?.value || '';
    const date = document.getElementById('quizFilterDate')?.value || '';
    const sortSel = document.getElementById('quizSort')?.value;
    if (sortSel) sortState.quizzes = parseSortValue(sortSel, 'createdAt');

    const filtered = QMS.quizzes.all().filter((item) => {
      if (q) {
        const match = `${item.id} ${item.title} ${item.subject || ''}`.toLowerCase();
        if (!match.includes(q)) return false;
      }
      if (cat && item.categoryId !== cat) return false;
      if (diff && item.difficulty !== diff) return false;
      if (status && item.status !== status) return false;
      if (date && item.createdAt !== date) return false;
      return true;
    });

    return sortByState(filtered, 'quizzes', {
      id: (item) => item.id,
      title: (item) => item.title,
      category: (item) => QMS.categoryName(item.categoryId),
      questions: (item) => (item.questionIds || []).length || item.questionCount || 0,
      duration: (item) => Number(item.duration) || 0,
      passing: (item) => Number(item.passingPercentage) || 0,
      difficulty: (item) => item.difficulty,
      status: (item) => item.status,
      createdAt: (item) => item.createdAt
    });
  }

  function clearQuizFilters() {
    const s = document.getElementById('quizSearch');
    const c = document.getElementById('quizFilterCat');
    const d = document.getElementById('quizFilterDiff');
    const st = document.getElementById('quizFilterStatus');
    const dt = document.getElementById('quizFilterDate');
    const sort = document.getElementById('quizSort');

    if (s) s.value = '';
    if (c) c.value = '';
    if (d) d.value = '';
    if (st) st.value = '';
    if (dt) dt.value = '';
    if (sort) sort.value = 'createdAt:desc';

    sortState.quizzes = { key: 'createdAt', dir: 'desc' };
    quizPage = 1;
    renderQuizzes();
    toast('Quiz filters cleared', 'info');
  }

  function renderQuizzes() {
    const list = filteredQuizzes();
    const totalPages = Math.max(1, Math.ceil(list.length / quizPageSize));
    if (quizPage > totalPages) quizPage = totalPages;
    const slice = list.slice((quizPage - 1) * quizPageSize, quizPage * quizPageSize);

    const body = slice
      .map((item) => {
        const count = (item.questionIds || []).length || item.questionCount || 0;
        return `<tr>
          <td data-label="Quiz ID"><span class="badge bg-secondary">${esc(item.id)}</span></td>
          <td data-label="Quiz Title" class="fw-semibold">${esc(item.title)}</td>
          <td data-label="Category">${esc(QMS.categoryName(item.categoryId))}</td>
          <td data-label="Questions"><span class="badge-soft badge-info">${count} Qs</span></td>
          <td data-label="Duration">${esc(item.duration)} min</td>
          <td data-label="Passing Score">${esc(item.passingPercentage)}%</td>
          <td data-label="Difficulty">${statusBadge(item.difficulty)}</td>
          <td data-label="Status">${statusBadge(item.status)}</td>
          <td data-label="Created">${esc(item.createdAt)}</td>
          <td data-label="Actions">
            <div class="action-btns">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-quiz-view="${item.id}" title="View Quiz Details">
                <i class="fa-solid fa-eye me-1"></i>View
              </button>
              <button type="button" class="btn btn-sm btn-outline-brand" data-quiz-edit="${item.id}" title="Edit Quiz">
                <i class="fa-solid fa-pen me-1"></i>Edit
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-quiz-dup="${item.id}" title="Duplicate Quiz">
                <i class="fa-solid fa-copy me-1"></i>Duplicate
              </button>
              <button type="button" class="btn btn-sm ${item.status === 'Active' ? 'btn-outline-warning' : 'btn-outline-success'}" data-quiz-toggle="${item.id}" title="Toggle Active / Inactive">
                <i class="fa-solid ${item.status === 'Active' ? 'fa-pause' : 'fa-play'} me-1"></i>${item.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" class="btn btn-sm btn-brand text-white" data-quiz-start="${item.id}" title="Start / Take Quiz">
                <i class="fa-solid fa-play me-1"></i>Start
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-quiz-del="${item.id}" title="Delete Quiz">
                <i class="fa-solid fa-trash me-1"></i>Delete
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    const cards = slice
      .map((item) => {
        const count = (item.questionIds || []).length || item.questionCount || 0;
        return `
        <div class="mobile-card">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge bg-secondary me-1">${esc(item.id)}</span>
              <h4 class="d-inline-block mb-0">${esc(item.title)}</h4>
            </div>
            <div>${statusBadge(item.status)}</div>
          </div>
          <div class="mobile-meta mb-2">
            <div><i class="fa-solid fa-folder me-1 text-muted"></i>${esc(QMS.categoryName(item.categoryId))} · ${statusBadge(item.difficulty)}</div>
            <div><i class="fa-solid fa-clock me-1 text-muted"></i>${item.duration} min · Pass ${item.passingPercentage}% · ${count} Questions</div>
            <div class="text-muted small"><i class="fa-solid fa-calendar me-1"></i>Created: ${esc(item.createdAt)}</div>
          </div>
          <div class="action-btns mt-3">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-quiz-view="${item.id}">View</button>
            <button type="button" class="btn btn-sm btn-outline-brand" data-quiz-edit="${item.id}">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-quiz-dup="${item.id}">Duplicate</button>
            <button type="button" class="btn btn-sm btn-outline-warning" data-quiz-toggle="${item.id}">${item.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
            <button type="button" class="btn btn-sm btn-brand text-white" data-quiz-start="${item.id}">Start</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-quiz-del="${item.id}">Delete</button>
          </div>
        </div>`;
      })
      .join('');

    const tbody = document.getElementById('quizTableBody');
    if (tbody) {
      tbody.innerHTML = body || `<tr><td colspan="10" class="text-center text-muted py-4"><i class="fa-solid fa-inbox me-2"></i>No quizzes found matching filters</td></tr>`;
    }
    const cardWrap = document.getElementById('quizMobileCards');
    if (cardWrap) {
      cardWrap.innerHTML = cards || '<div class="empty-state text-center py-4 text-muted"><i class="fa-solid fa-inbox me-2"></i>No quizzes found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'quizPagination',
      currentPage: quizPage,
      totalPages,
      totalItems: list.length,
      pageSize: quizPageSize,
      onPageChange: (p) => {
        quizPage = p;
        renderQuizzes();
      },
      onPageSizeChange: (s) => {
        quizPageSize = s;
        quizPage = 1;
        renderQuizzes();
      }
    });
  }

  function openQuizViewModal(quiz) {
    if (!quiz) return;
    const titleEl = document.getElementById('quizViewTitle');
    const badgeEl = document.getElementById('quizViewStatusBadge');
    if (titleEl) titleEl.textContent = quiz.title;
    if (badgeEl) badgeEl.innerHTML = statusBadge(quiz.status);

    const catName = QMS.categoryName(quiz.categoryId);
    const qCount = (quiz.questionIds || []).length || quiz.questionCount || 0;

    const metaEl = document.getElementById('quizViewMeta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="row g-2 text-dark small">
          <div class="col-6 col-md-3"><strong>Quiz ID:</strong> <span class="badge bg-secondary">${esc(quiz.id)}</span></div>
          <div class="col-6 col-md-3"><strong>Category:</strong> ${esc(catName)}</div>
          <div class="col-6 col-md-3"><strong>Subject:</strong> ${esc(quiz.subject || '—')}</div>
          <div class="col-6 col-md-3"><strong>Difficulty:</strong> ${statusBadge(quiz.difficulty)}</div>
          <div class="col-6 col-md-3"><strong>Duration:</strong> ${esc(quiz.duration)} minutes</div>
          <div class="col-6 col-md-3"><strong>Passing Score:</strong> ${esc(quiz.passingPercentage)}%</div>
          <div class="col-6 col-md-3"><strong>Max Attempts:</strong> ${esc(quiz.maxAttempts || 'Unlimited')}</div>
          <div class="col-6 col-md-3"><strong>Questions:</strong> ${qCount}</div>
          <div class="col-12 col-md-6"><strong>Schedule:</strong> ${esc(quiz.startDate || '—')} to ${esc(quiz.endDate || '—')}</div>
          <div class="col-12 col-md-6"><strong>Created:</strong> ${esc(quiz.createdAt || '—')}</div>
        </div>
      `;
    }

    const descEl = document.getElementById('quizViewDesc');
    if (descEl) descEl.textContent = quiz.description || 'No description provided.';
    const instEl = document.getElementById('quizViewInstructions');
    if (instEl) instEl.textContent = quiz.instructions || 'No specific instructions provided.';

    const optChips = [
      { label: 'Randomize Questions', val: !!quiz.randomizeQuestions },
      { label: 'Randomize Answers', val: !!quiz.randomizeAnswers },
      { label: 'Show Correct Answers', val: quiz.showCorrectAnswers !== false },
      { label: 'Allow Retake', val: quiz.allowRetake !== false },
      { label: 'Display Timer', val: quiz.displayTimer !== false },
      { label: 'Negative Marking', val: !!quiz.negativeMarking }
    ];

    const optEl = document.getElementById('quizViewOptions');
    if (optEl) {
      optEl.innerHTML = optChips
        .map(
          (o) => `
        <span class="badge-soft ${o.val ? 'badge-success' : 'badge-muted'}">
          <i class="fa-solid ${o.val ? 'fa-check' : 'fa-xmark'} me-1"></i>${o.label}: <strong>${o.val ? 'Yes' : 'No'}</strong>
        </span>`
        )
        .join('');
    }

    const linkedIds = quiz.questionIds || [];
    const countEl = document.getElementById('quizViewQuestionCount');
    if (countEl) countEl.textContent = linkedIds.length;
    const questionsListEl = document.getElementById('quizViewQuestions');

    if (questionsListEl) {
      if (!linkedIds.length) {
        questionsListEl.innerHTML = '<div class="text-center py-3 text-muted small"><i class="fa-solid fa-inbox me-1"></i>No questions linked to this quiz yet.</div>';
      } else {
        questionsListEl.innerHTML = linkedIds
          .map((qid, idx) => {
            const q = QMS.questions.get(qid);
            if (!q) {
              return `<div class="p-2 border-bottom small text-muted">${idx + 1}. [${qid}] Question not found in database</div>`;
            }
            return `
              <div class="p-2 border-bottom bg-white rounded mb-1">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge bg-secondary">${idx + 1}. ${esc(q.id)}</span>
                  <span class="badge-soft badge-info">${esc(q.type)}</span>
                  <span class="badge-soft badge-success">${esc(q.marks)} mark${q.marks > 1 ? 's' : ''}</span>
                  <span class="badge-soft badge-muted">${esc(q.difficulty)}</span>
                </div>
                <div class="fw-semibold text-dark small">${esc(q.text)}</div>
              </div>
            `;
          })
          .join('');
      }
    }

    const editBtn = document.getElementById('btnQuizViewEdit');
    if (editBtn) {
      editBtn.onclick = () => {
        closeModal('quizViewModal');
        location.hash = `#/quizzes/edit/${quiz.id}`;
      };
    }

    const startBtn = document.getElementById('btnQuizViewStart');
    if (startBtn) {
      startBtn.onclick = () => {
        closeModal('quizViewModal');
        openParticipantSelectModal(quiz.id);
      };
    }

    openModal('quizViewModal');
  }

  function openParticipantSelectModal(quizId) {
    const quiz = QMS.quizzes.get(quizId);
    if (!quiz) {
      toast('Quiz not found: ' + quizId, 'error');
      return;
    }

    const idInput = document.getElementById('psmQuizId');
    if (idInput) idInput.value = quiz.id;
    const titleEl = document.getElementById('psmQuizTitle');
    if (titleEl) titleEl.textContent = `${quiz.title} (${quiz.id})`;
    const subEl = document.getElementById('psmQuizSubtitle');
    if (subEl) {
      subEl.textContent = `${quiz.duration} min duration · Passing: ${quiz.passingPercentage}% · ${(quiz.questionIds || []).length || quiz.questionCount} Questions · ${quiz.difficulty}`;
    }

    const pSelect = document.getElementById('psmParticipantSelect');
    const activeParticipants = QMS.participants.all().filter((p) => p.status === 'Active');

    if (pSelect) {
      if (!activeParticipants.length) {
        pSelect.innerHTML = '<option value="">No active candidates available</option>';
        toast('No active participants found. Please activate or add a participant first.', 'warning');
      } else {
        pSelect.innerHTML =
          '<option value="">-- Choose Candidate --</option>' +
          activeParticipants.map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.email)})</option>`).join('');
      }

      const detailsBox = document.getElementById('psmParticipantDetails');
      if (detailsBox) {
        detailsBox.style.display = 'none';
        detailsBox.innerHTML = '';
      }

      pSelect.onchange = () => {
        const pid = pSelect.value;
        if (!detailsBox) return;
        if (!pid) {
          detailsBox.style.display = 'none';
          return;
        }
        const p = QMS.participants.get(pid);
        if (!p) return;
        const priorAttempts = QMS.results.all().filter((r) => r.quizId === quiz.id && r.participantId === p.id);
        detailsBox.style.display = 'block';
        detailsBox.innerHTML = `
          <div><strong>Candidate:</strong> ${esc(p.name)}</div>
          <div><strong>Email:</strong> ${esc(p.email)} | <strong>Phone:</strong> ${esc(p.phone || '—')}</div>
          <div><strong>Prior Attempts on this Quiz:</strong> ${priorAttempts.length} / ${quiz.maxAttempts || 'Unlimited'}</div>
        `;
      };
    }

    const launchBtn = document.getElementById('btnLaunchQuizAttempt');
    if (launchBtn) {
      launchBtn.onclick = () => {
        const pid = pSelect?.value;
        if (!pid) {
          toast('Please select a participant to take this quiz.', 'error');
          return;
        }
        closeModal('participantSelectModal');
        location.href = `quiz.html?quiz=${encodeURIComponent(quiz.id)}&participant=${encodeURIComponent(pid)}`;
      };
    }

    openModal('participantSelectModal');
  }

  /* ---------- Create / Edit Quiz Page (Requirement 6.2) ---------- */
  function updateQuestionCounterBadge() {
    const required = Number(document.getElementById('cqQuestionCount')?.value) || 0;
    const selected = selectedQuizQuestionIds.size;
    const badge = document.getElementById('cqQuestionCounterBadge');
    const selectedCountEl = document.getElementById('cqSelectedCount');
    const requiredCountEl = document.getElementById('cqRequiredCount');

    if (selectedCountEl) selectedCountEl.textContent = selected;
    if (requiredCountEl) requiredCountEl.textContent = required;

    if (badge) {
      badge.className = 'badge px-2 py-1 fs-6 ';
      if (selected === required && required > 0) {
        badge.classList.add('bg-success', 'text-white');
      } else if (selected < required) {
        badge.classList.add('bg-warning', 'text-dark');
      } else {
        badge.classList.add('bg-danger', 'text-white');
      }
    }

    // Sync to hidden select #cqQuestions
    const cqSelect = document.getElementById('cqQuestions');
    if (cqSelect) {
      cqSelect.innerHTML = Array.from(selectedQuizQuestionIds)
        .map((id) => `<option value="${id}" selected>${id}</option>`)
        .join('');
    }
  }

  function renderQuestionPicker(searchKeyword = '') {
    const container = document.getElementById('cqQuestionPickerList');
    if (!container) return;
    const catId = document.getElementById('cqCategory')?.value || '';
    const kw = (searchKeyword || '').trim().toLowerCase();

    let questions = QMS.questions.all().filter((q) => q.status === 'Active');
    if (catId) {
      questions = questions.filter((q) => q.categoryId === catId);
    }
    if (kw) {
      questions = questions.filter((q) =>
        q.id.toLowerCase().includes(kw) ||
        (q.text || '').toLowerCase().includes(kw) ||
        (q.explanation || '').toLowerCase().includes(kw)
      );
    }

    if (!questions.length) {
      container.innerHTML = `
        <div class="text-center py-3 text-muted small">
          <i class="fa-solid fa-inbox me-1"></i>No active questions found in this category.
        </div>`;
      return;
    }

    container.innerHTML = questions
      .map((q) => {
        const isChecked = selectedQuizQuestionIds.has(q.id);
        return `
        <div class="form-check p-2 border-bottom d-flex align-items-start gap-2 bg-white rounded mb-1">
          <input class="form-check-input mt-1 cq-question-checkbox" type="checkbox" id="cq_q_${q.id}" data-cq-qid="${q.id}" ${isChecked ? 'checked' : ''} />
          <label class="form-check-label flex-grow-1 small" for="cq_q_${q.id}" style="cursor:pointer">
            <div class="d-flex align-items-center gap-1 mb-1">
              <span class="badge bg-secondary">${esc(q.id)}</span>
              <span class="badge-soft badge-info">${esc(q.type)}</span>
              <span class="badge-soft badge-success">${esc(q.marks)} mark${q.marks > 1 ? 's' : ''}</span>
              <span class="badge-soft badge-muted">${esc(q.difficulty)}</span>
            </div>
            <div class="fw-semibold text-dark">${esc(q.text)}</div>
          </label>
        </div>`;
      })
      .join('');

    container.querySelectorAll('.cq-question-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const qid = cb.dataset.cqQid;
        if (cb.checked) {
          selectedQuizQuestionIds.add(qid);
        } else {
          selectedQuizQuestionIds.delete(qid);
        }
        updateQuestionCounterBadge();
      });
    });
  }

  function autoSelectQuestions() {
    const catId = document.getElementById('cqCategory')?.value || '';
    const countNeeded = Number(document.getElementById('cqQuestionCount')?.value) || 5;

    let available = QMS.questions.all().filter((q) => q.status === 'Active');
    if (catId) {
      available = available.filter((q) => q.categoryId === catId);
    }

    if (available.length === 0) {
      toast('No active questions found in this category to select', 'warning');
      return;
    }

    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, countNeeded);

    selectedQuizQuestionIds = new Set(chosen.map((q) => q.id));
    renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
    updateQuestionCounterBadge();

    if (chosen.length < countNeeded) {
      toast(`Only ${chosen.length} question(s) available in this category (needed ${countNeeded})`, 'warning');
    } else {
      toast(`Auto-selected ${chosen.length} question(s) from ${QMS.categoryName(catId)}`, 'success');
    }
  }

  function clearQuestionSelection() {
    selectedQuizQuestionIds.clear();
    renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
    updateQuestionCounterBadge();
    toast('Question selection cleared', 'info');
  }

  function initCreateQuizPage(quiz = null) {
    const form = document.getElementById('createQuizForm');
    if (!form) return;
    form.classList.remove('was-validated');
    clearFormValidation(form);

    const s = QMS.getSettings();
    const catSelect = document.getElementById('cqCategory');
    if (catSelect) {
      catSelect.innerHTML = optionCategories(quiz?.categoryId || '');
    }

    if (quiz) {
      // Edit mode
      document.getElementById('cqId').value = quiz.id;
      document.getElementById('createQuizPageTitle').textContent = 'Edit Quiz: ' + quiz.id;
      document.getElementById('createQuizPageSubtitle').textContent = 'Update quiz parameters, question rules, and schedule';
      document.getElementById('cqTitle').value = quiz.title || '';
      document.getElementById('cqSubject').value = quiz.subject || '';
      document.getElementById('cqDescription').value = quiz.description || '';
      if (catSelect) catSelect.value = quiz.categoryId || '';
      document.getElementById('cqDifficulty').value = quiz.difficulty || 'Easy';
      document.getElementById('cqQuestionCount').value = (quiz.questionIds || []).length || quiz.questionCount || 5;
      document.getElementById('cqDuration').value = quiz.duration || s.defaultQuizDuration || s.defaultDuration || 30;
      document.getElementById('cqPassing').value = quiz.passingPercentage ?? s.defaultPassingPercentage ?? s.defaultPassing ?? 60;
      document.getElementById('cqMaxAttempts').value = quiz.maxAttempts || 3;
      document.getElementById('cqStart').value = quiz.startDate || '';
      document.getElementById('cqEnd').value = quiz.endDate || '';
      document.getElementById('cqStatus').value = quiz.status || 'Active';
      document.getElementById('cqInstructions').value = quiz.instructions || '';
      document.getElementById('cqRandQ').checked = !!quiz.randomizeQuestions;
      document.getElementById('cqRandA').checked = !!quiz.randomizeAnswers;
      document.getElementById('cqShowAns').checked = quiz.showCorrectAnswers !== false;
      document.getElementById('cqRetake').checked = quiz.allowRetake !== false;
      document.getElementById('cqTimer').checked = quiz.displayTimer !== false;
      document.getElementById('cqNeg').checked = !!quiz.negativeMarking;

      selectedQuizQuestionIds = new Set(quiz.questionIds || []);
    } else {
      // Create mode
      document.getElementById('cqId').value = '';
      document.getElementById('createQuizPageTitle').textContent = 'Create New Quiz';
      document.getElementById('createQuizPageSubtitle').textContent = 'Fill in quiz details, options, and select questions from the bank.';
      document.getElementById('cqTitle').value = '';
      document.getElementById('cqSubject').value = '';
      document.getElementById('cqDescription').value = '';
      if (catSelect?.options?.length) {
        catSelect.selectedIndex = 0;
      }
      document.getElementById('cqDifficulty').value = 'Easy';
      document.getElementById('cqQuestionCount').value = 5;
      document.getElementById('cqDuration').value = s.defaultQuizDuration || s.defaultDuration || 30;
      document.getElementById('cqPassing').value = s.defaultPassingPercentage ?? s.defaultPassing ?? 60;
      document.getElementById('cqMaxAttempts').value = 3;
      document.getElementById('cqStart').value = new Date().toISOString().slice(0, 10);
      document.getElementById('cqEnd').value = '2026-12-31';
      document.getElementById('cqStatus').value = 'Active';
      document.getElementById('cqInstructions').value = '';
      document.getElementById('cqRandQ').checked = !!s.randomQuestions;
      document.getElementById('cqRandA').checked = !!s.randomAnswers;
      document.getElementById('cqShowAns').checked = s.showAnswers !== false;
      document.getElementById('cqRetake').checked = s.allowRetakes !== false;
      document.getElementById('cqTimer').checked = s.enableTimer !== false;
      document.getElementById('cqNeg').checked = false;

      selectedQuizQuestionIds = new Set();
    }

    renderQuestionPicker();
    updateQuestionCounterBadge();
  }

  function resetCreateQuizPage() {
    confirmDialog({
      title: 'Reset Form',
      message: 'Reset all quiz fields to defaults? Any unsaved edits will be lost.',
      confirmText: 'Reset Form',
      type: 'warning'
    }).then((ok) => {
      if (!ok) return;
      initCreateQuizPage(null);
      toast('Form reset to default settings', 'info');
    });
  }

  function cancelCreateQuiz() {
    const title = (document.getElementById('cqTitle')?.value || '').trim();
    const hasUnsaved = title.length > 0 || selectedQuizQuestionIds.size > 0;
    if (hasUnsaved) {
      confirmDialog({
        title: 'Discard Changes',
        message: 'You have unsaved changes in this quiz form. Are you sure you want to discard them?',
        confirmText: 'Discard & Exit',
        type: 'warning'
      }).then((ok) => {
        if (!ok) return;
        activeEditQuiz = null;
        location.hash = '#/quizzes';
      });
      return;
    }
    activeEditQuiz = null;
    location.hash = '#/quizzes';
  }

  function saveCreateQuiz(asDraft = false) {
    const form = document.getElementById('createQuizForm');
    const existingId = document.getElementById('cqId')?.value || '';
    const title = (document.getElementById('cqTitle')?.value || '').trim();
    const s = QMS.getSettings();

    if (asDraft) {
      // Relaxed validation: title required only
      if (!title) {
        setFieldValidation(document.getElementById('cqTitle'), false, 'Quiz Title is required to save as Draft.');
        toast('Quiz Title is required to save as Draft', 'error');
        return;
      }

      const categoryId = document.getElementById('cqCategory')?.value || QMS.categories.all()[0]?.id || '';
      const subject = (document.getElementById('cqSubject')?.value || '').trim() || 'General';
      const description = (document.getElementById('cqDescription')?.value || '').trim();
      const difficulty = document.getElementById('cqDifficulty')?.value || 'Easy';
      const questionCount = Number(document.getElementById('cqQuestionCount')?.value) || selectedQuizQuestionIds.size || 5;
      const duration = Number(document.getElementById('cqDuration')?.value) || s.defaultQuizDuration || s.defaultDuration || 30;
      const passing = Number(document.getElementById('cqPassing')?.value) || s.defaultPassingPercentage || s.defaultPassing || 60;
      const maxAttempts = Number(document.getElementById('cqMaxAttempts')?.value) || 3;
      const startDate = document.getElementById('cqStart')?.value || new Date().toISOString().slice(0, 10);
      const endDate = document.getElementById('cqEnd')?.value || '2026-12-31';
      const instructions = (document.getElementById('cqInstructions')?.value || '').trim();

      const payload = {
        title,
        subject,
        description,
        categoryId,
        difficulty,
        questionCount,
        duration,
        passingPercentage: passing,
        maxAttempts,
        startDate,
        endDate,
        status: 'Draft',
        instructions,
        randomizeQuestions: !!document.getElementById('cqRandQ')?.checked,
        randomizeAnswers: !!document.getElementById('cqRandA')?.checked,
        showCorrectAnswers: !!document.getElementById('cqShowAns')?.checked,
        allowRetake: !!document.getElementById('cqRetake')?.checked,
        displayTimer: !!document.getElementById('cqTimer')?.checked,
        negativeMarking: !!document.getElementById('cqNeg')?.checked,
        questionIds: Array.from(selectedQuizQuestionIds),
        createdAt: existingId
          ? QMS.quizzes.get(existingId)?.createdAt || new Date().toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10)
      };

      if (existingId) {
        QMS.quizzes.update(existingId, payload);
        toast(`Draft quiz "${title}" updated successfully`, 'success');
      } else {
        const created = QMS.quizzes.create(payload);
        toast(`Draft quiz "${title}" created successfully (ID: ${created.id})`, 'success');
      }

      activeEditQuiz = null;
      buildNotifications();
      location.hash = '#/quizzes';
      return;
    }

    // Full validation for Save Quiz
    clearFormValidation(form);
    let valid = true;
    const errors = [];

    const valReq = (id, name) => {
      const el = document.getElementById(id);
      const r = Validators.required(el?.value, name);
      setFieldValidation(el, r.valid, r.message);
      if (!r.valid) {
        valid = false;
        errors.push(r.message);
      }
      return el?.value;
    };

    valReq('cqTitle', 'Quiz Title');
    valReq('cqSubject', 'Subject');
    valReq('cqCategory', 'Category');
    valReq('cqDescription', 'Quiz Description');

    const qcEl = document.getElementById('cqQuestionCount');
    const qcVal = Number(qcEl?.value);
    if (!Number.isInteger(qcVal) || qcVal <= 0) {
      setFieldValidation(qcEl, false, 'Number of questions must be a positive integer.');
      valid = false;
      errors.push('Number of questions must be a positive integer.');
    } else {
      setFieldValidation(qcEl, true);
    }

    const durEl = document.getElementById('cqDuration');
    const durVal = Number(durEl?.value);
    if (isNaN(durVal) || durVal <= 0) {
      setFieldValidation(durEl, false, 'Duration must be at least 1 minute.');
      valid = false;
      errors.push('Duration must be at least 1 minute.');
    } else {
      setFieldValidation(durEl, true);
    }

    const passEl = document.getElementById('cqPassing');
    const passVal = Number(passEl?.value);
    if (isNaN(passVal) || passVal < 0 || passVal > 100) {
      setFieldValidation(passEl, false, 'Passing percentage must be between 0 and 100.');
      valid = false;
      errors.push('Passing percentage must be between 0 and 100.');
    } else {
      setFieldValidation(passEl, true);
    }

    const attEl = document.getElementById('cqMaxAttempts');
    const attVal = Number(attEl?.value);
    if (isNaN(attVal) || attVal < 1) {
      setFieldValidation(attEl, false, 'Maximum attempts must be at least 1.');
      valid = false;
      errors.push('Maximum attempts must be at least 1.');
    } else {
      setFieldValidation(attEl, true);
    }

    const startVal = document.getElementById('cqStart')?.value;
    const endVal = document.getElementById('cqEnd')?.value;
    const dateRes = Validators.dateRange(startVal, endVal);
    setFieldValidation(document.getElementById('cqStart'), !!startVal, startVal ? '' : 'Start date is required.');
    setFieldValidation(document.getElementById('cqEnd'), dateRes.valid, dateRes.message);
    if (!startVal || !dateRes.valid) {
      valid = false;
      errors.push(dateRes.message || 'Start and End dates are required.');
    }

    // Question Selection consistency check
    if (selectedQuizQuestionIds.size !== qcVal) {
      valid = false;
      errors.push(
        `Selected questions (${selectedQuizQuestionIds.size}) must match Number of Questions (${qcVal}). Use Auto-Select or toggle checkboxes.`
      );
    }

    if (!valid) {
      form.classList.add('was-validated');
      toast(errors[0] || 'Please complete all required fields properly.', 'error');
      return;
    }

    const payload = {
      title,
      subject: (document.getElementById('cqSubject')?.value || '').trim(),
      description: (document.getElementById('cqDescription')?.value || '').trim(),
      categoryId: document.getElementById('cqCategory')?.value || '',
      difficulty: document.getElementById('cqDifficulty')?.value || 'Easy',
      questionCount: qcVal,
      duration: durVal,
      passingPercentage: passVal,
      maxAttempts: attVal,
      startDate: startVal,
      endDate: endVal,
      status: document.getElementById('cqStatus')?.value || 'Active',
      instructions: (document.getElementById('cqInstructions')?.value || '').trim(),
      randomizeQuestions: !!document.getElementById('cqRandQ')?.checked,
      randomizeAnswers: !!document.getElementById('cqRandA')?.checked,
      showCorrectAnswers: !!document.getElementById('cqShowAns')?.checked,
      allowRetake: !!document.getElementById('cqRetake')?.checked,
      displayTimer: !!document.getElementById('cqTimer')?.checked,
      negativeMarking: !!document.getElementById('cqNeg')?.checked,
      questionIds: Array.from(selectedQuizQuestionIds),
      createdAt: existingId
        ? QMS.quizzes.get(existingId)?.createdAt || new Date().toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    };

    if (existingId) {
      QMS.quizzes.update(existingId, payload);
      toast(`Quiz "${title}" updated successfully`, 'success');
    } else {
      const created = QMS.quizzes.create(payload);
      toast(`Quiz "${title}" created successfully (ID: ${created.id})`, 'success');
    }

    activeEditQuiz = null;
    buildNotifications();
    location.hash = '#/quizzes';
  }

  // Legacy modal helpers maintained for compatibility
  function openQuizModal(quiz = null) {
    if (quiz) {
      location.hash = `#/quizzes/edit/${quiz.id}`;
    } else {
      location.hash = '#/quizzes/create';
    }
  }

  function saveQuiz(asDraft = false) {
    saveCreateQuiz(asDraft);
  }

  /* ---------- Questions (Phase 7) ---------- */
  let questionFormDirtySnapshot = '';
  let activeQuestionView = null;

  function serializeQuestionForm() {
    const type = document.getElementById('qqType')?.value || 'mcq';
    let specific = '';
    if (type === 'mcq') {
      specific = [
        document.getElementById('qqA')?.value || '',
        document.getElementById('qqB')?.value || '',
        document.getElementById('qqC')?.value || '',
        document.getElementById('qqD')?.value || '',
        document.getElementById('qqCorrectMCQ')?.value || ''
      ].join('||');
    } else if (type === 'truefalse') {
      specific = document.getElementById('qqCorrectTF')?.value || 'True';
    } else if (type === 'short') {
      specific = [
        document.getElementById('qqCorrectShort')?.value || '',
        document.getElementById('qqAltShort')?.value || ''
      ].join('||');
    } else if (type === 'fillblank') {
      specific = [
        document.getElementById('qqCorrectBlank')?.value || '',
        document.getElementById('qqAltBlank')?.value || ''
      ].join('||');
    }
    return [
      document.getElementById('questionFormId')?.value || '',
      document.getElementById('qqText')?.value || '',
      type,
      document.getElementById('qqCategory')?.value || '',
      document.getElementById('qqDifficulty')?.value || '',
      document.getElementById('qqMarks')?.value || '',
      document.getElementById('qqStatus')?.value || '',
      document.getElementById('qqExplanation')?.value || '',
      specific
    ].join('::');
  }

  function filteredQuestions() {
    const q = (document.getElementById('qSearch')?.value || '').toLowerCase().trim();
    const cat = document.getElementById('qFilterCat')?.value || '';
    const diff = document.getElementById('qFilterDiff')?.value || '';
    const type = document.getElementById('qFilterType')?.value || '';
    const status = document.getElementById('qFilterStatus')?.value || '';
    const sortSel = document.getElementById('qSort')?.value;
    if (sortSel) sortState.questions = parseSortValue(sortSel, 'id');

    const filtered = QMS.questions.all().filter((item) => {
      if (q) {
        const idMatch = String(item.id || '').toLowerCase().includes(q);
        const textMatch = String(item.text || '').toLowerCase().includes(q);
        const expMatch = String(item.explanation || '').toLowerCase().includes(q);
        if (!idMatch && !textMatch && !expMatch) return false;
      }
      if (cat && item.categoryId !== cat) return false;
      if (diff && item.difficulty !== diff) return false;
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      return true;
    });

    const totalCountEl = document.getElementById('questionTotalCount');
    if (totalCountEl) totalCountEl.textContent = filtered.length;

    return sortByState(filtered, 'questions', {
      category: (item) => QMS.categoryName(item.categoryId),
      marks: (item) => Number(item.marks) || 0,
      id: (item) => {
        const m = String(item.id).match(/\d+/);
        return m ? parseInt(m[0], 10) : item.id;
      }
    });
  }

  function clearQuestionFilters() {
    const search = document.getElementById('qSearch');
    if (search) search.value = '';
    const cat = document.getElementById('qFilterCat');
    if (cat) cat.value = '';
    const diff = document.getElementById('qFilterDiff');
    if (diff) diff.value = '';
    const type = document.getElementById('qFilterType');
    if (type) type.value = '';
    const status = document.getElementById('qFilterStatus');
    if (status) status.value = '';
    const sort = document.getElementById('qSort');
    if (sort) sort.value = 'id:asc';

    sortState.questions = { key: 'id', dir: 'asc' };
    questionPage = 1;
    renderQuestions();
    toast('Question filters cleared', 'info');
  }

  function formatQuestionTypeBadge(type) {
    const types = {
      mcq: { label: 'Multiple Choice', cls: 'badge-info', icon: 'fa-solid fa-list-ul' },
      truefalse: { label: 'True / False', cls: 'badge-secondary', icon: 'fa-solid fa-check-double' },
      short: { label: 'Short Answer', cls: 'badge-muted', icon: 'fa-solid fa-pen-clip' },
      fillblank: { label: 'Fill Blank', cls: 'badge-warning', icon: 'fa-solid fa-i-cursor' }
    };
    const t = types[type] || { label: type || 'MCQ', cls: 'badge-secondary', icon: 'fa-solid fa-circle-question' };
    return `<span class="badge-soft ${t.cls}"><i class="${t.icon} me-1"></i>${esc(t.label)}</span>`;
  }

  function formatCorrectAnswerDisplay(item) {
    if (item.type === 'mcq') {
      const optText = item.options?.[item.correctAnswer] ? ` — ${item.options[item.correctAnswer]}` : '';
      return `<span class="badge bg-success text-white me-1">${esc(item.correctAnswer)}</span><span class="small text-muted">${esc(optText)}</span>`;
    }
    if (item.type === 'truefalse') {
      const isTrue = item.correctAnswer === 'True' || item.correctAnswer === 'true' || item.correctAnswer === 'A';
      return `<span class="badge ${isTrue ? 'bg-success' : 'bg-danger'} text-white">${isTrue ? 'True' : 'False'}</span>`;
    }
    if (item.type === 'short' || item.type === 'fillblank') {
      return `<code class="px-2 py-1 bg-light border rounded text-dark">${esc(item.correctAnswer)}</code>`;
    }
    return esc(item.correctAnswer || '—');
  }

  function renderQuestions() {
    const list = filteredQuestions();
    const totalPages = Math.max(1, Math.ceil(list.length / questionPageSize));
    if (questionPage > totalPages) questionPage = totalPages;
    const slice = list.slice((questionPage - 1) * questionPageSize, questionPage * questionPageSize);

    // Desktop table
    const tbody = document.getElementById('questionTableBody');
    if (tbody) {
      if (slice.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4"><i class="fa-solid fa-circle-question fa-2x mb-2 d-block opacity-50"></i>No questions found matching your criteria.</td></tr>`;
      } else {
        tbody.innerHTML = slice
          .map((item) => {
            const shortText = item.text.length > 70 ? item.text.slice(0, 70) + '…' : item.text;
            return `<tr>
              <td data-label="ID"><span class="badge bg-light text-dark border font-monospace">${esc(item.id)}</span></td>
              <td data-label="Question">
                <div class="fw-semibold text-dark text-truncate" style="max-width:320px;cursor:pointer" data-q-view="${item.id}" title="${esc(item.text)}">
                  ${esc(shortText)}
                </div>
              </td>
              <td data-label="Category">${esc(QMS.categoryName(item.categoryId))}</td>
              <td data-label="Difficulty">${statusBadge(item.difficulty)}</td>
              <td data-label="Type">${formatQuestionTypeBadge(item.type)}</td>
              <td data-label="Correct Answer">${formatCorrectAnswerDisplay(item)}</td>
              <td data-label="Marks"><span class="badge bg-light text-brand border fw-bold">${esc(item.marks)}</span></td>
              <td data-label="Status">${statusBadge(item.status)}</td>
              <td data-label="Actions" class="action-btns">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-q-view="${item.id}" title="View Details" aria-label="View Question">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-brand" data-q-edit="${item.id}" title="Edit Question" aria-label="Edit Question">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-info" data-q-dup="${item.id}" title="Duplicate Question" aria-label="Duplicate Question">
                  <i class="fa-solid fa-copy"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-${item.status === 'Active' ? 'warning' : 'success'}" data-q-toggle="${item.id}" title="${item.status === 'Active' ? 'Deactivate' : 'Activate'}" aria-label="Toggle Status">
                  <i class="fa-solid fa-${item.status === 'Active' ? 'ban' : 'check'}"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-q-del="${item.id}" title="Delete Question" aria-label="Delete Question">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </td>
            </tr>`;
          })
          .join('');
      }
    }

    // Mobile cards
    const cardsEl = document.getElementById('questionMobileCards');
    if (cardsEl) {
      if (slice.length === 0) {
        cardsEl.innerHTML = '<div class="empty-state text-center py-4 text-muted">No questions found</div>';
      } else {
        cardsEl.innerHTML = slice
          .map((item) => {
            return `<div class="mobile-card p-3 mb-3 border rounded bg-white shadow-sm">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <span class="badge bg-light text-dark border font-monospace">${esc(item.id)}</span>
                <div class="d-flex gap-1 align-items-center">
                  ${formatQuestionTypeBadge(item.type)}
                  ${statusBadge(item.status)}
                </div>
              </div>
              <h5 class="fs-6 fw-bold mb-2 text-dark" style="cursor:pointer" data-q-view="${item.id}">${esc(item.text)}</h5>
              <div class="small text-muted mb-2 d-flex flex-wrap gap-2">
                <span><i class="fa-solid fa-folder me-1"></i>${esc(QMS.categoryName(item.categoryId))}</span>
                <span>•</span>
                <span>${statusBadge(item.difficulty)}</span>
                <span>•</span>
                <span>Marks: <strong>${esc(item.marks)}</strong></span>
              </div>
              <div class="p-2 mb-2 rounded bg-light border small">
                <strong>Correct:</strong> ${formatCorrectAnswerDisplay(item)}
              </div>
              <div class="action-btns d-flex flex-wrap gap-1 mt-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-q-view="${item.id}"><i class="fa-solid fa-eye me-1"></i>View</button>
                <button type="button" class="btn btn-sm btn-outline-brand" data-q-edit="${item.id}"><i class="fa-solid fa-pen me-1"></i>Edit</button>
                <button type="button" class="btn btn-sm btn-outline-info" data-q-dup="${item.id}"><i class="fa-solid fa-copy me-1"></i>Copy</button>
                <button type="button" class="btn btn-sm btn-outline-${item.status === 'Active' ? 'warning' : 'success'}" data-q-toggle="${item.id}">
                  <i class="fa-solid fa-${item.status === 'Active' ? 'ban' : 'check'} me-1"></i>${item.status === 'Active' ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-q-del="${item.id}"><i class="fa-solid fa-trash me-1"></i>Del</button>
              </div>
            </div>`;
          })
          .join('');
      }
    }

    TableHelper.renderPagination({
      containerId: 'qPagination',
      currentPage: questionPage,
      totalPages,
      totalItems: list.length,
      pageSize: questionPageSize,
      onPageChange: (p) => {
        questionPage = p;
        renderQuestions();
      },
      onPageSizeChange: (s) => {
        questionPageSize = s;
        questionPage = 1;
        renderQuestions();
      }
    });
  }

  function openQuestionViewModal(question) {
    if (!question) return;
    activeQuestionView = question;

    document.getElementById('questionViewTitle').textContent = `Question Details: ${question.id}`;
    const badgeEl = document.getElementById('questionViewStatusBadge');
    if (badgeEl) badgeEl.innerHTML = statusBadge(question.status);

    const metaEl = document.getElementById('questionViewMeta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="row g-2 small">
          <div class="col-6 col-md-3"><strong>Category:</strong> ${esc(QMS.categoryName(question.categoryId))}</div>
          <div class="col-6 col-md-3"><strong>Difficulty:</strong> ${statusBadge(question.difficulty)}</div>
          <div class="col-6 col-md-3"><strong>Type:</strong> ${formatQuestionTypeBadge(question.type)}</div>
          <div class="col-6 col-md-3"><strong>Marks:</strong> <span class="badge bg-light text-brand border fw-bold">${esc(question.marks)}</span></div>
        </div>
      `;
    }

    const textEl = document.getElementById('questionViewText');
    if (textEl) {
      let displayText = esc(question.text);
      if (question.type === 'fillblank') {
        displayText = displayText.replace(/_{3,}/g, '<span class="badge bg-warning text-dark px-2 py-1 mx-1 border">____</span>');
      }
      textEl.innerHTML = displayText;
    }

    const ansSection = document.getElementById('questionViewAnswerSection');
    if (ansSection) {
      if (question.type === 'mcq') {
        const opts = question.options || {};
        ansSection.innerHTML = `
          <div class="list-group list-group-flush">
            ${['A', 'B', 'C', 'D'].map((key) => {
              const isCorrect = String(question.correctAnswer).toUpperCase() === key;
              return `
                <div class="list-group-item d-flex align-items-center justify-content-between p-2 rounded mb-1 ${isCorrect ? 'border border-success bg-success-subtle text-success-emphasis fw-bold' : 'bg-white border'}">
                  <div>
                    <span class="badge ${isCorrect ? 'bg-success text-white' : 'bg-secondary text-white'} me-2">${key}</span>
                    <span>${esc(opts[key] || '—')}</span>
                  </div>
                  ${isCorrect ? '<span class="badge bg-success text-white"><i class="fa-solid fa-check me-1"></i>Correct Answer</span>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else if (question.type === 'truefalse') {
        const isTrue = question.correctAnswer === 'True' || question.correctAnswer === 'true' || question.correctAnswer === 'A';
        ansSection.innerHTML = `
          <div class="row g-2">
            <div class="col-6">
              <div class="p-3 rounded text-center border ${isTrue ? 'border-success bg-success-subtle text-success fw-bold' : 'bg-white text-muted'}">
                <i class="fa-solid fa-${isTrue ? 'circle-check' : 'circle'} me-1"></i> True
                ${isTrue ? ' <span class="badge bg-success ms-1">Correct</span>' : ''}
              </div>
            </div>
            <div class="col-6">
              <div class="p-3 rounded text-center border ${!isTrue ? 'border-success bg-success-subtle text-success fw-bold' : 'bg-white text-muted'}">
                <i class="fa-solid fa-${!isTrue ? 'circle-check' : 'circle'} me-1"></i> False
                ${!isTrue ? ' <span class="badge bg-success ms-1">Correct</span>' : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        const alts = Array.isArray(question.acceptedAlternatives)
          ? question.acceptedAlternatives
          : String(question.acceptedAlternatives || '').split(',').map((s) => s.trim()).filter(Boolean);
        ansSection.innerHTML = `
          <div class="mb-2">
            <div class="small text-muted mb-1">Expected Answer:</div>
            <div class="p-2 rounded bg-white border fw-bold text-success font-monospace fs-6">
              <i class="fa-solid fa-circle-check me-1"></i>${esc(question.correctAnswer)}
            </div>
          </div>
          ${alts.length ? `
            <div class="mt-2 small">
              <span class="text-muted">Accepted Alternatives:</span>
              <div class="d-flex flex-wrap gap-1 mt-1">
                ${alts.map((a) => `<span class="badge bg-white border text-dark font-monospace">${esc(a)}</span>`).join('')}
              </div>
            </div>` : ''}
        `;
      }
    }

    const expEl = document.getElementById('questionViewExplanation');
    if (expEl) {
      expEl.innerHTML = question.explanation
        ? `<div class="text-dark">${esc(question.explanation)}</div>`
        : '<span class="text-muted fst-italic">No explanation provided for this question.</span>';
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('questionViewModal')).show();
  }

  function syncQuestionTypeFields() {
    const type = document.getElementById('qqType')?.value || 'mcq';
    document.getElementById('mcqFields')?.classList.toggle('d-none', type !== 'mcq');
    document.getElementById('tfFields')?.classList.toggle('d-none', type !== 'truefalse');
    document.getElementById('shortFields')?.classList.toggle('d-none', type !== 'short');
    document.getElementById('blankFields')?.classList.toggle('d-none', type !== 'fillblank');

    const insertBlankBtn = document.getElementById('btnInsertBlank');
    if (insertBlankBtn) insertBlankBtn.classList.toggle('d-none', type !== 'fillblank');

    checkBlankWarning();
  }

  function checkBlankWarning() {
    const type = document.getElementById('qqType')?.value;
    const warning = document.getElementById('qqBlankWarning');
    if (!warning) return;
    if (type === 'fillblank') {
      const text = document.getElementById('qqText')?.value || '';
      const hasBlank = /_{3,}/.test(text);
      warning.classList.toggle('d-none', hasBlank);
    } else {
      warning.classList.add('d-none');
    }
  }

  function insertBlankMarker() {
    const ta = document.getElementById('qqText');
    if (!ta) return;
    const marker = ' ____ ';
    const start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
    ta.value = ta.value.substring(0, start) + marker + ta.value.substring(end);
    if (typeof ta.focus === 'function') ta.focus();
    ta.selectionStart = ta.selectionEnd = start + marker.length;
    checkBlankWarning();
  }

  function openQuestionModal(question = null) {
    const form = document.getElementById('questionForm');
    form.reset();
    form.classList.remove('was-validated');
    clearFormValidation(form);

    document.getElementById('questionFormId').value = question?.id || '';
    document.getElementById('questionModalTitle').textContent = question ? `Edit Question: ${question.id}` : 'Add New Question';
    document.getElementById('qqText').value = question?.text || '';
    document.getElementById('qqType').value = question?.type || 'mcq';
    document.getElementById('qqCategory').innerHTML = optionCategories(question?.categoryId || '');
    document.getElementById('qqDifficulty').value = question?.difficulty || 'Easy';
    document.getElementById('qqMarks').value = question?.marks ?? 5;
    document.getElementById('qqExplanation').value = question?.explanation || '';
    document.getElementById('qqStatus').value = question?.status || 'Active';

    // MCQ
    document.getElementById('qqA').value = question?.options?.A || '';
    document.getElementById('qqB').value = question?.options?.B || '';
    document.getElementById('qqC').value = question?.options?.C || '';
    document.getElementById('qqD').value = question?.options?.D || '';
    document.getElementById('qqCorrectMCQ').value = question?.type === 'mcq' ? (question.correctAnswer || 'A') : 'A';

    // True/False
    const isFalse = question?.type === 'truefalse' && (question.correctAnswer === 'False' || question.correctAnswer === 'B');
    const tfTrueRadio = document.getElementById('qqTF_True');
    const tfFalseRadio = document.getElementById('qqTF_False');
    if (tfTrueRadio && tfFalseRadio) {
      tfTrueRadio.checked = !isFalse;
      tfFalseRadio.checked = isFalse;
    }
    const tfHidden = document.getElementById('qqCorrectTF');
    if (tfHidden) tfHidden.value = isFalse ? 'False' : 'True';

    // Short Answer
    document.getElementById('qqCorrectShort').value = question?.type === 'short' ? (question.correctAnswer || '') : '';
    const altShortStr = Array.isArray(question?.acceptedAlternatives)
      ? question.acceptedAlternatives.join(', ')
      : (question?.acceptedAlternatives || '');
    document.getElementById('qqAltShort').value = question?.type === 'short' ? altShortStr : '';

    // Fill in the Blank
    document.getElementById('qqCorrectBlank').value = question?.type === 'fillblank' ? (question.correctAnswer || '') : '';
    const altBlankStr = Array.isArray(question?.acceptedAlternatives)
      ? question.acceptedAlternatives.join(', ')
      : (question?.acceptedAlternatives || '');
    document.getElementById('qqAltBlank').value = question?.type === 'fillblank' ? altBlankStr : '';

    syncQuestionTypeFields();
    questionFormDirtySnapshot = serializeQuestionForm();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('questionModal')).show();
  }

  function saveQuestion(keepOpen = false) {
    const form = document.getElementById('questionForm');
    clearFormValidation(form);

    let valid = true;
    const errors = [];

    const textEl = document.getElementById('qqText');
    const textVal = (textEl?.value || '').trim();
    if (!textVal) {
      setFieldValidation(textEl, false, 'Question text is required.');
      valid = false;
      errors.push('Question text is required.');
    } else {
      setFieldValidation(textEl, true);
    }

    const catEl = document.getElementById('qqCategory');
    const catVal = catEl?.value || '';
    if (!catVal) {
      setFieldValidation(catEl, false, 'Please select a category.');
      valid = false;
      errors.push('Please select a category.');
    } else {
      setFieldValidation(catEl, true);
    }

    const marksEl = document.getElementById('qqMarks');
    const marksVal = Number(marksEl?.value);
    if (isNaN(marksVal) || marksVal <= 0) {
      setFieldValidation(marksEl, false, 'Marks must be a positive number greater than 0.');
      valid = false;
      errors.push('Marks must be a positive number.');
    } else {
      setFieldValidation(marksEl, true);
    }

    const type = document.getElementById('qqType').value;
    let options = {};
    let correctAnswer = '';
    let acceptedAlternatives = [];

    if (type === 'mcq') {
      const a = (document.getElementById('qqA')?.value || '').trim();
      const b = (document.getElementById('qqB')?.value || '').trim();
      const c = (document.getElementById('qqC')?.value || '').trim();
      const d = (document.getElementById('qqD')?.value || '').trim();

      setFieldValidation(document.getElementById('qqA'), !!a, a ? '' : 'Option A is required.');
      setFieldValidation(document.getElementById('qqB'), !!b, b ? '' : 'Option B is required.');
      setFieldValidation(document.getElementById('qqC'), !!c, c ? '' : 'Option C is required.');
      setFieldValidation(document.getElementById('qqD'), !!d, d ? '' : 'Option D is required.');

      if (!a || !b || !c || !d) {
        valid = false;
        errors.push('All four Multiple Choice options are required.');
      } else {
        const uniqueSet = new Set([a, b, c, d].map((s) => s.toLowerCase()));
        if (uniqueSet.size < 4) {
          valid = false;
          errors.push('All four Multiple Choice options must be unique.');
          setFieldValidation(document.getElementById('qqA'), false, 'All options must be unique.');
          setFieldValidation(document.getElementById('qqB'), false, 'All options must be unique.');
          setFieldValidation(document.getElementById('qqC'), false, 'All options must be unique.');
          setFieldValidation(document.getElementById('qqD'), false, 'All options must be unique.');
        }
      }

      options = { A: a, B: b, C: c, D: d };
      correctAnswer = document.getElementById('qqCorrectMCQ')?.value || 'A';
    } else if (type === 'truefalse') {
      options = { A: 'True', B: 'False' };
      correctAnswer = document.getElementById('qqCorrectTF')?.value || (document.getElementById('qqTF_False')?.checked ? 'False' : 'True');
    } else if (type === 'short') {
      const expEl = document.getElementById('qqCorrectShort');
      const expVal = (expEl?.value || '').trim();
      if (!expVal) {
        setFieldValidation(expEl, false, 'Expected answer is required.');
        valid = false;
        errors.push('Expected answer is required.');
      } else {
        setFieldValidation(expEl, true);
      }
      correctAnswer = expVal;
      const altStr = (document.getElementById('qqAltShort')?.value || '').trim();
      if (altStr) {
        acceptedAlternatives = altStr.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (type === 'fillblank') {
      const blankEl = document.getElementById('qqCorrectBlank');
      const blankVal = (blankEl?.value || '').trim();
      if (!blankVal) {
        setFieldValidation(blankEl, false, 'Correct answer for the blank is required.');
        valid = false;
        errors.push('Correct answer for the blank is required.');
      } else {
        setFieldValidation(blankEl, true);
      }
      correctAnswer = blankVal;

      if (!/_{3,}/.test(textVal)) {
        checkBlankWarning();
      }

      const altStr = (document.getElementById('qqAltBlank')?.value || '').trim();
      if (altStr) {
        acceptedAlternatives = altStr.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    if (!valid) {
      form.classList.add('was-validated');
      toast(errors[0] || 'Please fix validation errors', 'error');
      return;
    }

    const id = document.getElementById('questionFormId').value;
    const payload = {
      text: textVal,
      type,
      categoryId: catVal,
      difficulty: document.getElementById('qqDifficulty').value,
      marks: marksVal,
      explanation: (document.getElementById('qqExplanation')?.value || '').trim(),
      status: document.getElementById('qqStatus').value,
      options,
      correctAnswer,
      acceptedAlternatives
    };

    let savedRecord = null;
    if (id) {
      savedRecord = QMS.questions.update(id, payload);
      toast(`Question "${id}" updated successfully`, 'success');
    } else {
      savedRecord = QMS.questions.create(payload);
      toast(`Question created successfully (${savedRecord.id})`, 'success');
    }

    renderQuestions();
    if (document.getElementById('page-create-quiz')?.classList.contains('active')) {
      renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
      updateQuestionCounterBadge();
    }

    if (keepOpen) {
      document.getElementById('questionFormId').value = savedRecord.id;
      document.getElementById('questionModalTitle').textContent = `Edit Question: ${savedRecord.id}`;
      questionFormDirtySnapshot = serializeQuestionForm();
    } else {
      bootstrap.Modal.getInstance(document.getElementById('questionModal'))?.hide();
      questionFormDirtySnapshot = '';
    }
  }

  function resetQuestionForm() {
    const id = document.getElementById('questionFormId').value;
    if (id) {
      const q = QMS.questions.get(id);
      if (q) return openQuestionModal(q);
    }
    const form = document.getElementById('questionForm');
    form.reset();
    form.classList.remove('was-validated');
    clearFormValidation(form);
    document.getElementById('qqMarks').value = 5;
    document.getElementById('qqCategory').innerHTML = optionCategories();
    document.getElementById('qqType').value = 'mcq';
    syncQuestionTypeFields();
    questionFormDirtySnapshot = serializeQuestionForm();
    toast('Form reset', 'info');
  }

  async function cancelQuestionModal() {
    const isDirty = serializeQuestionForm() !== questionFormDirtySnapshot;
    if (isDirty) {
      const ok = await confirmDialog({
        title: 'Discard Changes?',
        message: 'You have unsaved changes in this question form. Are you sure you want to cancel?',
        confirmText: 'Discard & Close',
        type: 'warning'
      });
      if (!ok) return;
    }
    bootstrap.Modal.getInstance(document.getElementById('questionModal'))?.hide();
    questionFormDirtySnapshot = '';
  }

  /* ---------- Categories ---------- */
  let activeEditingCat = null;
  let categoryFormInitialState = null;

  function categoryQuizCount(c) {
    if (!c) return 0;
    const cid = String(c.id || '').toLowerCase();
    const alt = c.altId ? String(c.altId).toLowerCase() : '';
    return QMS.quizzes.all().filter((x) => {
      const qcid = String(x.categoryId || '').toLowerCase();
      return qcid === cid || (alt && qcid === alt);
    }).length;
  }

  function categoryQuestionCount(c) {
    if (!c) return 0;
    const cid = String(c.id || '').toLowerCase();
    const alt = c.altId ? String(c.altId).toLowerCase() : '';
    return QMS.questions.all().filter((x) => {
      const qcid = String(x.categoryId || '').toLowerCase();
      return qcid === cid || (alt && qcid === alt);
    }).length;
  }

  function categoryLinkedQuizzes(c) {
    if (!c) return [];
    const cid = String(c.id || '').toLowerCase();
    const alt = c.altId ? String(c.altId).toLowerCase() : '';
    return QMS.quizzes.all().filter((x) => {
      const qcid = String(x.categoryId || '').toLowerCase();
      return qcid === cid || (alt && qcid === alt);
    });
  }

  function categoryLinkedQuestions(c) {
    if (!c) return [];
    const cid = String(c.id || '').toLowerCase();
    const alt = c.altId ? String(c.altId).toLowerCase() : '';
    return QMS.questions.all().filter((x) => {
      const qcid = String(x.categoryId || '').toLowerCase();
      return qcid === cid || (alt && qcid === alt);
    });
  }

  function filteredCategories() {
    const q = (document.getElementById('catSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('catFilterStatus')?.value || '';
    const sortSel = document.getElementById('catSort')?.value;
    if (sortSel) sortState.categories = parseSortValue(sortSel, 'name');

    const filtered = QMS.categories.all().filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.description || ''} ${c.id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && c.status !== status) return false;
      return true;
    });

    return sortByState(filtered, 'categories', {
      quizzes: (c) => categoryQuizCount(c),
      questions: (c) => categoryQuestionCount(c)
    });
  }

  function renderCategories() {
    const list = filteredCategories();
    const totalEl = document.getElementById('catTotalCount');
    if (totalEl) totalEl.textContent = list.length;

    // Sync sort dropdown if header sort was clicked
    const sortSel = document.getElementById('catSort');
    if (sortSel && sortSel.options && sortState.categories) {
      const candidate = `${sortState.categories.key}:${sortState.categories.dir}`;
      if (Array.from(sortSel.options).some((o) => o.value === candidate)) {
        sortSel.value = candidate;
      }
    }

    const totalPages = Math.max(1, Math.ceil(list.length / catPageSize));
    if (catPage > totalPages) catPage = totalPages;
    const slice = list.slice((catPage - 1) * catPageSize, catPage * catPageSize);

    const tbody = document.getElementById('categoryTableBody');
    if (tbody) {
      tbody.innerHTML =
        slice
          .map((c) => {
            const quizzes = categoryQuizCount(c);
            const questions = categoryQuestionCount(c);
            const descTrunc = c.description
              ? (c.description.length > 75 ? `${esc(c.description.slice(0, 75))}…` : esc(c.description))
              : '<span class="text-muted fst-italic">None</span>';

            return `<tr>
              <td data-label="Category Name">
                <div class="fw-bold">${esc(c.name)}</div>
                <div class="small text-muted font-monospace">${esc(c.id)}</div>
              </td>
              <td data-label="Description" title="${esc(c.description || '')}">${descTrunc}</td>
              <td data-label="Quizzes">
                <span class="badge bg-light text-dark border"><i class="fa-solid fa-layer-group me-1 text-primary"></i>${quizzes}</span>
              </td>
              <td data-label="Questions">
                <span class="badge bg-light text-dark border"><i class="fa-solid fa-circle-question me-1 text-info"></i>${questions}</span>
              </td>
              <td data-label="Status">
                <button class="btn btn-sm p-0 border-0 bg-transparent" data-cat-toggle="${c.id}" title="Click to toggle status">
                  ${statusBadge(c.status)}
                </button>
              </td>
              <td data-label="Created">${esc(c.createdAt || '—')}</td>
              <td data-label="Actions" class="action-btns">
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-secondary" data-cat-view="${c.id}" title="View Details">
                    <i class="fa-solid fa-eye"></i>
                  </button>
                  <button class="btn btn-outline-brand" data-cat-edit="${c.id}" title="Edit Category">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button class="btn btn-outline-danger" data-cat-del="${c.id}" title="Delete Category">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`;
          })
          .join('') || `<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-folder-open fa-2x mb-2 text-secondary opacity-50 d-block"></i>No categories found matching your criteria.</td></tr>`;
    }

    const cardsEl = document.getElementById('categoryMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        slice
          .map((c) => {
            const quizzes = categoryQuizCount(c);
            const questions = categoryQuestionCount(c);
            return `<div class="mobile-card">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h4 class="mb-0">${esc(c.name)}</h4>
                  <small class="text-muted font-monospace">${esc(c.id)}</small>
                </div>
                <button class="btn btn-sm p-0 border-0 bg-transparent" data-cat-toggle="${c.id}" title="Click to toggle status">
                  ${statusBadge(c.status)}
                </button>
              </div>
              <p class="mobile-desc small text-secondary mb-2">${esc(c.description || 'No description provided.')}</p>
              <div class="mobile-meta small text-muted mb-3 d-flex gap-2">
                <span><i class="fa-solid fa-layer-group me-1 text-primary"></i>${quizzes} quizzes</span>
                <span>•</span>
                <span><i class="fa-solid fa-circle-question me-1 text-info"></i>${questions} questions</span>
                <span>•</span>
                <span><i class="fa-regular fa-calendar me-1"></i>${esc(c.createdAt || '—')}</span>
              </div>
              <div class="action-btns d-flex gap-2">
                <button class="btn btn-sm btn-outline-secondary flex-grow-1" data-cat-view="${c.id}"><i class="fa-solid fa-eye me-1"></i>View</button>
                <button class="btn btn-sm btn-outline-brand flex-grow-1" data-cat-edit="${c.id}"><i class="fa-solid fa-pen-to-square me-1"></i>Edit</button>
                <button class="btn btn-sm btn-outline-danger" data-cat-del="${c.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>`;
          })
          .join('') || '<div class="empty-state text-center py-4 text-muted"><i class="fa-solid fa-folder-open fa-2x mb-2 opacity-50 d-block"></i>No categories found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'catPagination',
      currentPage: catPage,
      totalPages,
      totalItems: list.length,
      pageSize: catPageSize,
      onPageChange: (p) => {
        catPage = p;
        renderCategories();
      },
      onPageSizeChange: (s) => {
        catPageSize = s;
        catPage = 1;
        renderCategories();
      }
    });
  }

  function clearCategoryFilters() {
    const s = document.getElementById('catSearch');
    if (s) s.value = '';
    const f = document.getElementById('catFilterStatus');
    if (f) f.value = '';
    const sortSel = document.getElementById('catSort');
    if (sortSel) sortSel.value = 'name:asc';
    sortState.categories = { key: 'name', dir: 'asc' };
    catPage = 1;
    renderCategories();
    toast('Category filters cleared', 'info');
  }

  function openCategoryModal(cat = null) {
    const form = document.getElementById('categoryForm');
    if (form) {
      form.reset();
      form.classList.remove('was-validated');
      clearFormValidation(form);
    }
    activeEditingCat = cat;
    const isEdit = !!cat;
    document.getElementById('categoryFormId').value = cat?.id || '';
    document.getElementById('categoryModalTitle').textContent = isEdit ? 'Edit Category' : 'Add Category';
    document.getElementById('cfName').value = cat?.name || '';
    document.getElementById('cfDescription').value = cat?.description || '';
    document.getElementById('cfStatus').value = cat?.status || 'Active';

    const descCount = document.getElementById('cfDescCount');
    if (descCount) descCount.textContent = (cat?.description || '').length;

    categoryFormInitialState = {
      id: cat?.id || '',
      name: cat?.name || '',
      description: cat?.description || '',
      status: cat?.status || 'Active'
    };

    bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryModal')).show();
    setTimeout(() => document.getElementById('cfName')?.focus(), 200);
  }

  function resetCategoryForm() {
    const form = document.getElementById('categoryForm');
    if (!form) return;
    clearFormValidation(form);
    if (activeEditingCat) {
      document.getElementById('cfName').value = activeEditingCat.name || '';
      document.getElementById('cfDescription').value = activeEditingCat.description || '';
      document.getElementById('cfStatus').value = activeEditingCat.status || 'Active';
    } else {
      document.getElementById('cfName').value = '';
      document.getElementById('cfDescription').value = '';
      document.getElementById('cfStatus').value = 'Active';
    }
    const descCount = document.getElementById('cfDescCount');
    if (descCount) descCount.textContent = document.getElementById('cfDescription').value.length;
    toast('Category form reset', 'info');
  }

  async function cancelCategoryModal() {
    const nameVal = (document.getElementById('cfName')?.value || '').trim();
    const descVal = (document.getElementById('cfDescription')?.value || '').trim();
    const statusVal = document.getElementById('cfStatus')?.value || 'Active';
    const initial = categoryFormInitialState || { name: '', description: '', status: 'Active' };

    const isDirty = nameVal !== initial.name || descVal !== initial.description || statusVal !== initial.status;
    if (isDirty) {
      const ok = await confirmDialog({
        title: 'Discard Changes',
        message: 'You have unsaved changes in this category. Are you sure you want to discard them?',
        confirmText: 'Discard',
        type: 'warning'
      });
      if (!ok) return;
    }
    bootstrap.Modal.getInstance(document.getElementById('categoryModal'))?.hide();
  }

  function saveCategory() {
    const form = document.getElementById('categoryForm');
    const nameEl = document.getElementById('cfName');
    const descEl = document.getElementById('cfDescription');
    const statusEl = document.getElementById('cfStatus');
    const nameVal = (nameEl?.value || '').trim();
    const descVal = (descEl?.value || '').trim();
    const statusVal = statusEl?.value || 'Active';
    const id = document.getElementById('categoryFormId')?.value || '';

    // Validation 1: Required
    const reqCheck = Validators.required(nameVal, 'Category name');
    if (!reqCheck.valid) {
      setFieldValidation(nameEl, false, reqCheck.message);
      toast(reqCheck.message, 'error');
      nameEl?.focus();
      return;
    }

    // Validation 2: Unique
    const uniqueCheck = Validators.uniqueName('categories', 'name', nameVal, id);
    if (!uniqueCheck.valid) {
      setFieldValidation(nameEl, false, uniqueCheck.message);
      toast(uniqueCheck.message, 'error');
      nameEl?.focus();
      return;
    }
    setFieldValidation(nameEl, true);

    // Validation 3: Description length <= 300
    if (descVal.length > 300) {
      setFieldValidation(descEl, false, 'Description must not exceed 300 characters.');
      toast('Description must not exceed 300 characters', 'error');
      descEl?.focus();
      return;
    }
    setFieldValidation(descEl, true);

    const existing = id ? QMS.categories.get(id) : null;
    const payload = {
      name: nameVal,
      description: descVal,
      status: statusVal,
      createdAt: existing?.createdAt || new Date().toISOString().slice(0, 10)
    };

    if (id) {
      QMS.categories.update(id, payload);
      toast(`Category "${nameVal}" updated successfully`, 'success');
    } else {
      const created = QMS.categories.create(payload);
      toast(`Category "${nameVal}" created successfully (${created.id})`, 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('categoryModal'))?.hide();
    renderCategories();
    refreshCategoryDropdowns();
  }

  function openCategoryViewModal(catIdOrObj) {
    const cat = typeof catIdOrObj === 'string' ? QMS.categories.get(catIdOrObj) : catIdOrObj;
    if (!cat) return;

    document.getElementById('catViewTitle').textContent = cat.name;
    document.getElementById('catViewId').textContent = cat.id;
    const statusBadgeEl = document.getElementById('catViewStatus');
    if (statusBadgeEl) {
      statusBadgeEl.className = `badge ${cat.status === 'Active' ? 'bg-success' : 'bg-secondary'}`;
      statusBadgeEl.textContent = cat.status;
    }
    document.getElementById('catViewDesc').textContent = cat.description || 'No description provided.';
    document.getElementById('catViewCreated').textContent = cat.createdAt || '—';

    const quizzes = categoryLinkedQuizzes(cat);
    const questions = categoryLinkedQuestions(cat);

    document.getElementById('catViewQuizCount').textContent = quizzes.length;
    document.getElementById('catViewQuizBadge').textContent = quizzes.length;
    document.getElementById('catViewQuestionCount').textContent = questions.length;
    document.getElementById('catViewQuestionBadge').textContent = questions.length;

    const quizListEl = document.getElementById('catViewQuizzesList');
    if (quizListEl) {
      quizListEl.innerHTML = quizzes.length
        ? quizzes
            .map(
              (q) => `
          <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-2">
            <div class="text-truncate me-2" title="${esc(q.title)}">
              <strong>${esc(q.title)}</strong>
              <div class="text-muted font-monospace small">${q.id}</div>
            </div>
            <span class="badge ${q.status === 'Active' ? 'bg-success' : q.status === 'Draft' ? 'bg-warning text-dark' : 'bg-secondary'}">${q.status}</span>
          </li>
        `
            )
            .join('')
        : '<li class="list-group-item text-muted text-center py-3">No quizzes linked to this category</li>';
    }

    const qListEl = document.getElementById('catViewQuestionsList');
    if (qListEl) {
      qListEl.innerHTML = questions.length
        ? questions
            .map(
              (qu) => `
          <li class="list-group-item d-flex justify-content-between align-items-center py-2 px-2">
            <div class="text-truncate me-2" title="${esc(qu.text)}">
              <span>${esc(qu.text)}</span>
              <div class="text-muted font-monospace small">${qu.id}</div>
            </div>
            <span class="badge bg-light text-dark border">${qu.type || 'MCQ'}</span>
          </li>
        `
            )
            .join('')
        : '<li class="list-group-item text-muted text-center py-3">No questions linked to this category</li>';
    }

    const editBtn = document.getElementById('btnCategoryViewEdit');
    if (editBtn) {
      editBtn.dataset.catId = cat.id;
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('categoryViewModal')).show();
  }

  function refreshCategoryDropdowns() {
    const quizFilter = document.getElementById('quizFilterCat');
    if (quizFilter) {
      const prev = quizFilter.value;
      quizFilter.innerHTML = '<option value="">All Categories</option>' + optionCategories(prev);
      if (prev) quizFilter.value = prev;
    }
    const qFilter = document.getElementById('qFilterCat');
    if (qFilter) {
      const prev = qFilter.value;
      qFilter.innerHTML = '<option value="">All Categories</option>' + optionCategories(prev);
      if (prev) qFilter.value = prev;
    }
    const cqCat = document.getElementById('cqCategory');
    if (cqCat) {
      const prev = cqCat.value;
      cqCat.innerHTML = optionCategories(prev);
      if (prev) cqCat.value = prev;
    }
    const qqCat = document.getElementById('qqCategory');
    if (qqCat) {
      const prev = qqCat.value;
      qqCat.innerHTML = optionCategories(prev);
      if (prev) qqCat.value = prev;
    }
    const qfCat = document.getElementById('qfCategory');
    if (qfCat) {
      const prev = qfCat.value;
      qfCat.innerHTML = optionCategories(prev);
      if (prev) qfCat.value = prev;
    }
    const lbCat = document.getElementById('lbCategory');
    if (lbCat) {
      const prev = lbCat.value;
      lbCat.innerHTML = '<option value="">All Categories</option>' + optionCategories(prev);
      if (prev) lbCat.value = prev;
      lbCat.dataset.ready = '';
    }
    const repCat = document.getElementById('repCategory');
    if (repCat) {
      const prev = repCat.value;
      repCat.innerHTML = '<option value="">All Categories</option>' + optionCategories(prev);
      if (prev) repCat.value = prev;
    }
  }

  /* ---------- Participants ---------- */
  let activeEditingParticipant = null;
  let activeProfileParticipant = null;
  let participantFormInitialState = null;

  function participantStats(p) {
    if (!p) return { totalAttempts: 0, totalQuizzes: 0, completed: 0, avg: 0, best: 0, passed: 0, passRate: 0, rows: [] };
    const pid = String(p.id || '').toLowerCase();
    const rows = QMS.results.all().filter((r) => String(r.participantId).toLowerCase() === pid);
    const quizSet = new Set(rows.map((r) => r.quizId));
    const completedRows = rows.filter((r) => r.completed !== false);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0) / rows.length) : 0;
    const best = rows.length ? Math.max(...rows.map((r) => Number(r.percentage) || 0)) : 0;
    const passed = rows.filter((r) => r.status === 'Passed' || r.passed === true).length;
    const passRate = rows.length ? Math.round((passed / rows.length) * 100) : 0;
    return {
      totalAttempts: rows.length,
      totalQuizzes: quizSet.size,
      completed: completedRows.length,
      avg,
      best,
      passed,
      passRate,
      rows
    };
  }

  function filteredParticipants() {
    const q = (document.getElementById('partSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('partFilterStatus')?.value || '';
    const dateFrom = document.getElementById('partDateFrom')?.value || '';
    const dateTo = document.getElementById('partDateTo')?.value || '';
    const sortSel = document.getElementById('partSort')?.value;
    if (sortSel) sortState.participants = parseSortValue(sortSel, 'name');

    const filtered = QMS.participants.all().filter((p) => {
      if (q) {
        const hay = `${p.id || ''} ${p.name || ''} ${p.email || ''} ${p.phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && p.status !== status) return false;
      if (dateFrom && p.registeredAt && p.registeredAt < dateFrom) return false;
      if (dateTo && p.registeredAt && p.registeredAt > dateTo) return false;
      return true;
    });

    return sortByState(filtered, 'participants', {
      totalQuizzes: (p) => participantStats(p).totalQuizzes,
      completed: (p) => participantStats(p).completed,
      avg: (p) => participantStats(p).avg,
      registeredAt: (p) => p.registeredAt || ''
    });
  }

  function renderParticipants() {
    const list = filteredParticipants();
    const totalEl = document.getElementById('partTotalCount');
    if (totalEl) totalEl.textContent = list.length;

    // Sync sort dropdown if header sort was clicked
    const sortSel = document.getElementById('partSort');
    if (sortSel && sortSel.options && sortState.participants) {
      const candidate = `${sortState.participants.key}:${sortState.participants.dir}`;
      if (Array.from(sortSel.options).some((o) => o.value === candidate)) {
        sortSel.value = candidate;
      }
    }

    const totalPages = Math.max(1, Math.ceil(list.length / partPageSize));
    if (partPage > totalPages) partPage = totalPages;
    const slice = list.slice((partPage - 1) * partPageSize, partPage * partPageSize);

    const tbody = document.getElementById('participantTableBody');
    if (tbody) {
      tbody.innerHTML =
        slice
          .map((p) => {
            const st = participantStats(p);
            return `<tr>
              <td data-label="ID"><span class="font-monospace fw-bold text-dark">${esc(p.id)}</span></td>
              <td data-label="Name">
                <div class="fw-bold">${esc(p.name)}</div>
              </td>
              <td data-label="Email"><span class="text-secondary small">${esc(p.email)}</span></td>
              <td data-label="Phone"><span class="text-secondary small font-monospace">${esc(p.phone || '—')}</span></td>
              <td data-label="Total Quizzes"><span class="badge bg-light text-dark border">${st.totalQuizzes}</span></td>
              <td data-label="Completed"><span class="badge bg-light text-dark border">${st.completed}</span></td>
              <td data-label="Avg Score"><span class="fw-bold ${st.avg >= 60 ? 'text-success' : 'text-danger'}">${st.avg}%</span></td>
              <td data-label="Status">
                <button class="btn btn-sm p-0 border-0 bg-transparent" data-part-toggle="${p.id}" title="Click to toggle status">
                  ${statusBadge(p.status)}
                </button>
              </td>
              <td data-label="Registered"><span class="small text-muted">${esc(p.registeredAt || '—')}</span></td>
              <td data-label="Actions" class="action-btns">
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-secondary" data-part-view="${p.id}" title="View Profile">
                    <i class="fa-solid fa-user"></i>
                  </button>
                  <button class="btn btn-outline-brand" data-part-edit="${p.id}" title="Edit Participant">
                    <i class="fa-solid fa-pen-to-square"></i>
                  </button>
                  <button class="btn btn-outline-info" data-part-attempts="${p.id}" title="View Attempts">
                    <i class="fa-solid fa-chart-line"></i>
                  </button>
                  <button class="btn btn-outline-danger" data-part-del="${p.id}" title="Delete Participant">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>`;
          })
          .join('') || `<tr><td colspan="10" class="text-center text-muted py-4"><i class="fa-solid fa-user-slash fa-2x mb-2 text-secondary opacity-50 d-block"></i>No participants found matching your criteria.</td></tr>`;
    }

    const cardsEl = document.getElementById('participantMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        slice
          .map((p) => {
            const st = participantStats(p);
            return `<div class="mobile-card">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h4 class="mb-0">${esc(p.name)}</h4>
                  <small class="text-muted font-monospace">${esc(p.id)}</small>
                </div>
                <button class="btn btn-sm p-0 border-0 bg-transparent" data-part-toggle="${p.id}" title="Click to toggle status">
                  ${statusBadge(p.status)}
                </button>
              </div>
              <div class="small text-secondary mb-2">
                <div><i class="fa-solid fa-envelope me-1 text-primary"></i>${esc(p.email)}</div>
                <div><i class="fa-solid fa-phone me-1 text-success"></i>${esc(p.phone || '—')}</div>
              </div>
              <div class="mobile-meta small text-muted mb-3 d-flex gap-2 flex-wrap">
                <span>Quizzes: <strong>${st.totalQuizzes}</strong></span>
                <span>•</span>
                <span>Completed: <strong>${st.completed}</strong></span>
                <span>•</span>
                <span>Avg: <strong class="${st.avg >= 60 ? 'text-success' : 'text-danger'}">${st.avg}%</strong></span>
                <span>•</span>
                <span>Registered: <strong>${esc(p.registeredAt || '—')}</strong></span>
              </div>
              <div class="action-btns d-flex gap-1">
                <button class="btn btn-sm btn-outline-secondary flex-grow-1" data-part-view="${p.id}"><i class="fa-solid fa-user me-1"></i>Profile</button>
                <button class="btn btn-sm btn-outline-brand flex-grow-1" data-part-edit="${p.id}"><i class="fa-solid fa-pen-to-square me-1"></i>Edit</button>
                <button class="btn btn-sm btn-outline-info flex-grow-1" data-part-attempts="${p.id}"><i class="fa-solid fa-chart-line me-1"></i>Attempts</button>
                <button class="btn btn-sm btn-outline-danger" data-part-del="${p.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>`;
          })
          .join('') || '<div class="empty-state text-center py-4 text-muted"><i class="fa-solid fa-user-slash fa-2x mb-2 opacity-50 d-block"></i>No participants found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'partPagination',
      currentPage: partPage,
      totalPages,
      totalItems: list.length,
      pageSize: partPageSize,
      onPageChange: (p) => {
        partPage = p;
        renderParticipants();
      },
      onPageSizeChange: (s) => {
        partPageSize = s;
        partPage = 1;
        renderParticipants();
      }
    });
  }

  function clearParticipantFilters() {
    const s = document.getElementById('partSearch');
    if (s) s.value = '';
    const f = document.getElementById('partFilterStatus');
    if (f) f.value = '';
    const dFrom = document.getElementById('partDateFrom');
    if (dFrom) dFrom.value = '';
    const dTo = document.getElementById('partDateTo');
    if (dTo) dTo.value = '';
    const sortSel = document.getElementById('partSort');
    if (sortSel) sortSel.value = 'name:asc';
    sortState.participants = { key: 'name', dir: 'asc' };
    partPage = 1;
    renderParticipants();
    toast('Participant filters cleared', 'info');
  }

  function openParticipantModal(p = null) {
    const form = document.getElementById('participantForm');
    if (form) {
      form.reset();
      form.classList.remove('was-validated');
      clearFormValidation(form);
    }
    activeEditingParticipant = p;
    const isEdit = !!p;
    document.getElementById('participantFormId').value = p?.id || '';
    document.getElementById('participantModalTitle').textContent = isEdit ? 'Edit Participant' : 'Add Participant';
    document.getElementById('pfName').value = p?.name || '';
    document.getElementById('pfEmail').value = p?.email || '';
    document.getElementById('pfPhone').value = p?.phone || '';
    document.getElementById('pfStatus').value = p?.status || 'Active';

    participantFormInitialState = {
      id: p?.id || '',
      name: p?.name || '',
      email: p?.email || '',
      phone: p?.phone || '',
      status: p?.status || 'Active'
    };

    bootstrap.Modal.getOrCreateInstance(document.getElementById('participantModal')).show();
    setTimeout(() => document.getElementById('pfName')?.focus(), 200);
  }

  function resetParticipantForm() {
    const form = document.getElementById('participantForm');
    if (!form) return;
    clearFormValidation(form);
    if (activeEditingParticipant) {
      document.getElementById('pfName').value = activeEditingParticipant.name || '';
      document.getElementById('pfEmail').value = activeEditingParticipant.email || '';
      document.getElementById('pfPhone').value = activeEditingParticipant.phone || '';
      document.getElementById('pfStatus').value = activeEditingParticipant.status || 'Active';
    } else {
      document.getElementById('pfName').value = '';
      document.getElementById('pfEmail').value = '';
      document.getElementById('pfPhone').value = '';
      document.getElementById('pfStatus').value = 'Active';
    }
    toast('Participant form reset', 'info');
  }

  async function cancelParticipantModal() {
    const nameVal = (document.getElementById('pfName')?.value || '').trim();
    const emailVal = (document.getElementById('pfEmail')?.value || '').trim();
    const phoneVal = (document.getElementById('pfPhone')?.value || '').trim();
    const statusVal = document.getElementById('pfStatus')?.value || 'Active';
    const initial = participantFormInitialState || { name: '', email: '', phone: '', status: 'Active' };

    const isDirty = nameVal !== initial.name || emailVal !== initial.email || phoneVal !== initial.phone || statusVal !== initial.status;
    if (isDirty) {
      const ok = await confirmDialog({
        title: 'Discard Changes',
        message: 'You have unsaved changes in this participant profile. Are you sure you want to discard them?',
        confirmText: 'Discard',
        type: 'warning'
      });
      if (!ok) return;
    }
    bootstrap.Modal.getInstance(document.getElementById('participantModal'))?.hide();
  }

  function saveParticipant() {
    const form = document.getElementById('participantForm');
    const nameEl = document.getElementById('pfName');
    const emailEl = document.getElementById('pfEmail');
    const phoneEl = document.getElementById('pfPhone');
    const statusEl = document.getElementById('pfStatus');
    const nameVal = (nameEl?.value || '').trim();
    const emailVal = (emailEl?.value || '').trim();
    const phoneVal = (phoneEl?.value || '').trim();
    const statusVal = statusEl?.value || 'Active';
    const id = document.getElementById('participantFormId')?.value || '';

    // Validation 1: Required Name
    const nameCheck = Validators.required(nameVal, 'Full name');
    if (!nameCheck.valid) {
      setFieldValidation(nameEl, false, nameCheck.message);
      toast(nameCheck.message, 'error');
      nameEl?.focus();
      return;
    }
    setFieldValidation(nameEl, true);

    // Validation 2: Email format
    const emailCheck = Validators.email(emailVal);
    if (!emailCheck.valid) {
      setFieldValidation(emailEl, false, emailCheck.message);
      toast(emailCheck.message, 'error');
      emailEl?.focus();
      return;
    }

    // Validation 3: Unique Email (case-insensitive, exclude current ID)
    const emailUnique = Validators.uniqueName('participants', 'email', emailVal, id);
    if (!emailUnique.valid) {
      setFieldValidation(emailEl, false, 'This email address is already registered to another participant.');
      toast('Email address already registered', 'error');
      emailEl?.focus();
      return;
    }
    setFieldValidation(emailEl, true);

    // Validation 4: Phone format
    const phoneCheck = Validators.phone(phoneVal);
    if (!phoneCheck.valid) {
      setFieldValidation(phoneEl, false, phoneCheck.message);
      toast(phoneCheck.message, 'error');
      phoneEl?.focus();
      return;
    }
    setFieldValidation(phoneEl, true);

    const existing = id ? QMS.participants.get(id) : null;
    const payload = {
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      status: statusVal,
      registeredAt: existing?.registeredAt || new Date().toISOString().slice(0, 10)
    };

    if (id) {
      QMS.participants.update(id, payload);
      toast(`Participant "${nameVal}" updated successfully`, 'success');
    } else {
      const created = QMS.participants.create(payload);
      toast(`Participant "${nameVal}" created successfully (${created.id})`, 'success');
    }

    bootstrap.Modal.getInstance(document.getElementById('participantModal'))?.hide();
    renderParticipants();
    refreshParticipantDropdowns();
  }

  function openParticipantProfileModal(pIdOrObj) {
    const p = typeof pIdOrObj === 'string' ? QMS.participants.get(pIdOrObj) : pIdOrObj;
    if (!p) return;
    activeProfileParticipant = p;

    document.getElementById('ppTitle').textContent = `Participant Profile`;
    document.getElementById('ppId').textContent = p.id;
    const statusBadgeEl = document.getElementById('ppStatus');
    if (statusBadgeEl) {
      statusBadgeEl.className = `badge ${p.status === 'Active' ? 'bg-success' : 'bg-secondary'}`;
      statusBadgeEl.textContent = p.status;
    }
    document.getElementById('ppName').textContent = p.name;
    document.getElementById('ppEmail').textContent = p.email;
    document.getElementById('ppPhone').textContent = p.phone || '—';
    document.getElementById('ppRegistered').textContent = p.registeredAt || '—';

    const st = participantStats(p);
    document.getElementById('ppAttempts').textContent = st.completed;
    document.getElementById('ppAvg').textContent = `${st.avg}%`;
    document.getElementById('ppBest').textContent = `${st.best}%`;
    document.getElementById('ppPassRate').textContent = `${st.passRate}%`;
    document.getElementById('ppAttemptsBadge').textContent = st.rows.length;

    const listEl = document.getElementById('ppRecentAttemptsList');
    if (listEl) {
      listEl.innerHTML = st.rows.length
        ? st.rows
            .slice(-6)
            .reverse()
            .map((r) => {
              const qz = QMS.quizzes.get(r.quizId);
              const isPassed = r.status === 'Passed' || r.passed === true;
              return `<li class="list-group-item d-flex justify-content-between align-items-center py-2 px-2">
                <div class="text-truncate me-2" title="${esc(qz?.title || r.quizTitle || r.quizId)}">
                  <strong>${esc(qz?.title || r.quizTitle || r.quizId)}</strong>
                  <div class="text-muted small">${esc(r.date || r.createdAt || '—')} · ${r.durationTaken || r.timeTaken || '—'}</div>
                </div>
                <div class="text-end">
                  <span class="badge ${isPassed ? 'bg-success' : 'bg-danger'}">${esc(r.status || (isPassed ? 'Passed' : 'Failed'))}</span>
                  <div class="fw-bold small text-dark">${r.percentage || 0}%</div>
                </div>
              </li>`;
            })
            .join('')
        : '<li class="list-group-item text-muted text-center py-3">No quiz attempts recorded yet</li>';
    }

    const editBtn = document.getElementById('btnProfileEditParticipant');
    if (editBtn) {
      editBtn.dataset.partId = p.id;
    }
    const viewAttBtn = document.getElementById('btnProfileViewAttempts');
    if (viewAttBtn) {
      viewAttBtn.dataset.partId = p.id;
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('participantProfileModal')).show();
  }

  function refreshParticipantDropdowns() {
    const attPart = document.getElementById('attemptParticipant');
    if (attPart) {
      const prev = attPart.value;
      attPart.innerHTML = optionParticipants(prev, true);
      if (prev) attPart.value = prev;
    }
    const resPart = document.getElementById('resFilterPart');
    if (resPart) {
      const prev = resPart.value;
      resPart.innerHTML = '<option value="">All Participants</option>' + optionParticipants(prev, false);
      if (prev) resPart.value = prev;
      resPart.dataset.ready = '';
    }
  }

  /* ---------- Results Management (Phase 11.2) ---------- */
  function filteredResultsAdmin() {
    const q = (document.getElementById('resSearch')?.value || '').toLowerCase().trim();
    const dateFrom = document.getElementById('resFilterDateFrom')?.value || '';
    const dateTo = document.getElementById('resFilterDateTo')?.value || '';
    const dateLegacy = document.getElementById('resFilterDate')?.value || '';
    const quizId = document.getElementById('resFilterQuiz')?.value || '';
    const participantId = document.getElementById('resFilterPart')?.value || '';
    const status = document.getElementById('resFilterStatus')?.value || '';

    return QMS.results.all().filter((r) => {
      const pName = QMS.participantName(r.participantId);
      const qTitle = QMS.quizTitle(r.quizId);
      const hay = `${r.id} ${pName} ${qTitle} ${r.participantId} ${r.quizId}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      const d = String(r.date || '').slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (dateLegacy && !String(r.date).startsWith(dateLegacy)) return false;
      if (quizId && r.quizId !== quizId) return false;
      if (participantId && r.participantId !== participantId) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }

  function clearResultsFilters() {
    const search = document.getElementById('resSearch');
    if (search) search.value = '';
    const dFrom = document.getElementById('resFilterDateFrom');
    if (dFrom) dFrom.value = '';
    const dTo = document.getElementById('resFilterDateTo');
    if (dTo) dTo.value = '';
    const dLeg = document.getElementById('resFilterDate');
    if (dLeg) dLeg.value = '';
    const qF = document.getElementById('resFilterQuiz');
    if (qF) qF.value = '';
    const pF = document.getElementById('resFilterPart');
    if (pF) pF.value = '';
    const sF = document.getElementById('resFilterStatus');
    if (sF) sF.value = '';
    const sort = document.getElementById('resSort');
    if (sort) sort.value = 'date:desc';
    resPage = 1;
    renderResults();
  }

  function renderResults() {
    const quizFilter = document.getElementById('resFilterQuiz');
    const partFilter = document.getElementById('resFilterPart');
    if (quizFilter && !quizFilter.dataset.ready) {
      const prevVal = quizFilter.value;
      quizFilter.innerHTML = '<option value="">All Quizzes</option>' + optionQuizzes(prevVal);
      if (prevVal) quizFilter.value = prevVal;
      quizFilter.dataset.ready = '1';
    }
    if (partFilter && !partFilter.dataset.ready) {
      const prevVal = partFilter.value;
      partFilter.innerHTML = '<option value="">All Participants</option>' + optionParticipants(prevVal);
      if (prevVal) partFilter.value = prevVal;
      partFilter.dataset.ready = '1';
    }
    const sortSel = document.getElementById('resSort')?.value;
    if (sortSel) sortState.results = parseSortValue(sortSel, 'date');
    const list = sortByState(filteredResultsAdmin(), 'results', {
      participant: (r) => QMS.participantName(r.participantId),
      quiz: (r) => QMS.quizTitle(r.quizId),
      date: (r) => new Date(r.date || 0).getTime(),
      percentage: (r) => Number(r.percentage) || 0
    });
    const totalPages = Math.max(1, Math.ceil(list.length / resPageSize));
    if (resPage > totalPages) resPage = totalPages;
    const slice = list.slice((resPage - 1) * resPageSize, resPage * resPageSize);

    const tbody = document.getElementById('resultsTableBody');
    if (tbody) {
      tbody.innerHTML =
        slice
          .map((r) => {
            return `<tr>
            <td data-label="Result ID"><strong>${esc(r.id)}</strong></td>
            <td data-label="Participant">${esc(QMS.participantName(r.participantId))}</td>
            <td data-label="Quiz">${esc(QMS.quizTitle(r.quizId))}</td>
            <td data-label="Date">${formatDate(r.date, true)}</td>
            <td data-label="Score">${esc(r.obtainedMarks ?? r.score)}/${esc(r.totalMarks || 0)}</td>
            <td data-label="Percentage"><span class="fw-bold ${r.percentage >= 60 ? 'text-success' : 'text-danger'}">${esc(r.percentage)}%</span></td>
            <td data-label="Time Taken">${formatDuration(r.timeSpent ?? r.timeTaken)}</td>
            <td data-label="Status">${statusBadge(r.status)}</td>
            <td data-label="Actions" class="action-btns">
              <button type="button" class="btn btn-sm btn-outline-brand" data-view-result="${r.id}" title="View granular result breakdown">
                <i class="fa-regular fa-eye me-1"></i>View Result
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-res-print="${r.id}" title="Print result document">
                <i class="fa-solid fa-print me-1"></i>Print
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-res-del="${r.id}" title="Delete result">
                <i class="fa-regular fa-trash-can me-1"></i>Delete
              </button>
            </td>
          </tr>`;
          })
          .join('') || `<tr><td colspan="9" class="text-center text-muted py-4"><i class="fa-solid fa-poll fa-2x mb-2 opacity-50 d-block"></i>No results found</td></tr>`;
    }

    const cardsEl = document.getElementById('resultsMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        slice
          .map(
            (r) => `<div class="mobile-card">
            <h4>${esc(QMS.participantName(r.participantId))}</h4>
            <div class="mobile-meta">${esc(QMS.quizTitle(r.quizId))} · ${r.percentage}% · ${statusBadge(r.status)}</div>
            <div class="small text-muted mb-2">ID: ${esc(r.id)} · ${formatDate(r.date, true)}</div>
            <div class="action-btns">
              <button type="button" class="btn btn-sm btn-outline-brand" data-view-result="${r.id}"><i class="fa-regular fa-eye me-1"></i>View</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-res-print="${r.id}"><i class="fa-solid fa-print me-1"></i>Print</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-res-del="${r.id}"><i class="fa-regular fa-trash-can me-1"></i>Delete</button>
            </div>
          </div>`
          )
          .join('') || '<div class="empty-state text-center py-4 text-muted">No results found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'resPagination',
      currentPage: resPage,
      totalPages,
      totalItems: list.length,
      pageSize: resPageSize,
      onPageChange: (p) => {
        resPage = p;
        renderResults();
      },
      onPageSizeChange: (s) => {
        resPageSize = s;
        resPage = 1;
        renderResults();
      }
    });
  }

  /* ---------- Quiz Attempts Module (Phase 11.3) ---------- */
  function getAttemptNumber(attempt) {
    if (!attempt || !attempt.participantId || !attempt.quizId) return 1;
    const allForPair = QMS.results.all()
      .filter((r) => r.participantId === attempt.participantId && r.quizId === attempt.quizId)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    const idx = allForPair.findIndex((r) => r.id === attempt.id);
    return idx >= 0 ? idx + 1 : 1;
  }

  function getAttemptStatus(attempt) {
    if (!attempt) return 'Completed';
    if (attempt.attemptStatus) return attempt.attemptStatus;
    if (attempt.status === 'Timed Out' || attempt.status === 'timedout') return 'Timed Out';
    if (attempt.status === 'In Progress' || attempt.status === 'inprogress') return 'In Progress';
    return 'Completed';
  }

  function filteredAttemptsAdmin() {
    const q = (document.getElementById('attSearch')?.value || '').toLowerCase().trim();
    const partId = document.getElementById('attFilterPart')?.value || '';
    const quizId = document.getElementById('attFilterQuiz')?.value || '';
    const status = document.getElementById('attFilterStatus')?.value || '';
    const date = document.getElementById('attFilterDate')?.value || '';

    return QMS.results.all().filter((a) => {
      const pName = QMS.participantName(a.participantId);
      const qTitle = QMS.quizTitle(a.quizId);
      const hay = `${a.id} ${pName} ${qTitle} ${a.participantId} ${a.quizId}`.toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (partId && a.participantId !== partId) return false;
      if (quizId && a.quizId !== quizId) return false;
      if (date && !String(a.date).startsWith(date)) return false;
      if (status) {
        const attStatus = getAttemptStatus(a);
        if (attStatus !== status) return false;
      }
      return true;
    });
  }

  function clearAttemptsFilters() {
    const s = document.getElementById('attSearch');
    if (s) s.value = '';
    const p = document.getElementById('attFilterPart');
    if (p) p.value = '';
    const q = document.getElementById('attFilterQuiz');
    if (q) q.value = '';
    const st = document.getElementById('attFilterStatus');
    if (st) st.value = '';
    const d = document.getElementById('attFilterDate');
    if (d) d.value = '';
    const sort = document.getElementById('attSort');
    if (sort) sort.value = 'date:desc';
    attPage = 1;
    renderAttempts();
  }

  function renderAttempts() {
    // Populate Quick Launcher dropdowns
    const launcherQuiz = document.getElementById('attemptQuiz');
    const launcherPart = document.getElementById('attemptParticipant');
    if (launcherQuiz) launcherQuiz.innerHTML = optionQuizzes('', true);
    if (launcherPart) launcherPart.innerHTML = optionParticipants('', true);

    // Populate Filters dropdowns
    const attPartFilter = document.getElementById('attFilterPart');
    const attQuizFilter = document.getElementById('attFilterQuiz');
    if (attPartFilter && !attPartFilter.dataset.ready) {
      const prevVal = attPartFilter.value;
      attPartFilter.innerHTML = '<option value="">All Participants</option>' + optionParticipants(prevVal);
      if (prevVal) attPartFilter.value = prevVal;
      attPartFilter.dataset.ready = '1';
    }
    if (attQuizFilter && !attQuizFilter.dataset.ready) {
      const prevVal = attQuizFilter.value;
      attQuizFilter.innerHTML = '<option value="">All Quizzes</option>' + optionQuizzes(prevVal);
      if (prevVal) attQuizFilter.value = prevVal;
      attQuizFilter.dataset.ready = '1';
    }

    const sortSel = document.getElementById('attSort')?.value || 'date:desc';
    sortState.attempts = parseSortValue(sortSel, 'date');

    const list = sortByState(filteredAttemptsAdmin(), 'attempts', {
      participant: (a) => QMS.participantName(a.participantId),
      quiz: (a) => QMS.quizTitle(a.quizId),
      date: (a) => new Date(a.date || 0).getTime(),
      duration: (a) => Number(a.timeSpent ?? a.timeTaken) || 0,
      status: (a) => getAttemptStatus(a)
    });

    const totalPages = Math.max(1, Math.ceil(list.length / attPageSize));
    if (attPage > totalPages) attPage = totalPages;
    const slice = list.slice((attPage - 1) * attPageSize, attPage * attPageSize);

    const tbody = document.getElementById('attemptsTableBody');
    if (tbody) {
      tbody.innerHTML =
        slice
          .map((a) => {
            const attNum = getAttemptNumber(a);
            const attStatus = getAttemptStatus(a);
            const statusClass = attStatus === 'Completed' ? 'badge-success' : attStatus === 'Timed Out' ? 'badge-warning' : 'badge-info';

            return `<tr>
            <td data-label="Attempt #"><span class="badge-soft badge-muted fw-bold">Attempt #${attNum}</span></td>
            <td data-label="Participant"><strong>${esc(QMS.participantName(a.participantId))}</strong></td>
            <td data-label="Quiz">${esc(QMS.quizTitle(a.quizId))}</td>
            <td data-label="Started Date">${formatDate(a.date, true)}</td>
            <td data-label="Duration Used">${formatDuration(a.timeSpent ?? a.timeTaken)}</td>
            <td data-label="Status">
              <span class="badge-soft ${statusClass}">${attStatus}</span>
              ${a.status ? statusBadge(a.status) : ''}
            </td>
            <td data-label="Score">
              <span class="fw-semibold ${a.percentage >= 60 ? 'text-success' : 'text-danger'}">${a.percentage}%</span>
              <small class="text-muted">(${a.obtainedMarks ?? a.score}/${a.totalMarks})</small>
            </td>
            <td data-label="Actions" class="action-btns">
              <button type="button" class="btn btn-sm btn-outline-brand" data-view-result="${a.id}" title="View attempt breakdown">
                <i class="fa-regular fa-eye me-1"></i>View
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-att-del="${a.id}" title="Delete attempt record">
                <i class="fa-regular fa-trash-can me-1"></i>Delete
              </button>
            </td>
          </tr>`;
          })
          .join('') || `<tr><td colspan="8" class="text-center text-muted py-4"><i class="fa-solid fa-stopwatch fa-2x mb-2 opacity-50 d-block"></i>No attempts found</td></tr>`;
    }

    const cardsEl = document.getElementById('attemptsMobileCards');
    if (cardsEl) {
      cardsEl.innerHTML =
        slice
          .map((a) => {
            const attNum = getAttemptNumber(a);
            const attStatus = getAttemptStatus(a);
            return `<div class="mobile-card">
            <h4>${esc(QMS.participantName(a.participantId))}</h4>
            <div class="mobile-meta">Attempt #${attNum} · ${esc(QMS.quizTitle(a.quizId))} · ${a.percentage}%</div>
            <div class="small text-muted mb-2">${formatDate(a.date, true)} · ${formatDuration(a.timeSpent ?? a.timeTaken)}</div>
            <div class="action-btns">
              <button type="button" class="btn btn-sm btn-outline-brand" data-view-result="${a.id}"><i class="fa-regular fa-eye me-1"></i>View</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-att-del="${a.id}"><i class="fa-regular fa-trash-can me-1"></i>Delete</button>
            </div>
          </div>`;
          })
          .join('') || '<div class="empty-state text-center py-4 text-muted">No attempts found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'attPagination',
      currentPage: attPage,
      totalPages,
      totalItems: list.length,
      pageSize: attPageSize,
      onPageChange: (p) => {
        attPage = p;
        renderAttempts();
      },
      onPageSizeChange: (s) => {
        attPageSize = s;
        attPage = 1;
        renderAttempts();
      }
    });
  }

  /* ---------- Leaderboard Module (Phase 13) ---------- */
  function exportLeaderboardCSV() {
    const rows = leaderboardRows({
      quizId: document.getElementById('lbQuiz')?.value || '',
      categoryId: document.getElementById('lbCategory')?.value || '',
      period: document.getElementById('lbPeriod')?.value || 'all'
    });
    if (!rows.length) {
      toast('No leaderboard records to export', 'warning');
      return;
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const exportData = rows.map((r) => ({
      Rank: r.rank,
      'Participant Name': r.name,
      'Total Quizzes': r.totalQuizzes,
      'Average Score': `${r.avg}%`,
      'Highest Score': `${r.best}%`,
      'Total Points': r.points
    }));
    QMS.exportCSV(`leaderboard-rankings-${dateStr}.csv`, exportData);
    toast('Leaderboard exported successfully', 'success');
  }

  function printLeaderboard() {
    const printDate = document.getElementById('lbPrintDate');
    const printFilters = document.getElementById('lbPrintFilters');
    const printSystem = document.getElementById('lbPrintSystem');

    if (printDate) printDate.textContent = new Date().toLocaleString();
    if (printSystem) printSystem.textContent = QMS.getSettings().systemName || 'QuizPro Assessment System';

    const qVal = document.getElementById('lbQuiz')?.value;
    const cVal = document.getElementById('lbCategory')?.value;
    const pVal = document.getElementById('lbPeriod')?.value || 'all';

    const parts = [];
    if (pVal !== 'all') parts.push(`Period: ${pVal}`);
    if (qVal) parts.push(`Quiz: ${QMS.quizTitle(qVal)}`);
    if (cVal) parts.push(`Category: ${QMS.categoryName(cVal)}`);
    if (printFilters) printFilters.textContent = parts.length ? `Applied Filters: ${parts.join(' | ')}` : 'Period: All Time | Filters: None';

    window.print();
  }

  function clearLeaderboardFilters() {
    const q = document.getElementById('lbQuiz');
    if (q) q.value = '';
    const c = document.getElementById('lbCategory');
    if (c) c.value = '';
    const p = document.getElementById('lbPeriod');
    if (p) p.value = 'all';
    lbPage = 1;
    renderLeaderboard();
    toast('Leaderboard filters cleared', 'info');
  }

  function renderLeaderboard() {
    const quizSel = document.getElementById('lbQuiz');
    const catSel = document.getElementById('lbCategory');
    if (quizSel && !quizSel.dataset.ready) {
      const prev = quizSel.value;
      quizSel.innerHTML = '<option value="">All Quizzes</option>' + optionQuizzes(prev);
      if (prev) quizSel.value = prev;
      quizSel.dataset.ready = '1';
    }
    if (catSel && !catSel.dataset.ready) {
      const prev = catSel.value;
      catSel.innerHTML = '<option value="">All Categories</option>' + optionCategories(prev);
      if (prev) catSel.value = prev;
      catSel.dataset.ready = '1';
    }

    const rows = leaderboardRows({
      quizId: document.getElementById('lbQuiz')?.value || '',
      categoryId: document.getElementById('lbCategory')?.value || '',
      period: document.getElementById('lbPeriod')?.value || 'all'
    });

    const totalCountEl = document.getElementById('lbTotalCount');
    if (totalCountEl) totalCountEl.textContent = `${rows.length} Participant${rows.length === 1 ? '' : 's'}`;

    // Podium-style top-3 cards with medals and distinct gold/silver/bronze styling
    const top = rows.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const positionTags = ['🥇 First Position', '🥈 Second Position', '🥉 Third Position'];
    const classes = ['first', 'second', 'third'];

    const leaderTopEl = document.getElementById('leaderTop');
    if (leaderTopEl) {
      leaderTopEl.innerHTML = [0, 1, 2]
        .map((i) => {
          const r = top[i];
          if (!r) {
            return `
              <div class="leader-card ${classes[i]} opacity-75">
                <span class="leader-position-tag">${positionTags[i]}</span>
                <div class="leader-medal">${medals[i]}</div>
                <h4 class="fw-bold mb-1 text-muted">—</h4>
                <div class="text-muted small">No participant yet</div>
              </div>`;
          }
          return `
            <div class="leader-card ${classes[i]}">
              <span class="leader-position-tag">${positionTags[i]}</span>
              <div class="leader-medal">${medals[i]}</div>
              <h4 class="fw-bold mb-1">${esc(r.name)}</h4>
              <div class="fs-4 fw-bold text-brand my-2">${r.points} <span class="fs-6 text-muted fw-normal">pts</span></div>
              <div class="small text-muted d-flex justify-content-center gap-2 flex-wrap">
                <span><i class="fa-solid fa-layer-group me-1 text-primary"></i>${r.totalQuizzes} quizzes</span>
                <span>•</span>
                <span><i class="fa-solid fa-bullseye me-1 text-success"></i>Avg ${r.avg}%</span>
                <span>•</span>
                <span><i class="fa-solid fa-star me-1 text-warning"></i>Best ${r.best}%</span>
              </div>
            </div>`;
        })
        .join('');
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / lbPageSize));
    if (lbPage > totalPages) lbPage = totalPages;
    const slice = rows.slice((lbPage - 1) * lbPageSize, lbPage * lbPageSize);

    // Desktop Ranking Table
    const tbody = document.getElementById('leaderTableBody');
    if (tbody) {
      tbody.innerHTML =
        slice
          .map((r) => {
            const rankBadge = r.rank === 1
              ? '<span class="badge bg-warning text-dark fw-bold px-2 py-1">🥇 #1</span>'
              : r.rank === 2
              ? '<span class="badge bg-secondary text-white fw-bold px-2 py-1">🥈 #2</span>'
              : r.rank === 3
              ? '<span class="badge text-white fw-bold px-2 py-1" style="background:#d97706">🥉 #3</span>'
              : `<span class="fw-semibold text-muted">#${r.rank}</span>`;

            return `<tr>
              <td data-label="Rank">${rankBadge}</td>
              <td data-label="Participant Name"><strong>${esc(r.name)}</strong></td>
              <td data-label="Total Quizzes"><span class="badge-soft badge-muted">${r.totalQuizzes}</span></td>
              <td data-label="Average Score"><span class="fw-bold ${r.avg >= 60 ? 'text-success' : 'text-danger'}">${r.avg}%</span></td>
              <td data-label="Highest Score"><span class="text-success fw-semibold">${r.best}%</span></td>
              <td data-label="Total Points"><strong class="text-brand fs-6">${r.points}</strong></td>
            </tr>`;
          })
          .join('') || `<tr><td colspan="6" class="text-center text-muted py-4"><i class="fa-solid fa-trophy fa-2x mb-2 opacity-50 d-block"></i>No leaderboard records found matching your filters.</td></tr>`;
    }

    // Mobile Cards View
    const mobileCardsEl = document.getElementById('leaderMobileCards');
    if (mobileCardsEl) {
      mobileCardsEl.innerHTML =
        slice
          .map((r) => {
            const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`;
            return `
              <div class="mobile-card mb-3 p-3 border rounded bg-surface">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fs-5 fw-bold">${medal} ${esc(r.name)}</span>
                  <span class="badge bg-brand text-white fw-bold px-2 py-1">${r.points} pts</span>
                </div>
                <div class="small text-muted d-flex justify-content-between">
                  <span>${r.totalQuizzes} Quizzes Attempted</span>
                  <span>Avg: <strong class="${r.avg >= 60 ? 'text-success' : 'text-danger'}">${r.avg}%</strong></span>
                  <span>Best: <strong class="text-success">${r.best}%</strong></span>
                </div>
              </div>`;
          })
          .join('') || '<div class="text-center text-muted py-3">No records found</div>';
    }

    TableHelper.renderPagination({
      containerId: 'lbPagination',
      currentPage: lbPage,
      totalPages,
      totalItems: rows.length,
      pageSize: lbPageSize,
      onPageChange: (p) => {
        lbPage = p;
        renderLeaderboard();
      },
      onPageSizeChange: (s) => {
        lbPageSize = s;
        lbPage = 1;
        renderLeaderboard();
      }
    });
  }

  /* ---------- Settings ---------- */
  function renderSettings() {
    const s = QMS.getSettings();
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    const setChecked = (id, checked) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!checked;
    };

    setVal('setSystemName', s.systemName || 'QuizPro Admin');
    setVal('setAdminName', s.adminName || 'System Admin');
    setVal('setEmail', s.email || 'admin@quizpro.local');
    setVal('setDuration', s.defaultQuizDuration || s.defaultDuration || 30);
    setVal('setPassing', s.defaultPassingPercentage ?? s.defaultPassing ?? 60);

    setChecked('setTimer', s.enableTimer !== false);
    setChecked('setRandQ', !!s.randomQuestions);
    setChecked('setRandA', !!s.randomAnswers);
    setChecked('setRetakes', s.allowRetakes !== false);
    setChecked('setShowAns', s.showAnswers !== false);

    setVal('setTheme', s.theme || 'light');
    setChecked('setCompact', !!s.compactSidebar);
    setVal('setFont', s.fontSize || 'medium');
  }

  function saveSettings() {
    const sysNameEl = document.getElementById('setSystemName');
    const adminNameEl = document.getElementById('setAdminName');
    const emailEl = document.getElementById('setEmail');
    const durationEl = document.getElementById('setDuration');
    const passingEl = document.getElementById('setPassing');

    const systemName = sysNameEl ? sysNameEl.value.trim() : '';
    const adminName = adminNameEl ? adminNameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const durationRaw = durationEl ? durationEl.value.trim() : '';
    const passingRaw = passingEl ? passingEl.value.trim() : '';

    // Validate required systemName
    if (!systemName) {
      toast('System Name is required', 'error');
      sysNameEl?.focus();
      return false;
    }

    // Validate required adminName
    if (!adminName) {
      toast('Admin Name is required', 'error');
      adminNameEl?.focus();
      return false;
    }

    // Validate required email
    if (!email) {
      toast('Email is required', 'error');
      emailEl?.focus();
      return false;
    }
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Please enter a valid email address', 'error');
      emailEl?.focus();
      return false;
    }

    // Validate positive integer duration
    const duration = Number(durationRaw);
    if (!durationRaw || isNaN(duration) || !Number.isInteger(duration) || duration <= 0) {
      toast('Default quiz duration must be a positive integer', 'error');
      durationEl?.focus();
      return false;
    }

    // Validate passing percentage (0–100)
    const passing = Number(passingRaw);
    if (passingRaw === '' || isNaN(passing) || !Number.isInteger(passing) || passing < 0 || passing > 100) {
      toast('Default passing percentage must be an integer between 0 and 100', 'error');
      passingEl?.focus();
      return false;
    }

    const enableTimer = document.getElementById('setTimer') ? document.getElementById('setTimer').checked : true;
    const randomQuestions = document.getElementById('setRandQ') ? document.getElementById('setRandQ').checked : false;
    const randomAnswers = document.getElementById('setRandA') ? document.getElementById('setRandA').checked : false;
    const allowRetakes = document.getElementById('setRetakes') ? document.getElementById('setRetakes').checked : true;
    const showAnswers = document.getElementById('setShowAns') ? document.getElementById('setShowAns').checked : true;
    const theme = document.getElementById('setTheme') ? document.getElementById('setTheme').value : 'light';
    const compactSidebar = document.getElementById('setCompact') ? document.getElementById('setCompact').checked : false;
    const fontSize = document.getElementById('setFont') ? document.getElementById('setFont').value : 'medium';

    QMS.saveSettings({
      systemName,
      adminName,
      email,
      defaultDuration: duration,
      defaultQuizDuration: duration,
      defaultPassing: passing,
      defaultPassingPercentage: passing,
      enableTimer,
      randomQuestions,
      randomAnswers,
      allowRetakes,
      showAnswers,
      theme,
      compactSidebar,
      fontSize
    });

    const session = QMS.getSession();
    if (session) {
      session.fullName = adminName;
      session.email = email;
      QMS.setSession(session);
    }

    applySettingsUI();
    toast('Settings saved successfully', 'success');
    return true;
  }

  async function resetSettingsToDefaults() {
    const ok = await confirmDialog({
      title: 'Reset to Defaults',
      message: 'Restore all system settings, quiz options, and appearance preferences to their default values?',
      confirmText: 'Reset to Defaults',
      type: 'warning'
    });
    if (!ok) return false;

    const def = QMS.defaultSettings();
    QMS.saveSettings(def);

    const session = QMS.getSession();
    if (session) {
      session.fullName = def.adminName;
      session.email = def.email;
      QMS.setSession(session);
    }

    renderSettings();
    applySettingsUI();
    toast('Settings restored to defaults', 'success');
    return true;
  }

  async function resetDemoDataAction() {
    const ok = await confirmDialog({
      title: 'Reset Demo Data',
      message: 'Reset and re-seed all sample data (quizzes, questions, categories, participants, attempts)? Any custom data will be replaced with fresh demo records.',
      confirmText: 'Reset Demo Data',
      type: 'danger'
    });
    if (!ok) return false;

    const currentSession = QMS.getSession();
    QMS.resetDemoData();
    if (currentSession) {
      QMS.setSession(currentSession);
    } else {
      QMS.login('admin@quizpro.local', 'admin123', true);
    }

    renderSettings();
    applySettingsUI();
    toast('Demo data has been successfully re-seeded', 'success');
    if (currentPage && currentPage !== 'settings') {
      showPage(currentPage);
    }
    return true;
  }

  /* ---------- Global search ---------- */
  let globalSearchIndex = -1;

  function globalSearch(term) {
    const q = String(term || '').trim().toLowerCase();
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    globalSearchIndex = -1;

    if (!q) {
      box.classList.add('d-none');
      box.innerHTML = '';
      return;
    }

    const groups = {
      quizzes: { title: 'Quizzes', icon: 'fa-solid fa-list-check', items: [], page: 'quizzes', inputId: 'quizSearch' },
      questions: { title: 'Questions', icon: 'fa-solid fa-circle-question', items: [], page: 'questions', inputId: 'qSearch' },
      participants: { title: 'Participants', icon: 'fa-solid fa-users', items: [], page: 'participants', inputId: 'partSearch' },
      categories: { title: 'Categories', icon: 'fa-solid fa-tags', items: [], page: 'categories', inputId: 'catSearch' },
      results: { title: 'Results', icon: 'fa-solid fa-square-poll-vertical', items: [], page: 'results', inputId: 'resSearch' }
    };

    QMS.quizzes.all().forEach((x) => {
      if (`${x.id} ${x.title} ${x.subject || ''} ${x.description || ''}`.toLowerCase().includes(q)) {
        groups.quizzes.items.push({ id: x.id, title: x.title, desc: `${x.subject || ''} · ${x.difficulty || ''} · ${x.duration || 0}m`, query: x.title });
      }
    });

    QMS.questions.all().forEach((x) => {
      if (`${x.id} ${x.text}`.toLowerCase().includes(q)) {
        groups.questions.items.push({ id: x.id, title: x.text.slice(0, 75), desc: `${x.type || 'MCQ'} · ${x.difficulty || ''} · Marks: ${x.marks || 1}`, query: x.text.slice(0, 30) });
      }
    });

    QMS.participants.all().forEach((x) => {
      if (`${x.id} ${x.name} ${x.email} ${x.phone || ''}`.toLowerCase().includes(q)) {
        groups.participants.items.push({ id: x.id, title: x.name, desc: `${x.email} · ${x.phone || ''}`, query: x.name });
      }
    });

    QMS.categories.all().forEach((x) => {
      if (`${x.id} ${x.name} ${x.description || ''}`.toLowerCase().includes(q)) {
        groups.categories.items.push({ id: x.id, title: x.name, desc: x.description || 'Category', query: x.name });
      }
    });

    QMS.results.all().forEach((x) => {
      const pName = QMS.participantName(x.participantId);
      const qTitle = QMS.quizTitle(x.quizId);
      if (`${x.id} ${pName} ${qTitle}`.toLowerCase().includes(q)) {
        groups.results.items.push({ id: x.id, title: `${pName} — ${qTitle}`, desc: `Score: ${x.percentage}% · Status: ${x.status}`, query: pName });
      }
    });

    const activeGroups = Object.values(groups).filter((g) => g.items.length > 0);
    const totalHits = activeGroups.reduce((acc, g) => acc + g.items.length, 0);

    if (totalHits === 0) {
      box.className = 'search-results-menu';
      box.innerHTML = `
        <div class="search-empty-state">
          <i class="fa-solid fa-magnifying-glass mb-2" style="font-size:1.5rem;opacity:0.35"></i>
          <div>No results found for "<strong>${esc(term)}</strong>"</div>
          <small class="text-muted">Try searching quizzes, questions, participants, or categories</small>
        </div>
      `;
      box.classList.remove('d-none');
      return;
    }

    let html = '';
    activeGroups.forEach((g) => {
      html += `<div class="search-group-header"><i class="${g.icon} me-1"></i> ${esc(g.title)} (${g.items.length})</div>`;
      g.items.slice(0, 4).forEach((item) => {
        html += `
          <button type="button" class="search-result-item" data-search-page="${g.page}" data-search-input="${g.inputId}" data-search-val="${esc(item.query)}">
            <div class="search-title">${esc(item.title)}</div>
            <div class="search-desc">${esc(item.desc)}</div>
          </button>
        `;
      });
    });

    box.className = 'search-results-menu';
    box.innerHTML = html;
    box.classList.remove('d-none');
  }

  function renderPage(page) {
    if (typeof Dashboard !== 'undefined' && Dashboard?.destroyCharts) Dashboard.destroyCharts();
    if (typeof Reports !== 'undefined' && Reports?.destroy) Reports.destroy();
    switch (page) {
      case 'dashboard':
        if (typeof Dashboard !== 'undefined' && Dashboard?.render) Dashboard.render();
        break;
      case 'quizzes':
        document.getElementById('quizFilterCat').innerHTML = '<option value="">All Categories</option>' + optionCategories();
        renderQuizzes();
        break;
      case 'create-quiz':
        if (!activeEditQuiz) {
          initCreateQuizPage(null);
        }
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
        if (typeof Reports !== 'undefined' && Reports?.render) Reports.render();
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
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const page = btn.dataset.page;
        const targetHash = page === 'create-quiz' ? '#/quizzes/create' : `#/${page}`;
        if (location.hash !== targetHash) {
          location.hash = targetHash;
        } else {
          handleRoute(targetHash);
        }
      });
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

    // Theme toggle in topbar
    document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

    async function handleLogout() {
      const ok = await confirmDialog({
        title: 'Sign Out',
        message: 'Are you sure you want to log out of QuizPro Admin?',
        confirmText: 'Log Out',
        type: 'danger'
      });
      if (!ok) return;
      QMS.logout();
      toast('Logged out successfully', 'info');
      setTimeout(() => location.replace('login.html'), 350);
    }

    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('topLogoutBtn')?.addEventListener('click', () => {
      document.getElementById('profileMenu')?.classList.add('d-none');
      handleLogout();
    });

    // Global Search debounced + keyboard accessible
    const debouncedGlobalSearch = debounce((val) => globalSearch(val), 250);
    const searchInput = document.getElementById('globalSearch');
    searchInput?.addEventListener('input', (e) => debouncedGlobalSearch(e.target.value));
    searchInput?.addEventListener('keydown', (e) => {
      const box = document.getElementById('globalSearchResults');
      if (!box || box.classList.contains('d-none')) return;
      const items = box.querySelectorAll('.search-result-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        globalSearchIndex = (globalSearchIndex + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle('active', idx === globalSearchIndex));
        items[globalSearchIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        globalSearchIndex = (globalSearchIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle('active', idx === globalSearchIndex));
        items[globalSearchIndex]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (globalSearchIndex >= 0 && items[globalSearchIndex]) {
          items[globalSearchIndex].click();
        } else if (items[0]) {
          items[0].click();
        }
      } else if (e.key === 'Escape') {
        box.classList.add('d-none');
      }
    });

    // Delegated click handler
    document.addEventListener('click', async (e) => {
      if (!e.target.closest('.top-search')) {
        document.getElementById('globalSearchResults')?.classList.add('d-none');
      }

      // Search item selection
      const searchItem = e.target.closest('[data-search-page]');
      if (searchItem) {
        const page = searchItem.dataset.searchPage;
        const inputId = searchItem.dataset.searchInput;
        const val = searchItem.dataset.searchVal;
        document.getElementById('globalSearchResults')?.classList.add('d-none');
        location.hash = `#/${page}`;
        setTimeout(() => {
          const input = document.getElementById(inputId);
          if (input) {
            input.value = val;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 60);
      }

      const goto = e.target.closest('[data-goto-page]');
      if (goto) showPage(goto.dataset.gotoPage);

      const viewResult = e.target.closest('[data-view-result]');
      if (viewResult) {
        const resId = viewResult.dataset.viewResult;
        if (typeof Dashboard !== 'undefined' && Dashboard?.viewResultDetails) {
          Dashboard.viewResultDetails(resId);
        } else {
          location.href = `quiz.html?result=${encodeURIComponent(resId)}`;
        }
      }

      // Quizzes
      if (e.target.closest('[data-quiz-page]')) {
        quizPage = Number(e.target.closest('[data-quiz-page]').dataset.quizPage);
        renderQuizzes();
      }
      if (e.target.closest('[data-quiz-view]')) {
        const id = e.target.closest('[data-quiz-view]').dataset.quizView;
        const q = QMS.quizzes.get(id);
        if (q) openQuizViewModal(q);
      }
      if (e.target.closest('[data-quiz-edit]')) {
        const id = e.target.closest('[data-quiz-edit]').dataset.quizEdit;
        location.hash = `#/quizzes/edit/${id}`;
      }
      if (e.target.closest('[data-quiz-dup]')) {
        const id = e.target.closest('[data-quiz-dup]').dataset.quizDup;
        const q = QMS.quizzes.get(id);
        if (q) {
          const copy = {
            ...q,
            id: undefined,
            title: `${q.title} (Copy)`,
            status: 'Draft',
            createdAt: new Date().toISOString().slice(0, 10)
          };
          const created = QMS.quizzes.create(copy);
          toast(`Quiz duplicated as Draft (${created.id})`, 'success');
          renderQuizzes();
        }
      }
      if (e.target.closest('[data-quiz-toggle]')) {
        const id = e.target.closest('[data-quiz-toggle]').dataset.quizToggle;
        const q = QMS.quizzes.get(id);
        if (q) {
          const next = q.status === 'Active' ? 'Inactive' : 'Active';
          QMS.quizzes.update(id, { status: next });
          toast(`Quiz "${q.title}" marked as ${next}`, 'success');
          renderQuizzes();
        }
      }
      if (e.target.closest('[data-quiz-del]')) {
        const id = e.target.closest('[data-quiz-del]').dataset.quizDel;
        const q = QMS.quizzes.get(id);
        const relatedAttempts = QMS.results.all().filter((r) => r.quizId === id);
        let msg = `Are you sure you want to delete quiz "${q?.title || id}"?`;
        if (relatedAttempts.length > 0) {
          msg += ` Warning: ${relatedAttempts.length} candidate attempt(s) currently exist for this quiz. Deleting this quiz will remove it from the system.`;
        }
        const ok = await confirmDialog({
          title: 'Delete Quiz',
          message: msg,
          confirmText: 'Delete Quiz',
          type: 'danger'
        });
        if (!ok) return;
        QMS.quizzes.remove(id);
        toast('Quiz deleted successfully', 'warning');
        renderQuizzes();
      }
      if (e.target.closest('[data-quiz-start]')) {
        const quizId = e.target.closest('[data-quiz-start]').dataset.quizStart;
        openParticipantSelectModal(quizId);
      }

      // Questions
      if (e.target.closest('[data-q-view]')) {
        const id = e.target.closest('[data-q-view]').dataset.qView;
        const q = QMS.questions.get(id);
        if (q) openQuestionViewModal(q);
      }
      if (e.target.closest('[data-q-edit]')) {
        openQuestionModal(QMS.questions.get(e.target.closest('[data-q-edit]').dataset.qEdit));
      }
      if (e.target.closest('[data-q-dup]')) {
        const id = e.target.closest('[data-q-dup]').dataset.qDup;
        const q = QMS.questions.get(id);
        if (q) {
          const copy = {
            ...q,
            id: undefined,
            text: `${q.text} (Copy)`,
            status: 'Draft',
            createdAt: new Date().toISOString().slice(0, 10)
          };
          const created = QMS.questions.create(copy);
          toast(`Question duplicated as Draft (${created.id})`, 'success');
          renderQuestions();
          if (document.getElementById('page-create-quiz')?.classList.contains('active')) {
            renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
            updateQuestionCounterBadge();
          }
        }
      }
      if (e.target.closest('[data-q-toggle]')) {
        const id = e.target.closest('[data-q-toggle]').dataset.qToggle;
        const q = QMS.questions.get(id);
        if (q) {
          const next = q.status === 'Active' ? 'Inactive' : 'Active';
          QMS.questions.update(id, { status: next });
          toast(`Question ${id} marked as ${next}`, 'success');
          renderQuestions();
          if (document.getElementById('page-create-quiz')?.classList.contains('active')) {
            renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
            updateQuestionCounterBadge();
          }
        }
      }
      if (e.target.closest('[data-q-del]')) {
        const id = e.target.closest('[data-q-del]').dataset.qDel;
        const q = QMS.questions.get(id);
        const relatedQuizzes = QMS.quizzes.all().filter((qz) => (qz.questionIds || []).includes(id));
        let msg = `Are you sure you want to delete question "${id}"?`;
        if (relatedQuizzes.length > 0) {
          msg += ` Warning: This question is currently linked to ${relatedQuizzes.length} quiz(zes). Deleting it will unlink it from those quizzes.`;
        }
        const ok = await confirmDialog({
          title: 'Delete Question',
          message: msg,
          confirmText: 'Delete Question',
          type: 'danger'
        });
        if (!ok) return;
        QMS.questions.remove(id);
        toast('Question deleted successfully', 'warning');
        renderQuestions();
        if (document.getElementById('page-create-quiz')?.classList.contains('active')) {
          renderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
          updateQuestionCounterBadge();
        }
      }

      // Categories
      if (e.target.closest('[data-cat-view]')) {
        const id = e.target.closest('[data-cat-view]').dataset.catView;
        openCategoryViewModal(id);
      }
      if (e.target.closest('[data-cat-edit]')) {
        const id = e.target.closest('[data-cat-edit]').dataset.catEdit;
        openCategoryModal(QMS.categories.get(id));
      }
      if (e.target.closest('[data-cat-toggle]')) {
        const id = e.target.closest('[data-cat-toggle]').dataset.catToggle;
        const cat = QMS.categories.get(id);
        if (cat) {
          const next = cat.status === 'Active' ? 'Inactive' : 'Active';
          QMS.categories.update(cat.id, { ...cat, status: next });
          toast(`Category "${cat.name}" is now ${next}`, 'info');
          renderCategories();
          refreshCategoryDropdowns();
        }
      }
      if (e.target.closest('[data-cat-del]')) {
        const id = e.target.closest('[data-cat-del]').dataset.catDel;
        const cat = QMS.categories.get(id);
        if (cat) {
          const qzList = categoryLinkedQuizzes(cat);
          const qList = categoryLinkedQuestions(cat);
          let msg = `Are you sure you want to delete category "${cat.name}"?`;
          if (qzList.length > 0 || qList.length > 0) {
            msg = `Warning: Category "${cat.name}" is currently assigned to ${qzList.length} quiz(zes) and ${qList.length} question(s). Deleting it will unlink it from these items (setting their category to unassigned). Are you sure you want to proceed?`;
          }
          const ok = await confirmDialog({
            title: 'Delete Category',
            message: msg,
            confirmText: 'Delete Category',
            type: 'danger'
          });
          if (!ok) return;
          QMS.categories.remove(id);
          toast(`Category "${cat.name}" deleted successfully`, 'warning');
          renderCategories();
          refreshCategoryDropdowns();
        }
      }

      // Participants
      if (e.target.closest('[data-part-view]')) {
        const id = e.target.closest('[data-part-view]').dataset.partView;
        openParticipantProfileModal(id);
      }
      if (e.target.closest('[data-part-edit]')) {
        openParticipantModal(QMS.participants.get(e.target.closest('[data-part-edit]').dataset.partEdit));
      }
      if (e.target.closest('[data-part-toggle]')) {
        const id = e.target.closest('[data-part-toggle]').dataset.partToggle;
        const p = QMS.participants.get(id);
        if (p) {
          const next = p.status === 'Active' ? 'Inactive' : 'Active';
          QMS.participants.update(p.id, { ...p, status: next });
          toast(`Participant "${p.name}" is now ${next}`, 'info');
          renderParticipants();
          refreshParticipantDropdowns();
        }
      }
      if (e.target.closest('[data-part-attempts]')) {
        const id = e.target.closest('[data-part-attempts]').dataset.partAttempts;
        location.hash = `#/attempts/${encodeURIComponent(id)}`;
      }
      if (e.target.closest('[data-part-del]')) {
        const id = e.target.closest('[data-part-del]').dataset.partDel;
        const p = QMS.participants.get(id);
        if (p) {
          const relAttempts = QMS.results.all().filter((r) => String(r.participantId).toLowerCase() === String(id).toLowerCase());
          let msg = `Are you sure you want to delete participant "${p.name}"?`;
          if (relAttempts.length > 0) {
            msg = `Warning: Participant "${p.name}" has ${relAttempts.length} recorded quiz attempt(s). Deleting this participant will remove their attempt history from the system. Are you sure you want to proceed?`;
          }
          const ok = await confirmDialog({
            title: 'Delete Participant',
            message: msg,
            confirmText: 'Delete Participant',
            type: 'danger'
          });
          if (!ok) return;
          QMS.participants.remove(id);
          toast(`Participant "${p.name}" deleted successfully`, 'warning');
          renderParticipants();
          refreshParticipantDropdowns();
        }
      }

      // Results Actions
      if (e.target.closest('[data-res-del]')) {
        const id = e.target.closest('[data-res-del]').dataset.resDel;
        const ok = await confirmDialog({
          title: 'Delete Result',
          message: `Are you sure you want to delete result record "${id}"? This cannot be undone.`,
          confirmText: 'Delete',
          type: 'danger'
        });
        if (!ok) return;
        QMS.results.remove(id);
        toast('Result deleted successfully', 'warning');
        renderResults();
        renderAttempts();
        if (typeof Dashboard !== 'undefined' && Dashboard?.render) Dashboard.render();
      }
      if (e.target.closest('[data-res-print]')) {
        const id = e.target.closest('[data-res-print]').dataset.resPrint;
        window.open(`quiz.html?result=${encodeURIComponent(id)}`, '_blank');
      }

      // Attempts Actions
      if (e.target.closest('[data-att-del]')) {
        const id = e.target.closest('[data-att-del]').dataset.attDel;
        const ok = await confirmDialog({
          title: 'Delete Attempt',
          message: `Are you sure you want to delete attempt record "${id}"? This cannot be undone.`,
          confirmText: 'Delete',
          type: 'danger'
        });
        if (!ok) return;
        QMS.results.remove(id);
        toast('Attempt deleted successfully', 'warning');
        renderAttempts();
        renderResults();
        if (typeof Dashboard !== 'undefined' && Dashboard?.render) Dashboard.render();
      }
    });

    // Debounced search renders to prevent unnecessary re-renders & DOM thrashing
    const debouncedRenderQuizzes = debounce(() => { quizPage = 1; renderQuizzes(); }, 200);
    const debouncedRenderQuestions = debounce(() => { questionPage = 1; renderQuestions(); }, 200);
    const debouncedRenderCategories = debounce(() => { catPage = 1; renderCategories(); }, 200);
    const debouncedRenderParticipants = debounce(() => { partPage = 1; renderParticipants(); }, 200);
    const debouncedRenderResults = debounce(() => { resPage = 1; renderResults(); }, 200);
    const debouncedRenderAttempts = debounce(() => { attPage = 1; renderAttempts(); }, 200);

    // Filters
    document.getElementById('quizSearch')?.addEventListener('input', debouncedRenderQuizzes);
    ['quizFilterCat', 'quizFilterDiff', 'quizFilterStatus', 'quizFilterDate', 'quizSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        quizPage = 1;
        renderQuizzes();
      });
    });

    document.getElementById('qSearch')?.addEventListener('input', debouncedRenderQuestions);
    ['qFilterCat', 'qFilterDiff', 'qFilterType', 'qFilterStatus', 'qSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        questionPage = 1;
        renderQuestions();
      });
    });

    document.getElementById('catSearch')?.addEventListener('input', debouncedRenderCategories);
    ['catFilterStatus', 'catSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        catPage = 1;
        renderCategories();
      });
    });

    document.getElementById('partSearch')?.addEventListener('input', debouncedRenderParticipants);
    ['partFilterStatus', 'partDateFrom', 'partDateTo', 'partSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        partPage = 1;
        renderParticipants();
      });
    });

    document.getElementById('resSearch')?.addEventListener('input', debouncedRenderResults);
    ['resFilterDateFrom', 'resFilterDateTo', 'resFilterDate', 'resFilterQuiz', 'resFilterPart', 'resFilterStatus', 'resSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        resPage = 1;
        renderResults();
      });
    });

    document.getElementById('attSearch')?.addEventListener('input', debouncedRenderAttempts);
    ['attFilterPart', 'attFilterQuiz', 'attFilterStatus', 'attFilterDate', 'attSort'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        attPage = 1;
        renderAttempts();
      });
    });

    document.getElementById('btnResClearFilters')?.addEventListener('click', clearResultsFilters);
    document.getElementById('btnAttClearFilters')?.addEventListener('click', clearAttemptsFilters);

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
          if (table === 'attempts') renderAttempts();
        }
      }
    });

    ['lbQuiz', 'lbCategory', 'lbPeriod'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        lbPage = 1;
        renderLeaderboard();
      });
    });

    document.getElementById('btnAddQuiz')?.addEventListener('click', () => {
      location.hash = '#/quizzes/create';
    });
    document.getElementById('btnClearQuizFilters')?.addEventListener('click', clearQuizFilters);
    document.getElementById('btnSaveQuiz')?.addEventListener('click', () => saveQuiz(false));
    document.getElementById('btnDraftQuiz')?.addEventListener('click', () => saveQuiz(true));
    document.getElementById('btnResetQuiz')?.addEventListener('click', () => {
      document.getElementById('quizForm')?.reset();
      document.getElementById('qfCategory').innerHTML = optionCategories();
    });
    document.getElementById('btnSaveCreateQuiz')?.addEventListener('click', () => saveCreateQuiz(false));
    document.getElementById('btnDraftCreateQuiz')?.addEventListener('click', () => saveCreateQuiz(true));
    document.getElementById('btnResetCreateQuiz')?.addEventListener('click', resetCreateQuizPage);
    document.getElementById('btnCancelCreateQuiz')?.addEventListener('click', cancelCreateQuiz);
    document.getElementById('btnBackToQuizzes')?.addEventListener('click', cancelCreateQuiz);

    // Question picker dynamic filters
    const debouncedRenderQuestionPicker = debounce((val) => renderQuestionPicker(val), 200);
    document.getElementById('btnAutoSelectQuestions')?.addEventListener('click', autoSelectQuestions);
    document.getElementById('btnClearQuestionSelection')?.addEventListener('click', clearQuestionSelection);
    document.getElementById('cqQuestionSearch')?.addEventListener('input', (e) => debouncedRenderQuestionPicker(e.target.value));
    document.getElementById('cqCategory')?.addEventListener('change', () => {
      debouncedRenderQuestionPicker(document.getElementById('cqQuestionSearch')?.value || '');
      updateQuestionCounterBadge();
    });
    document.getElementById('cqQuestionCount')?.addEventListener('input', updateQuestionCounterBadge);

    document.getElementById('btnNotifications')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('notifPanel');
      panel?.classList.toggle('d-none');
      document.getElementById('profileMenu')?.classList.add('d-none');
      document.getElementById('profileChip')?.setAttribute('aria-expanded', 'false');
      const isOpen = !panel?.classList.contains('d-none');
      e.currentTarget.setAttribute('aria-expanded', String(isOpen));
    });
    document.getElementById('btnClearNotifs')?.addEventListener('click', (e) => {
      e.stopPropagation();
      notifications = notifications.map((n) => ({ ...n, read: true }));
      localStorage.setItem('qms_notification_reads', JSON.stringify(notifications.map((n) => n.id)));
      renderNotifications();
      toast('All notifications marked as read', 'success');
    });

    // Profile Dropdown
    document.getElementById('profileChip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById('profileMenu');
      menu?.classList.toggle('d-none');
      document.getElementById('notifPanel')?.classList.add('d-none');
      document.getElementById('btnNotifications')?.setAttribute('aria-expanded', 'false');
      const isOpen = !menu?.classList.contains('d-none');
      e.currentTarget.setAttribute('aria-expanded', String(isOpen));
    });
    document.getElementById('topProfileBtn')?.addEventListener('click', () => {
      document.getElementById('profileMenu')?.classList.add('d-none');
      document.getElementById('profileChip')?.setAttribute('aria-expanded', 'false');
      showPage('settings');
    });
    document.getElementById('topSettingsBtn')?.addEventListener('click', () => {
      document.getElementById('profileMenu')?.classList.add('d-none');
      document.getElementById('profileChip')?.setAttribute('aria-expanded', 'false');
      showPage('settings');
    });

    // Close dropdowns on outside click or escape
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.profile-wrap')) {
        document.getElementById('profileMenu')?.classList.add('d-none');
        document.getElementById('profileChip')?.setAttribute('aria-expanded', 'false');
      }
      if (!e.target.closest('.notif-wrap')) {
        document.getElementById('notifPanel')?.classList.add('d-none');
        document.getElementById('btnNotifications')?.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMobileSidebar();
        document.getElementById('notifPanel')?.classList.add('d-none');
        document.getElementById('profileMenu')?.classList.add('d-none');
        document.getElementById('globalSearchResults')?.classList.add('d-none');
        document.getElementById('btnNotifications')?.setAttribute('aria-expanded', 'false');
        document.getElementById('profileChip')?.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('btnClearQuestionFilters')?.addEventListener('click', clearQuestionFilters);
    document.getElementById('btnAddQuestion')?.addEventListener('click', () => openQuestionModal(null));
    document.getElementById('qqType')?.addEventListener('change', syncQuestionTypeFields);
    document.getElementById('qqText')?.addEventListener('input', checkBlankWarning);
    document.getElementById('btnInsertBlank')?.addEventListener('click', insertBlankMarker);
    document.getElementById('qqTF_True')?.addEventListener('change', () => {
      const tfHidden = document.getElementById('qqCorrectTF');
      if (tfHidden) tfHidden.value = 'True';
    });
    document.getElementById('qqTF_False')?.addEventListener('change', () => {
      const tfHidden = document.getElementById('qqCorrectTF');
      if (tfHidden) tfHidden.value = 'False';
    });
    document.getElementById('btnSaveQuestion')?.addEventListener('click', () => saveQuestion(false));
    document.getElementById('btnSaveQuestionKeep')?.addEventListener('click', () => saveQuestion(true));
    document.getElementById('btnResetQuestion')?.addEventListener('click', resetQuestionForm);
    document.getElementById('btnCancelQuestion')?.addEventListener('click', cancelQuestionModal);
    document.getElementById('btnQuestionViewEdit')?.addEventListener('click', () => {
      bootstrap.Modal.getInstance(document.getElementById('questionViewModal'))?.hide();
      if (activeQuestionView) openQuestionModal(activeQuestionView);
    });

    document.getElementById('btnClearCatFilters')?.addEventListener('click', clearCategoryFilters);
    document.getElementById('btnAddCategory')?.addEventListener('click', () => openCategoryModal(null));
    document.getElementById('btnSaveCategory')?.addEventListener('click', saveCategory);
    document.getElementById('btnResetCategory')?.addEventListener('click', resetCategoryForm);
    document.getElementById('btnCancelCategory')?.addEventListener('click', cancelCategoryModal);
    document.getElementById('cfDescription')?.addEventListener('input', (e) => {
      const el = document.getElementById('cfDescCount');
      if (el) el.textContent = e.target.value.length;
    });
    document.getElementById('btnCategoryViewEdit')?.addEventListener('click', () => {
      const id = document.getElementById('btnCategoryViewEdit')?.dataset.catId;
      bootstrap.Modal.getInstance(document.getElementById('categoryViewModal'))?.hide();
      if (id) {
        setTimeout(() => openCategoryModal(QMS.categories.get(id)), 250);
      }
    });

    document.getElementById('btnClearPartFilters')?.addEventListener('click', clearParticipantFilters);
    document.getElementById('btnAddParticipant')?.addEventListener('click', () => openParticipantModal(null));
    document.getElementById('btnSaveParticipant')?.addEventListener('click', saveParticipant);
    document.getElementById('btnResetParticipant')?.addEventListener('click', resetParticipantForm);
    document.getElementById('btnCancelParticipant')?.addEventListener('click', cancelParticipantModal);
    document.getElementById('btnProfileEditParticipant')?.addEventListener('click', () => {
      const id = document.getElementById('btnProfileEditParticipant')?.dataset.partId;
      bootstrap.Modal.getInstance(document.getElementById('participantProfileModal'))?.hide();
      if (id) {
        setTimeout(() => openParticipantModal(QMS.participants.get(id)), 250);
      }
    });
    document.getElementById('btnProfileViewAttempts')?.addEventListener('click', () => {
      const id = document.getElementById('btnProfileViewAttempts')?.dataset.partId;
      bootstrap.Modal.getInstance(document.getElementById('participantProfileModal'))?.hide();
      if (id) {
        location.hash = `#/attempts/${encodeURIComponent(id)}`;
      }
    });

    document.getElementById('btnStartAttempt')?.addEventListener('click', () => {
      const quizId = document.getElementById('attemptQuiz').value;
      const pid = document.getElementById('attemptParticipant').value;
      if (!quizId || !pid) return toast('Select quiz and participant', 'error');
      location.href = `quiz.html?start=${encodeURIComponent(quizId)}&p=${encodeURIComponent(pid)}`;
    });

    document.getElementById('btnSaveSettings')?.addEventListener('click', saveSettings);
    document.getElementById('btnSaveSettingsFooter')?.addEventListener('click', saveSettings);
    document.getElementById('btnResetSettings')?.addEventListener('click', resetSettingsToDefaults);
    document.getElementById('btnResetSettingsFooter')?.addEventListener('click', resetSettingsToDefaults);
    document.getElementById('btnResetDemoData')?.addEventListener('click', resetDemoDataAction);

    // Live preview for appearance changes
    document.getElementById('setTheme')?.addEventListener('change', (e) => {
      document.documentElement.setAttribute('data-theme', e.target.value);
      const topIcon = document.getElementById('topThemeIcon');
      if (topIcon) topIcon.className = e.target.value === 'dark' ? 'fa-regular fa-sun' : 'fa-regular fa-moon';
    });
    document.getElementById('setFont')?.addEventListener('change', (e) => {
      document.documentElement.classList.remove('font-small', 'font-medium', 'font-large');
      document.documentElement.classList.add(`font-${e.target.value}`);
      document.documentElement.setAttribute('data-font-size', e.target.value);
    });
    document.getElementById('setCompact')?.addEventListener('change', (e) => {
      document.body.classList.toggle('compact-sidebar', e.target.checked);
      document.getElementById('sidebar')?.classList.toggle('compact', e.target.checked);
    });

    document.getElementById('btnResetData')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset All Data',
        message: 'Reset all project data to zero? This action cannot be undone.',
        confirmText: 'Reset to Zero',
        type: 'danger'
      });
      if (!ok) return;
      QMS.resetAllData();
      toast('All project data reset to zero', 'warning');
      showPage(currentPage);
    });

    document.getElementById('btnGenerateReport')?.addEventListener('click', () => Reports.generate());
    document.getElementById('btnPrintReport')?.addEventListener('click', () => Reports.printReport());
    document.getElementById('btnRepClearFilters')?.addEventListener('click', () => Reports.clearFilters());
    document.getElementById('btnDownloadReport')?.addEventListener('click', () => Reports.downloadReport('html'));
    document.getElementById('btnPrintModalResult')?.addEventListener('click', () => window.print());
    document.getElementById('btnExportLeaderboard')?.addEventListener('click', exportLeaderboardCSV);
    document.getElementById('btnPrintLeaderboard')?.addEventListener('click', printLeaderboard);
    document.getElementById('btnLbClearFilters')?.addEventListener('click', clearLeaderboardFilters);
    ['lbQuiz', 'lbCategory', 'lbPeriod'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        lbPage = 1;
        renderLeaderboard();
      });
    });

    document.getElementById('btnExportQuizCSV')?.addEventListener('click', () => Reports.exportCSV('quiz'));
    document.getElementById('btnExportPartCSV')?.addEventListener('click', () => Reports.exportCSV('participant'));
    document.getElementById('btnExportCatCSV')?.addEventListener('click', () => Reports.exportCSV('category'));
    document.getElementById('btnExportResultsCSV')?.addEventListener('click', () => Reports.exportCSV('results'));
    document.getElementById('btnExportLeaderCSV')?.addEventListener('click', () => Reports.exportCSV('leaderboard'));
    document.getElementById('btnExportQuestionCSV')?.addEventListener('click', () => Reports.exportCSV('questions'));

    ['repFrom', 'repTo', 'repQuiz', 'repCategory', 'repParticipant'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        if (typeof Reports !== 'undefined' && Reports?.generate) Reports.generate();
      });
    });
  }

  function buildNotifications() {
    let readIds = [];
    try {
      readIds = JSON.parse(localStorage.getItem('qms_notification_reads') || '[]');
    } catch (_) {
      readIds = [];
    }
    notifications = [
      { id: 'n1', title: 'New attempt submitted', desc: 'Amina Khan completed JavaScript Essentials', time: '10m ago', page: 'results' },
      { id: 'n2', title: 'Quiz ending soon', desc: 'Data Structures Midterm expires in 2 hours', time: '1h ago', page: 'quizzes' },
      { id: 'n3', title: 'High performance alert', desc: 'Bilal Tariq achieved 100% in Python OOP', time: '3h ago', page: 'leaderboard' },
      { id: 'n4', title: 'New participant registered', desc: 'Sana Malik joined the platform', time: '1d ago', page: 'participants' }
    ].map((n) => ({ ...n, read: readIds.includes(n.id) }));
    renderNotifications();
  }

  function renderNotifications() {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;
    const unreadCount = notifications.filter((n) => !n.read).length;
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }
    if (!notifications.length) {
      list.innerHTML = '<div class="notif-empty">No notifications</div>';
      return;
    }
    list.innerHTML = notifications.map((n) => `
      <button type="button" class="notif-item ${n.read ? 'read' : ''}" data-notif-id="${n.id}" data-notif-page="${n.page}">
        <div><strong>${esc(n.title)}</strong></div>
        <small>${esc(n.desc)}</small>
        <div class="text-muted mt-1" style="font-size:0.75rem">${esc(n.time)}</div>
      </button>
    `).join('');
  }

  function init() {
    QMS.seedIfNeeded();
    if (!requireAuth()) return;
    applyAccessibilityLabels();
    applySettingsUI();
    updateClock();
    setInterval(updateClock, 1000);
    bindEvents();
    buildNotifications();
    handleRoute(location.hash || '#/dashboard');
    window.addEventListener('hashchange', () => {
      handleRoute(location.hash);
    });
  }

  return {
    init,
    toast,
    confirmDialog,
    openModal,
    closeModal,
    renderAlert,
    showPage,
    handleRoute,
    toggleTheme,
    Validators,
    setFieldValidation,
    clearFormValidation,
    validateForm,
    formatDate,
    formatDuration,
    formatPercent,
    formatCSV,
    debounce,
    statusBadge,
    leaderboardRows,
    applySettingsUI,
    TableHelper,
    renderQuizzes,
    openQuizViewModal,
    openParticipantSelectModal,
    clearQuizFilters,
    initCreateQuizPage,
    saveCreateQuiz,
    resetCreateQuizPage,
    cancelCreateQuiz,
    autoSelectQuestions,
    clearQuestionSelection,
    updateQuestionCounterBadge,
    renderQuestions,
    filteredQuestions,
    clearQuestionFilters,
    openQuestionViewModal,
    openQuestionModal,
    saveQuestion,
    resetQuestionForm,
    cancelQuestionModal,
    insertBlankMarker,
    syncQuestionTypeFields,
    renderCategories,
    filteredCategories,
    clearCategoryFilters,
    openCategoryViewModal,
    openCategoryModal,
    saveCategory,
    resetCategoryForm,
    cancelCategoryModal,
    refreshCategoryDropdowns,
    categoryQuizCount,
    categoryQuestionCount,
    categoryLinkedQuizzes,
    categoryLinkedQuestions,
    renderParticipants,
    filteredParticipants,
    clearParticipantFilters,
    openParticipantModal,
    openParticipantProfileModal,
    saveParticipant,
    resetParticipantForm,
    cancelParticipantModal,
    participantStats,
    refreshParticipantDropdowns,
    renderResults,
    filteredResultsAdmin,
    clearResultsFilters,
    renderAttempts,
    filteredAttemptsAdmin,
    clearAttemptsFilters,
    getAttemptNumber,
    getAttemptStatus,
    renderLeaderboard,
    exportLeaderboardCSV,
    printLeaderboard,
    clearLeaderboardFilters,
    renderSettings,
    saveSettings,
    resetSettingsToDefaults,
    resetDemoDataAction
  };
})();

window.App = App;
if (window.QMS) {
  window.QMS.router = { handleRoute: App.handleRoute, showPage: App.showPage };
  window.QMS.ui = {
    toast: App.toast,
    confirmDialog: App.confirmDialog,
    openModal: App.openModal,
    closeModal: App.closeModal,
    renderAlert: App.renderAlert,
    Validators: App.Validators,
    setFieldValidation: App.setFieldValidation,
    clearFormValidation: App.clearFormValidation,
    validateForm: App.validateForm,
    formatDate: App.formatDate,
    formatDuration: App.formatDuration,
    formatPercent: App.formatPercent,
    formatCSV: App.formatCSV,
    debounce: App.debounce,
    statusBadge: App.statusBadge,
    TableHelper: App.TableHelper
  };
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.app === 'admin') App.init();
});
