// ===== Swami Samarth Jap Tracker — Main App =====

const TOTAL_TARGET = 600000;
const TOTAL_DAYS = 1095;
const DEFAULT_DAILY = 600;
const DEFAULT_WEEKLY = 4200;
const MILESTONE_THRESHOLDS = [10000, 108000, 200000, 300000, 500000, 600000];

// ===== Helpers =====
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function parseDate(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function daysBetween(a,b) { return Math.floor((b-a)/(1000*60*60*24)); }
function formatDate(d) { return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
function formatNum(n) { return n.toLocaleString('en-IN'); }

// ===== State =====
let currentScreen = 'home';
let todayRecord = null;
let heatmapMonth = new Date();
let deferredInstallPrompt = null;

// ===== Navigation =====
function switchScreen(name) {
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.screen === name);
  });
  // Refresh screen data
  if (name === 'home') refreshHome();
  else if (name === 'counter') refreshCounter();
  else if (name === 'progress') refreshProgress();
  else if (name === 'journal') refreshJournal();
  else if (name === 'settings') refreshSettings();
}

// ===== Init =====
async function initApp() {
  await openDB();
  const settings = getSettings();
  
  if (!settings) {
    document.getElementById('onboarding').classList.remove('hidden');
    return;
  }
  
  document.getElementById('onboarding').classList.add('hidden');
  
  // Load today's record
  const today = todayStr();
  todayRecord = await getDailyRecord(today);
  if (!todayRecord) {
    todayRecord = { date: today, month: monthStr(new Date()), count: 0, entries: [] };
  }
  
  // Update streak
  await updateStreak();
  
  // Set up nav
  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.addEventListener('click', () => switchScreen(nav.dataset.screen));
  });
  
  // Request notification permission
  requestNotificationPermission();
  
  // Schedule notifications
  scheduleNotifications();
  
  // Check for milestones to celebrate
  checkAnniversary();
  
  // Set up tap zone for counter
  setupTapZone();
  
  switchScreen('home');
}

// ===== Onboarding =====
function submitOnboarding() {
  const name = document.getElementById('ob-name').value.trim();
  const startDate = document.getElementById('ob-start-date').value;
  const morningTime = document.getElementById('ob-morning-time').value;
  const afternoonTime = document.getElementById('ob-afternoon-time').value;
  
  if (!name || !startDate || !morningTime || !afternoonTime) {
    alert('Please fill all fields');
    return;
  }
  
  saveSettings({
    name,
    startDate,
    morningTime,
    afternoonTime,
    dailyTarget: DEFAULT_DAILY,
    weeklyTarget: DEFAULT_WEEKLY,
    setupDone: true
  });
  
  saveTotalJap(0);
  saveStreakData({ current: 0, best: 0, lastDate: null });
  saveMilestones([]);
  
  document.getElementById('onboarding').classList.add('hidden');
  initApp();
}

// ===== Home Screen =====
async function refreshHome() {
  const settings = getSettings();
  if (!settings) return;
  
  const today = todayStr();
  todayRecord = await getDailyRecord(today);
  if (!todayRecord) todayRecord = { date: today, month: monthStr(new Date()), count: 0, entries: [] };
  
  const total = getTotalJap();
  const streak = getStreakData();
  const startDate = parseDate(settings.startDate);
  const now = new Date();
  const daysElapsed = Math.max(1, daysBetween(startDate, now) + 1);
  const daysRemaining = Math.max(0, TOTAL_DAYS - daysElapsed);
  const dailyTarget = settings.dailyTarget || DEFAULT_DAILY;
  const remaining = Math.max(0, dailyTarget - todayRecord.count);
  const pct = Math.min(100, (total / TOTAL_TARGET * 100));
  
  // Expected by now
  const expectedTotal = daysElapsed * dailyTarget;
  const diff = total - expectedTotal;
  
  // Estimated finish
  const avgPerDay = total / daysElapsed;
  let estFinishDate = null;
  if (avgPerDay > 0) {
    const remainingJap = TOTAL_TARGET - total;
    const daysNeeded = Math.ceil(remainingJap / avgPerDay);
    estFinishDate = new Date(now.getTime() + daysNeeded * 86400000);
  }
  
  // Quote of the day
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  const quote = SWAMI_QUOTES[dayOfYear % SWAMI_QUOTES.length];
  
  document.getElementById('home-quote-mr').textContent = quote.mr;
  document.getElementById('home-quote-en').textContent = quote.en;
  document.getElementById('home-today-count').textContent = formatNum(todayRecord.count);
  document.getElementById('home-today-remaining').textContent = remaining > 0 ? `${formatNum(remaining)} remaining today` : '✅ Today\'s target complete!';
  document.getElementById('home-streak').textContent = streak.current;
  document.getElementById('home-total').textContent = formatNum(total);
  document.getElementById('home-total-target').textContent = `/ ${formatNum(TOTAL_TARGET)}`;
  document.getElementById('home-pct').textContent = pct.toFixed(1) + '%';
  document.getElementById('home-days-remaining').textContent = daysRemaining;
  document.getElementById('home-best-streak').textContent = streak.best;
  
  // Progress bar
  document.getElementById('home-progress-fill').style.width = pct + '%';
  const pct2El = document.getElementById('home-pct-2');
  if (pct2El) pct2El.textContent = pct.toFixed(1) + '%';
  
  // Estimated date
  if (estFinishDate) {
    document.getElementById('home-est-date').textContent = formatDate(estFinishDate);
  } else {
    document.getElementById('home-est-date').textContent = '—';
  }
  
  // Ahead/behind badge
  const badgeEl = document.getElementById('home-badge');
  if (diff >= 0) {
    badgeEl.className = 'badge-pill badge-ahead';
    badgeEl.textContent = `✨ Ahead by ${formatNum(diff)} jap`;
  } else {
    const extraNeeded = daysRemaining > 0 ? Math.ceil(Math.abs(diff) / daysRemaining) : Math.abs(diff);
    badgeEl.className = 'badge-pill badge-behind';
    badgeEl.textContent = `⚡ Need ${formatNum(extraNeeded)} extra/day`;
  }
  
  // Catch-up banner (Sunday)
  const catchup = document.getElementById('home-catchup');
  if (now.getDay() === 0 && diff < 0) {
    const catchupTarget = dailyTarget + Math.abs(diff);
    document.getElementById('catchup-target').textContent = formatNum(Math.min(catchupTarget, dailyTarget * 3));
    catchup.classList.remove('hidden');
  } else {
    catchup.classList.add('hidden');
  }
  
  // Greeting
  document.getElementById('home-greeting').textContent = `Jai Swami Samarth, ${settings.name}! 🙏`;
  
  // Share button visibility
  document.getElementById('share-float').style.display = currentScreen === 'home' ? 'flex' : 'none';
}

