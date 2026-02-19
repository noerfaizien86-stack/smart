/**
 * Smart CBT Backend - Google Apps Script
 * Deploy as Web App (execute as me, accessible by anyone with link)
 */

const SHEET = {
  USERS: 'Users',
  BANK_SOAL: 'BankSoal',
  UJIAN: 'Ujian',
  JAWABAN: 'Jawaban',
  HASIL: 'Hasil',
  LOG: 'LogAktivitas',
  SESSION: 'Session'
};

function doGet() {
  return createResponse({ ok: true, data: { service: 'Smart CBT API', status: 'running' } });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action;

    const handlers = {
      login: () => login(payload),
      dashboard: () => getDashboard(payload),
      listExams: () => listExams(payload),
      startExam: () => startExam(payload),
      saveAnswer: () => saveAnswer(payload),
      submitExam: () => submitExam(payload),
      importDocx: () => importDocxQuestions(payload)
    };

    if (!handlers[action]) throw new Error('Action tidak dikenali');

    const data = handlers[action]();
    return createResponse({ ok: true, data });
  } catch (error) {
    return createResponse({ ok: false, message: error.message });
  }
}

function login({ username, password, role }) {
  const users = getRows(SHEET.USERS);
  const user = users.find(
    (u) =>
      String(u.username).trim() === String(username).trim() &&
      String(u.password) === String(password) &&
      String(u.role).toLowerCase() === String(role).toLowerCase() &&
      String(u.aktif).toLowerCase() === 'ya'
  );

  if (!user) throw new Error('Username/password/role tidak valid');

  const sessionId = Utilities.getUuid();
  upsertSession({
    sessionId,
    userId: user.userId,
    nama: user.nama,
    role: user.role,
    loginAt: new Date().toISOString()
  });
  writeLog(user.userId, 'LOGIN', 'Login berhasil');

  return {
    sessionId,
    userId: user.userId,
    nama: user.nama,
    role: user.role
  };
}

function getDashboard({ sessionId }) {
  const session = validateSession(sessionId);

  if (session.role === 'siswa') {
    return {
      totalGuru: countByRole('guru'),
      totalSiswa: countByRole('siswa'),
      totalPengawas: countByRole('pengawas'),
      totalUjian: listExams({ sessionId }).length,
      totalHasil: getRows(SHEET.HASIL).filter((r) => r.siswaId === session.userId).length
    };
  }

  return {
    totalGuru: countByRole('guru'),
    totalSiswa: countByRole('siswa'),
    totalPengawas: countByRole('pengawas'),
    totalUjian: getRows(SHEET.UJIAN).length,
    totalHasil: getRows(SHEET.HASIL).length
  };
}

function listExams({ sessionId }) {
  const session = validateSession(sessionId);
  const exams = getRows(SHEET.UJIAN).filter((u) => String(u.status).toLowerCase() === 'aktif');

  if (session.role === 'siswa') {
    return exams.filter((exam) => String(exam.pesertaIds || '').includes(session.userId));
  }
  return exams;
}

function startExam({ sessionId, examId, token }) {
  const session = validateSession(sessionId);
  if (session.role !== 'siswa') throw new Error('Hanya siswa yang dapat memulai ujian');

  const exam = getRows(SHEET.UJIAN).find((u) => u.id === examId);
  if (!exam) throw new Error('Ujian tidak ditemukan');
  if (String(exam.token) !== String(token)) throw new Error('Token ujian salah');

  const bank = getRows(SHEET.BANK_SOAL).filter((q) => q.ujianId === examId);
  const randomized = shuffleQuestions(bank, exam.randomSoal === 'ya', exam.randomOpsi === 'ya');

  const saved = getRows(SHEET.JAWABAN).filter(
    (j) => j.ujianId === examId && j.siswaId === session.userId && j.status === 'draft'
  );

  const savedAnswers = saved.reduce((obj, row) => {
    obj[row.soalId] = parseAnswer(row.jawaban);
    return obj;
  }, {});

  writeLog(session.userId, 'START_EXAM', `Mulai ujian ${examId}`);

  return {
    exam,
    questions: randomized.map((q) => ({
      id: q.soalId,
      question: q.pertanyaan,
      type: q.tipe,
      options: parseOptions(q.opsi)
    })),
    remainingSec: Number(exam.durasiMenit) * 60,
    savedAnswers
  };
}

