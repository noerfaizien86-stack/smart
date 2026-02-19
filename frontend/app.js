const API_URL = 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';

const state = {
  session: null,
  activeMenu: 'dashboard',
  activeExam: null,
  questions: [],
  answers: {},
  currentIndex: 0,
  timerRef: null,
  timeLeftSec: 0
};

const menusByRole = {
  admin: [
    'dashboard',
    'manajemen guru',
    'manajemen siswa',
    'manajemen pengawas',
    'manajemen ujian',
    'monitoring',
    'rekap nilai',
    'analisis'
  ],
  guru: ['dashboard guru', 'buat ujian', 'monitoring', 'hasil siswa', 'analisis butir'],
  pengawas: ['dashboard pengawas', 'buat ujian', 'monitoring'],
  siswa: ['dashboard siswa', 'daftar ujian', 'hasil saya']
};

const el = {
  loginView: document.getElementById('loginView'),
  dashboardView: document.getElementById('dashboardView'),
  examView: document.getElementById('examView'),
  loginForm: document.getElementById('loginForm'),
  loginMessage: document.getElementById('loginMessage'),
  sessionInfo: document.getElementById('sessionInfo'),
  menuList: document.getElementById('menuList'),
  logoutBtn: document.getElementById('logoutBtn'),
  menuToggle: document.getElementById('menuToggle'),
  sidebar: document.getElementById('sidebar'),
  timer: document.getElementById('timer'),
  progressBar: document.getElementById('progressBar'),
  questionContainer: document.getElementById('questionContainer'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  submitExamBtn: document.getElementById('submitExamBtn'),
  examTitle: document.getElementById('examTitle')
};

el.loginForm.addEventListener('submit', onLogin);
el.logoutBtn.addEventListener('click', logout);
el.menuToggle.addEventListener('click', () => el.sidebar.classList.toggle('open'));
el.prevBtn.addEventListener('click', () => moveQuestion(-1));
el.nextBtn.addEventListener('click', () => moveQuestion(1));
el.submitExamBtn.addEventListener('click', submitExam);
window.addEventListener('beforeunload', (event) => {
  if (state.activeExam) {
    event.preventDefault();
    event.returnValue = 'Ujian masih berlangsung, yakin mau keluar?';
  }
});

async function apiCall(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.message || 'Unknown API error');
  return json.data;
}

async function onLogin(event) {
  event.preventDefault();
  const formData = new FormData(el.loginForm);
  const credentials = Object.fromEntries(formData.entries());

  try {
    const session = await apiCall('login', credentials);
    state.session = session;
    el.loginMessage.textContent = 'Login berhasil!';
    el.sessionInfo.textContent = `${session.nama} (${session.role})`;
    el.logoutBtn.hidden = false;
    buildMenu(session.role);
    showView('dashboard');
    await loadDashboard();
  } catch (error) {
    el.loginMessage.textContent = `Gagal login: ${error.message}`;
  }
}

function buildMenu(role) {
  const menus = menusByRole[role] || [];
  el.menuList.innerHTML = menus
    .map(
      (m, i) =>
        `<button class="menu-item ${i === 0 ? 'active' : ''}" data-menu="${m}">${m.toUpperCase()}</button>`
    )
    .join('');

  el.menuList.querySelectorAll('.menu-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      setActiveMenu(btn.dataset.menu);
      if (btn.dataset.menu.includes('ujian') && state.session.role === 'siswa') {
        await loadExamList();
      } else {
        await loadDashboard();
      }
    });
  });
}

function setActiveMenu(menu) {
  state.activeMenu = menu;
  el.menuList.querySelectorAll('.menu-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.menu === menu);
  });
}

function showView(name) {
  ['loginView', 'dashboardView', 'examView'].forEach((view) => {
    el[view].classList.remove('active');
  });

  if (name === 'login') el.loginView.classList.add('active');
  if (name === 'dashboard') el.dashboardView.classList.add('active');
  if (name === 'exam') el.examView.classList.add('active');
}

async function loadDashboard() {
  showView('dashboard');

  const data = await apiCall('dashboard', { sessionId: state.session.sessionId });
  const cards = [
    ['Guru', data.totalGuru],
    ['Siswa', data.totalSiswa],
    ['Pengawas', data.totalPengawas],
    ['Ujian', data.totalUjian],
    ['Hasil', data.totalHasil]
  ]
    .map(
      ([label, value]) => `<article class="stat-card"><h4>${label}</h4><h2>${value}</h2></article>`
    )
    .join('');

  el.dashboardView.innerHTML = `
    <div class="card">
      <h3>Dashboard ${state.session.role}</h3>
      <p class="muted">Menu aktif: ${state.activeMenu}</p>
      <div class="dashboard-grid">${cards}</div>
    </div>
  `;

  if (state.session.role === 'siswa') {
    await loadExamList();
  }
}