// ===== Counter Screen =====
async function refreshCounter() {
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  const today = todayStr();
  todayRecord = await getDailyRecord(today);
  if (!todayRecord) todayRecord = { date: today, month: monthStr(new Date()), count: 0, entries: [] };
  
  const count = todayRecord.count;
  const pct = Math.min(100, count / dailyTarget * 100);
  const remaining = Math.max(0, dailyTarget - count);
  
  document.getElementById('counter-value').textContent = formatNum(count);
  document.getElementById('counter-remaining').textContent = remaining > 0 ? `${formatNum(remaining)} more to reach ${formatNum(dailyTarget)} today` : '🎉 Daily target reached!';
  
  // Update ring
  updateCounterRing(pct);
  
  // Update streak display
  const streak = getStreakData();
  document.getElementById('counter-streak').textContent = streak.current;
  document.getElementById('counter-best-streak').textContent = streak.best;
  
  // Share button
  document.getElementById('share-float').style.display = 'none';
}

function updateCounterRing(pct) {
  const circle = document.getElementById('counter-ring-progress');
  if (!circle) return;
  const r = 70;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  circle.style.strokeDasharray = circ;
  circle.style.strokeDashoffset = Math.max(0, offset);
  document.getElementById('counter-ring-pct').textContent = Math.round(pct) + '%';
}

async function addJap(amount) {
  const today = todayStr();
  todayRecord = await getDailyRecord(today);
  if (!todayRecord) todayRecord = { date: today, month: monthStr(new Date()), count: 0, entries: [] };
  
  const oldTotal = getTotalJap();
  const oldCount = todayRecord.count;
  
  todayRecord.count += amount;
  todayRecord.entries.push({ amount, time: Date.now() });
  
  await saveDailyRecord(todayRecord);
  await pushUndo({ date: today, amount, time: Date.now() });
  
  const newTotal = oldTotal + amount;
  saveTotalJap(newTotal);
  
  // Update streak
  await updateStreak();
  
  // Animate counter
  const counterEl = document.getElementById('counter-value');
  counterEl.classList.add('bump');
  setTimeout(() => counterEl.classList.remove('bump'), 150);
  
  refreshCounter();
  
  // Check milestones
  checkMilestones(oldTotal, newTotal);
  
  // Check if daily target reached — show journal prompt
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  if (oldCount < dailyTarget && todayRecord.count >= dailyTarget) {
    // Show a completion animation
    showConfetti();
    setTimeout(() => {
      if (confirm(`🎉 You completed ${formatNum(dailyTarget)} jap today! Would you like to write in your journal?`)) {
        switchScreen('journal');
      }
    }, 1500);
  }
}

async function undoLast() {
  const today = todayStr();
  const undoEntry = await popUndo(today);
  if (!undoEntry) {
    alert('Nothing to undo');
    return;
  }
  
  todayRecord = await getDailyRecord(today);
  if (!todayRecord) return;
  
  todayRecord.count = Math.max(0, todayRecord.count - undoEntry.amount);
  todayRecord.entries.pop();
  await saveDailyRecord(todayRecord);
  
  const total = getTotalJap();
  saveTotalJap(Math.max(0, total - undoEntry.amount));
  
  refreshCounter();
}