function saveAnswer({ sessionId, examId, questionId, answer }) {
  const session = validateSession(sessionId);
  if (session.role !== 'siswa') throw new Error('Hanya siswa yang dapat menyimpan jawaban');

  upsertDraftAnswer({
    ujianId: examId,
    siswaId: session.userId,
    soalId: questionId,
    jawaban: JSON.stringify(answer),
    status: 'draft',
    updatedAt: new Date().toISOString()
  });

  return { saved: true };
}

function submitExam({ sessionId, examId }) {
  const session = validateSession(sessionId);
  if (session.role !== 'siswa') throw new Error('Hanya siswa yang dapat submit ujian');

  const exam = getRows(SHEET.UJIAN).find((u) => u.id === examId);
  if (!exam) throw new Error('Ujian tidak ditemukan');

  const drafts = getRows(SHEET.JAWABAN).filter(
    (j) => j.ujianId === examId && j.siswaId === session.userId && j.status === 'draft'
  );

  const scoreData = calculateScore(examId, drafts);

  finalizeAnswers(examId, session.userId);
  appendRow(SHEET.HASIL, {
    hasilId: Utilities.getUuid(),
    ujianId: examId,
    siswaId: session.userId,
    skor: scoreData.score,
    benar: scoreData.correct,
    salah: scoreData.wrong,
    kosong: scoreData.blank,
    submittedAt: new Date().toISOString()
  });

  writeLog(session.userId, 'SUBMIT_EXAM', `Submit ujian ${examId}`);

  return {
    score: scoreData.score,
    showResultToStudent: String(exam.tampilkanNilai).toLowerCase() === 'ya'
  };
}

/**
 * Parsing sederhana hasil ekstraksi DOCX (text mentah).
 * Untuk DOCX gunakan Drive API + DocumentApp/konversi Google Docs dulu.
 */
function importDocxQuestions({ ujianId, rawText }) {
  if (!rawText) throw new Error('rawText kosong');

  const blocks = rawText
    .split(/\n(?=\d+\.)/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const rows = blocks.map((block) => parseQuestionBlock(ujianId, block));
  rows.forEach((row) => appendRow(SHEET.BANK_SOAL, row));

  return { imported: rows.length };
}

function parseQuestionBlock(ujianId, block) {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const qLine = lines.find((l) => /^\d+\./.test(l)) || '';
  const options = lines.filter((l) => /^[A-D]\.\s*/i.test(l));
  const answerLine = lines.find((l) => /^Jawaban:/i.test(l)) || 'Jawaban:';
  const typeLine = lines.find((l) => /^Tipe:/i.test(l)) || 'Tipe: PG';

  return {
    soalId: Utilities.getUuid(),
    ujianId,
    tipe: typeLine.split(':')[1].trim(),
    pertanyaan: qLine.replace(/^\d+\.\s*/, ''),
    opsi: JSON.stringify(
      options.map((opt) => ({
        value: opt[0].toUpperCase(),
        label: opt.replace(/^[A-D]\.\s*/i, '').trim()
      }))
    ),
    jawabanBenar: answerLine.split(':')[1].trim(),
    bobot: 1
  };
}

function calculateScore(examId, drafts) {
  const bank = getRows(SHEET.BANK_SOAL).filter((q) => q.ujianId === examId);
  const map = drafts.reduce((obj, d) => {
    obj[d.soalId] = parseAnswer(d.jawaban);
    return obj;
  }, {});

  let correct = 0;
  let wrong = 0;
  let blank = 0;

  bank.forEach((q) => {
    const ans = map[q.soalId];
    if (ans === undefined || ans === '' || (Array.isArray(ans) && ans.length === 0)) {
      blank += 1;
      return;
    }

    if (q.tipe === 'Uraian') {
      return;
    }

    const right = parseAnswer(q.jawabanBenar);
    if (JSON.stringify(normalize(ans)) === JSON.stringify(normalize(right))) {
      correct += 1;
    } else {
      wrong += 1;
    }
  });

  const objectiveCount = bank.filter((q) => q.tipe !== 'Uraian').length || 1;
  const score = Math.round((correct / objectiveCount) * 100);

  return { score, correct, wrong, blank };
}

function normalize(value) {
  if (Array.isArray(value)) return [...value].sort();
  return String(value).trim().toUpperCase();
}

function shuffleQuestions(bank, randomQuestion, randomOption) {
  const clone = JSON.parse(JSON.stringify(bank));
  if (String(randomQuestion).toLowerCase() === 'ya') {
    clone.sort(() => Math.random() - 0.5);
  }

  if (String(randomOption).toLowerCase() === 'ya') {
    clone.forEach((q) => {
      const options = parseOptions(q.opsi);
      q.opsi = JSON.stringify(options.sort(() => Math.random() - 0.5));
    });
  }

  return clone;
}

function parseOptions(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch (error) {
    return [];
  }
}

function parseAnswer(value) {
  if (value === null || value === undefined) return '';
  try {
    return JSON.parse(value);
  } catch (error) {
    return String(value);
  }
}

function getSheet(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error(`Sheet ${name} tidak ditemukan`);
  return sheet;
}

function getRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((key, idx) => {
      obj[key] = row[idx];
    });
    return obj;
  });
}