async function loadExamList() {
  const exams = await apiCall('listExams', { sessionId: state.session.sessionId });
  const rows = exams
    .map(
      (exam) => `
      <article class="stat-card">
        <h4>${exam.namaUjian}</h4>
        <p>Durasi: ${exam.durasiMenit} menit</p>
        <input placeholder="Token ujian" id="token-${exam.id}" />
        <button class="primary" onclick="startExam('${exam.id}', document.getElementById('token-${exam.id}').value)">Mulai</button>
      </article>
    `
    )
    .join('');

  el.dashboardView.innerHTML += `<div class="card"><h3>Daftar Ujian</h3><div class="dashboard-grid">${rows}</div></div>`;
}

window.startExam = async function startExam(examId, token) {
  try {
    const data = await apiCall('startExam', {
      sessionId: state.session.sessionId,
      examId,
      token
    });
    state.activeExam = data.exam;
    state.questions = data.questions;
    state.answers = data.savedAnswers || {};
    state.currentIndex = 0;
    state.timeLeftSec = data.remainingSec;
    el.examTitle.textContent = data.exam.namaUjian;
    showView('exam');
    renderQuestion();
    startTimer();
  } catch (error) {
    alert(`Gagal mulai ujian: ${error.message}`);
  }
};

function renderQuestion() {
  const q = state.questions[state.currentIndex];
  if (!q) return;

  const answer = state.answers[q.id] ?? (q.type === 'MCMA' ? [] : '');
  const options = (q.options || [])
    .map((opt, idx) => {
      if (q.type === 'MCMA') {
        const checked = answer.includes(opt.value) ? 'checked' : '';
        return `<label><input type="checkbox" data-value="${opt.value}" ${checked}/> ${String.fromCharCode(
          65 + idx
        )}. ${opt.label}</label>`;
      }

      return `<label><input type="radio" name="answer" value="${opt.value}" ${
        answer === opt.value ? 'checked' : ''
      }/> ${String.fromCharCode(65 + idx)}. ${opt.label}</label>`;
    })
    .join('<br/>');

  const inputHtml =
    q.type === 'Uraian'
      ? `<textarea id="essayAnswer" rows="4" placeholder="Ketik jawaban...">${answer}</textarea>`
      : options;

  el.questionContainer.innerHTML = `
    <div class="question-card">
      <p><b>Soal ${state.currentIndex + 1}/${state.questions.length}</b></p>
      <p>${q.question}</p>
      <div class="muted">Tipe: ${q.type}</div>
      <div class="answer-wrap">${inputHtml}</div>
    </div>
  `;

  bindAnswerEvents(q);
  updateProgress();
}

function bindAnswerEvents(question) {
  if (question.type === 'Uraian') {
    const essay = document.getElementById('essayAnswer');
    essay?.addEventListener('input', () => saveAnswer(question.id, essay.value));
    return;
  }

  if (question.type === 'MCMA') {
    el.questionContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        const values = Array.from(
          el.questionContainer.querySelectorAll('input[type="checkbox"]:checked')
        ).map((input) => input.dataset.value);
        saveAnswer(question.id, values);
      });
    });
    return;
  }

  el.questionContainer.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => saveAnswer(question.id, radio.value));
  });
}

async function saveAnswer(questionId, answer) {
  state.answers[questionId] = answer;
  await apiCall('saveAnswer', {
    sessionId: state.session.sessionId,
    examId: state.activeExam.id,
    questionId,
    answer
  });
  updateProgress();
}

function moveQuestion(step) {
  const nextIndex = state.currentIndex + step;
  if (nextIndex < 0 || nextIndex >= state.questions.length) return;
  state.currentIndex = nextIndex;
  renderQuestion();
}

function updateProgress() {
  const answered = Object.keys(state.answers).length;
  const progress = (answered / state.questions.length) * 100;
  el.progressBar.style.width = `${progress}%`;
}

function startTimer() {
  clearInterval(state.timerRef);
  state.timerRef = setInterval(async () => {
    state.timeLeftSec -= 1;
    if (state.timeLeftSec <= 0) {
      clearInterval(state.timerRef);
      await submitExam(true);
      return;
    }
    el.timer.textContent = secondsToClock(state.timeLeftSec);
  }, 1000);
}

function secondsToClock(totalSec) {
  const h = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSec % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}`;
}

async function submitExam(auto = false) {
  if (!auto && !confirm('Yakin submit ujian sekarang?')) return;

  try {
    const result = await apiCall('submitExam', {
      sessionId: state.session.sessionId,
      examId: state.activeExam.id
    });
    alert(auto ? 'Waktu habis, ujian otomatis disubmit.' : 'Ujian berhasil disubmit.');
    clearInterval(state.timerRef);
    state.activeExam = null;
    await loadDashboard();
    if (result.showResultToStudent) {
      alert(`Nilai sementara: ${result.score}`);
    }
  } catch (error) {
    alert(`Submit gagal: ${error.message}`);
  }
}

function logout() {
  state.session = null;
  state.activeExam = null;
  clearInterval(state.timerRef);
  el.loginForm.reset();
  el.sessionInfo.textContent = 'Belum login';
  el.menuList.innerHTML = '';
  el.logoutBtn.hidden = true;
  showView('login');
}