// ===== Streak Management =====
async function updateStreak() {
  const settings = getSettings();
  if (!settings) return;
  
  const dailyTarget = settings.dailyTarget || DEFAULT_DAILY;
  const streak = getStreakData();
  const today = todayStr();
  const todayDate = new Date();
  
  // Get today's record
  const rec = await getDailyRecord(today);
  const todayCount = rec ? rec.count : 0;
  
  if (todayCount >= dailyTarget) {
    if (streak.lastDate === today) {
      // Already counted today
    } else {
      // Check if yesterday was the last streak day
      const yesterday = new Date(todayDate);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      
      if (streak.lastDate === yesterdayStr || streak.current === 0) {
        streak.current += 1;
      } else {
        streak.current = 1;
      }
      streak.lastDate = today;
      streak.best = Math.max(streak.best, streak.current);
      saveStreakData(streak);
      
      // Streak milestone check
      if (STREAK_MESSAGES[streak.current]) {
        const msg = STREAK_MESSAGES[streak.current];
        setTimeout(() => {
          showCelebration('🔥', `${streak.current} Day Streak!`, msg.mr, msg.en, '');
        }, 500);
      }
    }
  }
}

// ===== Milestones =====
function checkMilestones(oldTotal, newTotal) {
  const milestones = getMilestones();
  for (const threshold of MILESTONE_THRESHOLDS) {
    if (oldTotal < threshold && newTotal >= threshold && !milestones.includes(threshold)) {
      milestones.push(threshold);
      saveMilestones(milestones);
      const msg = MILESTONE_MESSAGES[threshold];
      showCelebration(msg.badge, msg.title, msg.mr, msg.en, `Badge: ${msg.title}`);
      return; // Show one at a time
    }
  }
}

function showCelebration(emoji, title, mrMsg, enMsg, badgeName) {
  const overlay = document.getElementById('celebration');
  document.getElementById('celeb-emoji').textContent = emoji;
  document.getElementById('celeb-title').textContent = title;
  document.getElementById('celeb-msg-mr').textContent = mrMsg;
  document.getElementById('celeb-msg-en').textContent = enMsg;
  document.getElementById('celeb-badge-name').textContent = badgeName;
  overlay.classList.remove('hidden');
  showConfetti();
}

function closeCelebration() {
  document.getElementById('celebration').classList.add('hidden');
}

function checkAnniversary() {
  const settings = getSettings();
  if (!settings) return;
  const start = parseDate(settings.startDate);
  const now = new Date();
  const elapsed = daysBetween(start, now) + 1;
  if (ANNIVERSARY_MESSAGES[elapsed]) {
    const msg = ANNIVERSARY_MESSAGES[elapsed];
    const shown = localStorage.getItem('anniversaryShown_' + elapsed);
    if (!shown) {
      localStorage.setItem('anniversaryShown_' + elapsed, 'true');
      setTimeout(() => showCelebration('🎊', `Day ${elapsed}!`, msg.mr, msg.en, ''), 1000);
    }
  }
}

// ===== Confetti =====
function showConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#FF6B00', '#FFD700', '#FF8C00', '#FFA500', '#FF4500', '#22c55e', '#eab308'];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(piece);
  }
  setTimeout(() => container.innerHTML = '', 4000);
}

// ===== Progress Screen =====
async function refreshProgress() {
  await renderProgressRings();
  await renderLineChart();
  await renderHeatmap();
  await renderMonthlySummary();
  document.getElementById('share-float').style.display = 'none';
}

async function renderProgressRings() {
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  const weeklyTarget = settings ? (settings.weeklyTarget || DEFAULT_WEEKLY) : DEFAULT_WEEKLY;
  
  const today = todayStr();
  const todayRec = await getDailyRecord(today);
  const dailyCount = todayRec ? todayRec.count : 0;
  const dailyPct = Math.min(100, dailyCount / dailyTarget * 100);
  
  // Weekly count
  const now = new Date();
  const day = now.getDay();
  let weeklyCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - ((day + 7 - i) % 7));
    // Actually let's get Monday-based week
    const diff = (day === 0 ? 6 : day - 1);
    d.setDate(now.getDate() - diff + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const rec = await getDailyRecord(ds);
    if (rec) weeklyCount += rec.count;
  }
  const weeklyPct = Math.min(100, weeklyCount / weeklyTarget * 100);
  
  // Daily ring
  updateRing('daily-ring-progress', dailyPct, 55);
  document.getElementById('daily-ring-value').textContent = formatNum(dailyCount);
  document.getElementById('daily-ring-sublabel').textContent = `/ ${formatNum(dailyTarget)}`;
  
  // Weekly ring
  updateRing('weekly-ring-progress', weeklyPct, 55);
  document.getElementById('weekly-ring-value').textContent = formatNum(weeklyCount);
  document.getElementById('weekly-ring-sublabel').textContent = `/ ${formatNum(weeklyTarget)}`;
}

function updateRing(id, pct, radius) {
  const circle = document.getElementById(id);
  if (!circle) return;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  circle.style.strokeDasharray = circ;
  circle.style.strokeDashoffset = Math.max(0, offset);
}