function appendRow(sheetName, rowObj) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getDataRange().getValues()[0];
  const row = headers.map((h) => rowObj[h] ?? '');
  sheet.appendRow(row);
}

function upsertDraftAnswer(data) {
  const sheet = getSheet(SHEET.JAWABAN);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  const idx = values.findIndex(
    (row, i) =>
      i > 0 &&
      row[headers.indexOf('ujianId')] === data.ujianId &&
      row[headers.indexOf('siswaId')] === data.siswaId &&
      row[headers.indexOf('soalId')] === data.soalId &&
      row[headers.indexOf('status')] === 'draft'
  );

  if (idx === -1) {
    appendRow(SHEET.JAWABAN, {
      jawabanId: Utilities.getUuid(),
      ...data
    });
    return;
  }

  Object.entries(data).forEach(([key, value]) => {
    const col = headers.indexOf(key) + 1;
    if (col > 0) {
      sheet.getRange(idx + 1, col).setValue(value);
    }
  });
}

function finalizeAnswers(examId, siswaId) {
  const sheet = getSheet(SHEET.JAWABAN);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const examCol = headers.indexOf('ujianId');
  const siswaCol = headers.indexOf('siswaId');
  const statusCol = headers.indexOf('status');

  values.forEach((row, idx) => {
    if (idx === 0) return;
    if (row[examCol] === examId && row[siswaCol] === siswaId && row[statusCol] === 'draft') {
      sheet.getRange(idx + 1, statusCol + 1).setValue('submitted');
    }
  });
}

function upsertSession(session) {
  const existing = getRows(SHEET.SESSION);
  const found = existing.find((s) => s.userId === session.userId);
  if (!found) {
    appendRow(SHEET.SESSION, session);
    return;
  }

  const sheet = getSheet(SHEET.SESSION);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idx = values.findIndex((row, i) => i > 0 && row[headers.indexOf('userId')] === session.userId);

  Object.entries(session).forEach(([key, value]) => {
    const col = headers.indexOf(key) + 1;
    if (col > 0) sheet.getRange(idx + 1, col).setValue(value);
  });
}

function validateSession(sessionId) {
  const session = getRows(SHEET.SESSION).find((s) => s.sessionId === sessionId);
  if (!session) throw new Error('Session tidak valid, silakan login ulang');
  return session;
}

function countByRole(role) {
  return getRows(SHEET.USERS).filter(
    (u) => String(u.role).toLowerCase() === role && String(u.aktif).toLowerCase() === 'ya'
  ).length;
}

function writeLog(userId, aktivitas, detail) {
  appendRow(SHEET.LOG, {
    logId: Utilities.getUuid(),
    waktu: new Date().toISOString(),
    userId,
    aktivitas,
    detail
  });
}

function createResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