async function renderLineChart() {
  const canvas = document.getElementById('line-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);
  
  const W = rect.width;
  const H = 200;
  const padding = { top: 20, right: 16, bottom: 30, left: 40 };
  
  // Get last 30 days data
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const rec = await getDailyRecord(ds);
    data.push({ date: d, count: rec ? rec.count : 0 });
  }
  
  const maxVal = Math.max(100, ...data.map(d => d.count));
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  
  ctx.clearRect(0, 0, W, H);
  
  // Grid lines
  ctx.strokeStyle = 'rgba(249,115,22,0.1)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    
    ctx.fillStyle = '#8b6b4e';
    ctx.font = '9px Inter';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal/4)*i), padding.left - 6, y + 3);
  }
  
  // Line
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + (i / 29) * chartW;
    const y = padding.top + chartH - (d.count / maxVal) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // Gradient fill
  const gradient = ctx.createLinearGradient(0, padding.top, 0, H - padding.bottom);
  gradient.addColorStop(0, 'rgba(249,115,22,0.3)');
  gradient.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.lineTo(padding.left + chartW, H - padding.bottom);
  ctx.lineTo(padding.left, H - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Dots
  data.forEach((d, i) => {
    if (i % 5 === 0 || i === 29) {
      const x = padding.left + (i / 29) * chartW;
      const y = padding.top + chartH - (d.count / maxVal) * chartH;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI*2);
      ctx.fill();
      
      // Date label
      ctx.fillStyle = '#8b6b4e';
      ctx.font = '8px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(`${d.date.getDate()}/${d.date.getMonth()+1}`, x, H - padding.bottom + 14);
    }
  });
  
  // Target line
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  const targetY = padding.top + chartH - (dailyTarget / maxVal) * chartH;
  ctx.strokeStyle = 'rgba(34,197,94,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, targetY);
  ctx.lineTo(W - padding.right, targetY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(34,197,94,0.7)';
  ctx.font = '8px Inter';
  ctx.textAlign = 'left';
  ctx.fillText('Target', padding.left + 2, targetY - 4);
}

async function renderHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  
  const year = heatmapMonth.getFullYear();
  const month = heatmapMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const today = new Date();
  
  document.getElementById('heatmap-month-label').textContent = 
    firstDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  
  // Day labels
  const dayLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  dayLabels.forEach(l => {
    const el = document.createElement('div');
    el.className = 'heatmap-day-label';
    el.textContent = l;
    grid.appendChild(el);
  });
  
  // Empty cells for first week offset
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1; // Monday-based
  for (let i = 0; i < startDow; i++) {
    const el = document.createElement('div');
    el.className = 'heatmap-cell empty';
    grid.appendChild(el);
  }
  
  // Day cells
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const cellDate = new Date(year, month, d);
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    
    if (cellDate > today) {
      el.className = 'heatmap-cell future';
    } else {
      const rec = await getDailyRecord(ds);
      const count = rec ? rec.count : 0;
      if (count >= dailyTarget) el.className = 'heatmap-cell green';
      else if (count >= 108) el.className = 'heatmap-cell yellow';
      else if (count > 0) el.className = 'heatmap-cell yellow';
      else el.className = 'heatmap-cell red';
    }
    
    const dateLabel = document.createElement('span');
    dateLabel.className = 'heatmap-cell-date';
    dateLabel.textContent = d;
    el.appendChild(dateLabel);
    grid.appendChild(el);
  }
}

function prevMonth() {
  heatmapMonth.setMonth(heatmapMonth.getMonth() - 1);
  renderHeatmap();
  renderMonthlySummary();
}

function nextMonth() {
  heatmapMonth.setMonth(heatmapMonth.getMonth() + 1);
  renderHeatmap();
  renderMonthlySummary();
}

async function renderMonthlySummary() {
  const year = heatmapMonth.getFullYear();
  const month = heatmapMonth.getMonth();
  const ms = `${year}-${String(month+1).padStart(2,'0')}`;
  const records = await getRecordsForMonth(ms);
  const settings = getSettings();
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const maxDay = (year === today.getFullYear() && month === today.getMonth()) ? today.getDate() : lastDay;
  
  let total = 0, best = 0, missed = 0;
  const counts = {};
  records.forEach(r => { counts[r.date] = r.count; total += r.count; best = Math.max(best, r.count); });
  
  for (let d = 1; d <= maxDay; d++) {
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (!counts[ds] || counts[ds] < dailyTarget) missed++;
  }
  
  const avg = maxDay > 0 ? Math.round(total / maxDay) : 0;
  
  document.getElementById('monthly-total').textContent = formatNum(total);
  document.getElementById('monthly-avg').textContent = formatNum(avg);
  document.getElementById('monthly-best').textContent = formatNum(best);
  document.getElementById('monthly-missed').textContent = missed;
}

// ===== Journal Screen =====
async function refreshJournal() {
  const settings = getSettings();
  const name = settings ? settings.name : 'Devotee';
  const dailyTarget = settings ? (settings.dailyTarget || DEFAULT_DAILY) : DEFAULT_DAILY;
  
  const today = todayStr();
  todayRecord = await getDailyRecord(today);
  const todayCount = todayRecord ? todayRecord.count : 0;
  
  const promptEl = document.getElementById('journal-prompt');
  if (todayCount >= dailyTarget) {
    const existing = await getJournalEntry(today);
    if (existing) {
      document.getElementById('journal-prompt-text').textContent = `Today's entry saved ✅`;
      document.getElementById('journal-input').value = existing.text;
    } else {
      document.getElementById('journal-prompt-text').textContent = `How was today's jap, ${name}? 🙏`;
    }
    promptEl.style.display = 'block';
  } else {
    document.getElementById('journal-prompt-text').textContent = `Complete ${formatNum(dailyTarget)} jap to unlock journal for today`;
    promptEl.style.display = 'block';
  }
  
  // Render history
  const entries = await getAllJournalEntries();
  entries.sort((a, b) => b.date.localeCompare(a.date));
  
  const container = document.getElementById('journal-history');
  container.innerHTML = '';
  
  entries.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'journal-entry';
    div.innerHTML = `
      <div class="journal-entry-date">${formatDate(parseDate(entry.date))}</div>
      <div class="journal-entry-count">${formatNum(entry.japCount || 0)} jap</div>
      <div class="journal-entry-text">${escapeHtml(entry.text)}</div>
    `;
    container.appendChild(div);
  });
  
  document.getElementById('share-float').style.display = 'none';
}

async function saveJournal() {
  const text = document.getElementById('journal-input').value.trim();
  if (!text) return;
  
  const today = todayStr();
  const rec = await getDailyRecord(today);
  
  await saveJournalEntry({
    date: today,
    text: text,
    japCount: rec ? rec.count : 0,
    timestamp: Date.now()
  });
  
  document.getElementById('journal-prompt-text').textContent = 'Entry saved ✅';
  refreshJournal();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Settings Screen =====
function refreshSettings() {
  const settings = getSettings();
  if (!settings) return;
  
  document.getElementById('set-name').value = settings.name || '';
  document.getElementById('set-start-date').value = settings.startDate || '';
  document.getElementById('set-morning-time').value = settings.morningTime || '06:00';
  document.getElementById('set-afternoon-time').value = settings.afternoonTime || '14:00';
  document.getElementById('set-daily-target').value = settings.dailyTarget || DEFAULT_DAILY;
  document.getElementById('set-weekly-target').value = settings.weeklyTarget || DEFAULT_WEEKLY;
  
  // Notification status
  const notifEl = document.getElementById('notif-status');
  if (notifEl) {
    if (!('Notification' in window)) {
      notifEl.textContent = '❌ Not supported';
      notifEl.style.color = 'var(--red-light)';
    } else if (Notification.permission === 'granted') {
      notifEl.textContent = '✅ Enabled';
      notifEl.style.color = 'var(--green-light)';
    } else if (Notification.permission === 'denied') {
      notifEl.textContent = '🚫 Blocked';
      notifEl.style.color = 'var(--red-light)';
    } else {
      notifEl.textContent = '⚠️ Not Requested';
      notifEl.style.color = 'var(--yellow-warn)';
    }
  }
  
  // Stats
  refreshStatistics();
  document.getElementById('share-float').style.display = 'none';
}

async function refreshStatistics() {
  const total = getTotalJap();
  const streak = getStreakData();
  const settings = getSettings();
  const milestones = getMilestones();
  const records = await getAllDailyRecords();
  
  let bestDay = 0;
  records.forEach(r => bestDay = Math.max(bestDay, r.count));
  
  const daysWithData = records.filter(r => r.count > 0).length;
  const avg = daysWithData > 0 ? Math.round(total / daysWithData) : 0;
  const totalMalas = Math.floor(total / 108);
  
  // Projected finish
  const startDate = settings ? parseDate(settings.startDate) : new Date();
  const daysElapsed = Math.max(1, daysBetween(startDate, new Date()) + 1);
  const dailyAvg = total / daysElapsed;
  let projectedDate = '—';
  if (dailyAvg > 0) {
    const remaining = TOTAL_TARGET - total;
    const daysNeeded = Math.ceil(remaining / dailyAvg);
    projectedDate = formatDate(new Date(Date.now() + daysNeeded * 86400000));
  }
  
  document.getElementById('stats-total').textContent = formatNum(total);
  document.getElementById('stats-streak').textContent = streak.current;
  document.getElementById('stats-best-streak').textContent = streak.best;
  document.getElementById('stats-best-day').textContent = formatNum(bestDay);
  document.getElementById('stats-avg').textContent = formatNum(avg);
  document.getElementById('stats-malas').textContent = formatNum(totalMalas);
  document.getElementById('stats-projected').textContent = projectedDate;
  document.getElementById('stats-milestones').textContent = milestones.length + '/' + MILESTONE_THRESHOLDS.length;
}

function saveSettingsForm() {
  const settings = getSettings() || {};
  settings.name = document.getElementById('set-name').value.trim() || settings.name;
  settings.startDate = document.getElementById('set-start-date').value || settings.startDate;
  settings.morningTime = document.getElementById('set-morning-time').value || settings.morningTime;
  settings.afternoonTime = document.getElementById('set-afternoon-time').value || settings.afternoonTime;
  settings.dailyTarget = parseInt(document.getElementById('set-daily-target').value) || DEFAULT_DAILY;
  settings.weeklyTarget = parseInt(document.getElementById('set-weekly-target').value) || DEFAULT_WEEKLY;
  saveSettings(settings);
  alert('Settings saved ✅');
  scheduleNotifications();
}

async function resetAllData() {
  document.getElementById('reset-modal').classList.remove('hidden');
}

async function confirmReset() {
  await clearAllData();
  document.getElementById('reset-modal').classList.add('hidden');
  location.reload();
}

function cancelReset() {
  document.getElementById('reset-modal').classList.add('hidden');
}

// ===== Export / Import =====
async function exportData() {
  try {
    showToast('📦 Preparing backup...', 'info');
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `swami_samarth_backup_${todayStr()}.json`;
    
    // Try Web Share API with file (mobile-friendly)
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'application/json' });
      const shareData = { files: [file], title: 'Swami Samarth Jap Backup' };
      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          showToast(`✅ Backup shared! ${data.meta.totalRecords} days, ${formatNum(data.totalJap)} jap`, 'success');
          return;
        } catch (shareErr) {
          // User cancelled share, fall through to download
          if (shareErr.name === 'AbortError') return;
        }
      }
    }
    
    // Fallback: Direct download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Delay revoke to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
    showToast(`✅ Backup downloaded! ${data.meta.totalRecords} days, ${formatNum(data.totalJap)} jap (${sizeMB} MB)`, 'success');
  } catch (err) {
    showToast('❌ Export failed: ' + err.message, 'error');
  }
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  // iOS Safari needs this to be in DOM
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    document.body.removeChild(input);
    if (!file) return;
    
    // Validate file
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      showToast('❌ Please select a .json backup file', 'error');
      return;
    }
    
    showToast('📥 Reading backup file...', 'info');
    
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        showToast('❌ Invalid JSON file — corrupted backup', 'error');
        return;
      }
      
      // Validate it's a Swami Samarth backup
      if (!data.settings && !data.dailyRecords && !data.version) {
        showToast('❌ This doesn\'t look like a Swami Samarth backup file', 'error');
        return;
      }
      
      showToast('⏳ Importing data...', 'info');
      
      const result = await importAllData(data);
      
      // Verify data integrity
      const integrity = await verifyDataIntegrity();
      
      if (result.success) {
        showToast(
          `✅ Import complete!\n📅 ${result.recordsImported} days restored\n📝 ${result.journalImported} journal entries\n🔢 ${formatNum(result.totalJap)} total jap`,
          'success',
          5000
        );
        // Reload after a short delay so the user sees the toast
        setTimeout(() => location.reload(), 2000);
      }
    } catch (err) {
      showToast('❌ Import failed: ' + err.message, 'error');
    }
  };
  
  // Trigger file picker
  input.click();
}

// ===== Trophy Screen =====
function showTrophies() {
  const milestones = getMilestones();
  const container = document.getElementById('trophy-grid');
  container.innerHTML = '';
  
  MILESTONE_THRESHOLDS.forEach(threshold => {
    const msg = MILESTONE_MESSAGES[threshold];
    const earned = milestones.includes(threshold);
    const card = document.createElement('div');
    card.className = `trophy-card ${earned ? 'earned' : 'locked'}`;
    card.innerHTML = `
      <div class="trophy-emoji">${msg.badge}</div>
      <div class="trophy-name">${msg.title}</div>
      <div class="trophy-target">${formatNum(threshold)} jap</div>
    `;
    container.appendChild(card);
  });
  
  // Show trophy screen
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-trophy').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

// ===== Share Feature =====
async function generateShareImage() {
  const settings = getSettings();
  if (!settings) return;
  
  const total = getTotalJap();
  const streak = getStreakData();
  const today = todayStr();
  const rec = await getDailyRecord(today);
  const todayCount = rec ? rec.count : 0;
  const pct = (total / TOTAL_TARGET * 100).toFixed(1);
  
  // Weekly count
  const now = new Date();
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  let weeklyCount = 0;
  for (let i = 0; i <= dow; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - dow + i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const r = await getDailyRecord(ds);
    if (r) weeklyCount += r.count;
  }
  
  const quote = SWAMI_QUOTES[Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000) % SWAMI_QUOTES.length];
  
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
  bgGrad.addColorStop(0, '#1a0a00');
  bgGrad.addColorStop(0.5, '#0f0705');
  bgGrad.addColorStop(1, '#1a0a00');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1920);
  
  // Decorative circle
  ctx.beginPath();
  ctx.arc(540, 400, 200, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(249,115,22,0.08)';
  ctx.fill();
  
  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffb347';
  ctx.font = 'bold 48px Inter';
  ctx.fillText('🙏 Swami Samarth Jap Tracker', 540, 300);
  
  // Om symbol
  ctx.font = '120px serif';
  ctx.fillStyle = 'rgba(249,115,22,0.3)';
  ctx.fillText('ॐ', 540, 480);
  
  // Today's count
  ctx.font = 'bold 140px Inter';
  ctx.fillStyle = '#ffb347';
  ctx.fillText(formatNum(todayCount), 540, 700);
  ctx.font = '32px Inter';
  ctx.fillStyle = '#d4a574';
  ctx.fillText("Today's Jap", 540, 750);
  
  // Stats
  const statsY = 900;
  ctx.font = 'bold 36px Inter';
  ctx.fillStyle = '#fef3e2';
  
  ctx.fillText(`Weekly: ${formatNum(weeklyCount)}`, 540, statsY);
  ctx.fillText(`Streak: ${streak.current} days 🔥`, 540, statsY + 60);
  ctx.fillText(`Total: ${formatNum(total)} / ${formatNum(TOTAL_TARGET)}`, 540, statsY + 120);
  ctx.fillText(`${pct}% Complete`, 540, statsY + 180);
  
  // Progress bar
  const barX = 140, barY = statsY + 220, barW = 800, barH = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 10);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * (total/TOTAL_TARGET), barH, 10);
  ctx.fill();
  
  // Quote
  ctx.font = '28px serif';
  ctx.fillStyle = '#fde047';
  wrapText(ctx, `"${quote.en}"`, 540, statsY + 340, 900, 38);
  
  // Footer
  ctx.font = '24px Inter';
  ctx.fillStyle = '#8b6b4e';
  ctx.fillText('श्री स्वामी समर्थ 🙏', 540, 1780);
  
  // Download
  canvas.toBlob(blob => {
    if (navigator.share && blob) {
      const file = new File([blob], 'swami_samarth_progress.png', { type: 'image/png' });
      navigator.share({
        title: 'Swami Samarth Jap Progress',
        text: `Today: ${formatNum(todayCount)} jap | Streak: ${streak.current} days | Total: ${formatNum(total)}/${formatNum(TOTAL_TARGET)}`,
        files: [file]
      }).catch(() => {
        downloadBlob(blob);
      });
    } else if (blob) {
      downloadBlob(blob);
    }
  }, 'image/png');
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'swami_samarth_progress.png';
  a.click();
  URL.revokeObjectURL(url);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// ===== Notifications =====
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const settings = getSettings();
  if (!settings) return;
  
  // Store notification settings for SW to read
  localStorage.setItem('swamiNotifSettings', JSON.stringify({
    name: settings.name,
    morningTime: settings.morningTime,
    afternoonTime: settings.afternoonTime,
    dailyTarget: settings.dailyTarget || DEFAULT_DAILY
  }));
  
  // Set up periodic check using setInterval (for when app is open)
  startNotificationChecker();
}

let notifCheckInterval = null;

function startNotificationChecker() {
  if (notifCheckInterval) clearInterval(notifCheckInterval);
  
  // Check every minute
  notifCheckInterval = setInterval(checkAndSendNotifications, 60000);
  // Also check immediately
  checkAndSendNotifications();
}

async function checkAndSendNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  const settings = getSettings();
  if (!settings) return;
  
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const today = todayStr();
  const todayRec = await getDailyRecord(today);
  const todayCount = todayRec ? todayRec.count : 0;
  const dailyTarget = settings.dailyTarget || DEFAULT_DAILY;
  
  const lastNotifKey = `lastNotif_${today}`;
  const lastNotifs = JSON.parse(localStorage.getItem(lastNotifKey) || '{}');
  
  // Quote of the day
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  const quote = SWAMI_QUOTES[dayOfYear % SWAMI_QUOTES.length];
  
  // Morning notification
  if (currentTime === settings.morningTime && !lastNotifs.morning) {
    showLocalNotification(
      `🙏 ${quote.en}`,
      `Start your jap — Swami is waiting, ${settings.name}.`
    );
    lastNotifs.morning = true;
    localStorage.setItem(lastNotifKey, JSON.stringify(lastNotifs));
  }
  
  // Afternoon reminder
  if (currentTime === settings.afternoonTime && todayCount < 300 && !lastNotifs.afternoon) {
    showLocalNotification(
      `⏰ Afternoon Reminder`,
      `You have only ${formatNum(todayCount)} jap today. Keep going, ${settings.name}!`
    );
    lastNotifs.afternoon = true;
    localStorage.setItem(lastNotifKey, JSON.stringify(lastNotifs));
  }
  
  // 9 PM urgent reminder
  if (currentTime === '21:00' && todayCount < dailyTarget && !lastNotifs.evening) {
    showLocalNotification(
      `🚨 Daily Target Incomplete`,
      `You need ${formatNum(dailyTarget - todayCount)} more jap, ${settings.name}. Don't miss today!`
    );
    lastNotifs.evening = true;
    localStorage.setItem(lastNotifKey, JSON.stringify(lastNotifs));
  }
  
  // 3 day missed streak
  const streak = getStreakData();
  if (streak.lastDate) {
    const lastDate = parseDate(streak.lastDate);
    const daysMissed = daysBetween(lastDate, now);
    if (daysMissed >= 3 && !lastNotifs.comeback) {
      showLocalNotification(
        `🙏 Come Back`,
        `Swami Samarth says — come back, do not stop, ${settings.name}.`
      );
      lastNotifs.comeback = true;
      localStorage.setItem(lastNotifKey, JSON.stringify(lastNotifs));
    }
  }
  
  // Sunday morning weekly summary
  if (now.getDay() === 0 && currentTime === settings.morningTime && !lastNotifs.sunday) {
    const weekTotal = await getWeeklyTotal();
    showLocalNotification(
      `📊 Weekly Summary`,
      `Last week: ${formatNum(weekTotal)} jap. This week's target: ${formatNum(settings.weeklyTarget || DEFAULT_WEEKLY)}. Keep it up, ${settings.name}!`
    );
    lastNotifs.sunday = true;
    localStorage.setItem(lastNotifKey, JSON.stringify(lastNotifs));
  }
}

async function getWeeklyTotal() {
  const now = new Date();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const rec = await getDailyRecord(ds);
    if (rec) total += rec.count;
  }
  return total;
}

function showLocalNotification(title, body) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body: body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        vibrate: [200, 100, 200],
        tag: 'swami-jap-notif',
        renotify: true
      });
    });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body, icon: 'icon-192.png' });
  }
}

// ===== PWA Install =====
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-banner').classList.remove('hidden');
});

function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
      document.getElementById('install-banner').classList.add('hidden');
    });
  }
}

function dismissInstall() {
  document.getElementById('install-banner').classList.add('hidden');
}

// ===== Service Worker Registration =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('SW registered:', reg.scope);
    }).catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

// ===== Midnight Reset Watcher =====
let lastCheckedDate = todayStr();
setInterval(() => {
  const now = todayStr();
  if (now !== lastCheckedDate) {
    lastCheckedDate = now;
    // New day — refresh
    if (currentScreen === 'home') refreshHome();
    else if (currentScreen === 'counter') refreshCounter();
  }
}, 30000);

// ===== Tap-to-Count Zone =====
let tapModeEnabled = true; // true = tapping screen counts +1

function setupTapZone() {
  const tapZone = document.getElementById('tap-zone');
  if (!tapZone) return;
  
  tapZone.addEventListener('click', (e) => {
    if (!tapModeEnabled) return;
    
    // Get tap position relative to the tap zone
    const rect = tapZone.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Add +1 jap
    addJap(1);
    
    // Show floating +1 at tap position
    showTapFloat(x, y);
    
    // Show pulse at tap position
    showTapPulse(x, y);
    
    // Haptic feedback (if supported)
    if (navigator.vibrate) navigator.vibrate(15);
  });
}

function showTapFloat(x, y) {
  const container = document.getElementById('tap-float-container');
  if (!container) return;
  
  const el = document.createElement('div');
  el.className = 'tap-float-text';
  el.textContent = '+1';
  el.style.left = (x - 20) + 'px';
  el.style.top = (y - 20) + 'px';
  container.appendChild(el);
  
  // Remove after animation completes
  setTimeout(() => el.remove(), 800);
}

function showTapPulse(x, y) {
  const pulse = document.getElementById('tap-pulse');
  if (!pulse) return;
  
  // Reset animation
  pulse.classList.remove('active');
  pulse.style.left = x + 'px';
  pulse.style.top = y + 'px';
  
  // Trigger reflow to restart animation
  void pulse.offsetWidth;
  pulse.classList.add('active');
}

function toggleTapMode() {
  tapModeEnabled = !tapModeEnabled;
  const tapZone = document.getElementById('tap-zone');
  const icon = document.getElementById('tap-toggle-icon');
  const hint = document.getElementById('tap-mode-hint');
  
  if (tapModeEnabled) {
    tapZone.classList.remove('locked');
    icon.textContent = '🔓';
    hint.textContent = '👆 Tap anywhere to count +1';
  } else {
    tapZone.classList.add('locked');
    icon.textContent = '🔒';
    hint.textContent = '🔒 Tap counting locked';
  }
}

// ===== Toast Notification System =====
let toastTimeout = null;

function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();
  if (toastTimeout) clearTimeout(toastTimeout);
  
  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.className = `app-toast toast-${type}`;
  toast.innerHTML = message.replace(/\n/g, '<br>');
  document.body.appendChild(toast);
  
  // Trigger entrance animation
  requestAnimationFrame(() => toast.classList.add('show'));
  
  // Auto-dismiss
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  
  // Tap to dismiss
  toast.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });
}

// ===== Test Notification =====
async function testNotification() {
  if (!('Notification' in window)) {
    showToast('❌ Notifications not supported in this browser', 'error');
    return;
  }
  
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('❌ Notification permission denied', 'error');
      return;
    }
  }
  
  if (Notification.permission !== 'granted') {
    showToast('❌ Notifications blocked — enable in browser settings', 'error');
    return;
  }
  
  const settings = getSettings();
  const name = settings ? settings.name : 'Devotee';
  const quote = SWAMI_QUOTES[Math.floor(Math.random() * SWAMI_QUOTES.length)];
  
  showLocalNotification(
    `🙏 ${quote.en}`,
    `This is a test notification, ${name}. Notifications are working! ✅`
  );
  showToast('✅ Test notification sent!', 'success');
}

// ===== Animated Number Counter =====
function animateNumber(el, from, to, duration = 500) {
  const start = performance.now();
  const diff = to - from;
  
  function frame(time) {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + diff * eased);
    el.textContent = formatNum(current);
    if (progress < 1) requestAnimationFrame(frame);
  }
  
  requestAnimationFrame(frame);
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', initApp);

