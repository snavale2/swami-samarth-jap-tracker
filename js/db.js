// IndexedDB and localStorage data management

const DB_NAME = 'SwamiSamarthJapDB';
const DB_VERSION = 1;

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('dailyRecords')) {
        const store = database.createObjectStore('dailyRecords', { keyPath: 'date' });
        store.createIndex('month', 'month', { unique: false });
      }
      if (!database.objectStoreNames.contains('journal')) {
        database.createObjectStore('journal', { keyPath: 'date' });
      }
      if (!database.objectStoreNames.contains('undoStack')) {
        database.createObjectStore('undoStack', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (e) => { db = e.target.result; resolve(db); };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Daily Records
async function getDailyRecord(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dailyRecords', 'readonly');
    const store = tx.objectStore('dailyRecords');
    const req = store.get(dateStr);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveDailyRecord(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dailyRecords', 'readwrite');
    const store = tx.objectStore('dailyRecords');
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllDailyRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dailyRecords', 'readonly');
    const store = tx.objectStore('dailyRecords');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getRecordsForMonth(monthStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dailyRecords', 'readonly');
    const store = tx.objectStore('dailyRecords');
    const index = store.index('month');
    const req = index.getAll(monthStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Journal
async function saveJournalEntry(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('journal', 'readwrite');
    const store = tx.objectStore('journal');
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getJournalEntry(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('journal', 'readonly');
    const store = tx.objectStore('journal');
    const req = store.get(dateStr);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getAllJournalEntries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('journal', 'readonly');
    const store = tx.objectStore('journal');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Undo Stack (per day)
async function pushUndo(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('undoStack', 'readwrite');
    const store = tx.objectStore('undoStack');
    store.add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function popUndo(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('undoStack', 'readwrite');
    const store = tx.objectStore('undoStack');
    const req = store.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && cursor.value.date === dateStr) {
        const val = cursor.value;
        cursor.delete();
        resolve(val);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearUndoForDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('undoStack', 'readwrite');
    const store = tx.objectStore('undoStack');
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (cursor.value.date === dateStr) cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// Settings in localStorage
function getSettings() {
  const s = localStorage.getItem('swamiSettings');
  return s ? JSON.parse(s) : null;
}

function saveSettings(settings) {
  localStorage.setItem('swamiSettings', JSON.stringify(settings));
}

function getMilestones() {
  const m = localStorage.getItem('swamiMilestones');
  return m ? JSON.parse(m) : [];
}

function saveMilestones(milestones) {
  localStorage.setItem('swamiMilestones', JSON.stringify(milestones));
}

function getTotalJap() {
  return parseInt(localStorage.getItem('swamiTotalJap') || '0', 10);
}

function saveTotalJap(total) {
  localStorage.setItem('swamiTotalJap', total.toString());
}

function getStreakData() {
  const s = localStorage.getItem('swamiStreak');
  return s ? JSON.parse(s) : { current: 0, best: 0, lastDate: null };
}

function saveStreakData(data) {
  localStorage.setItem('swamiStreak', JSON.stringify(data));
}

// ===== ROBUST Export — collects EVERYTHING =====
async function exportAllData() {
  const records = await getAllDailyRecords();
  const journal = await getAllJournalEntries();
  
  // Collect all localStorage keys used by this app
  const allLocalStorageKeys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('swami')) {
      allLocalStorageKeys[key] = localStorage.getItem(key);
    }
    // Also capture notification keys and anniversary keys
    if (key && (key.startsWith('lastNotif_') || key.startsWith('anniversaryShown_'))) {
      allLocalStorageKeys[key] = localStorage.getItem(key);
    }
  }

  const exportPayload = {
    version: 2,
    appName: 'Swami Samarth Jap Tracker',
    exportDate: new Date().toISOString(),
    exportTimestamp: Date.now(),
    // Core data
    settings: getSettings(),
    milestones: getMilestones(),
    totalJap: getTotalJap(),
    streakData: getStreakData(),
    // IndexedDB data
    dailyRecords: records,
    journalEntries: journal,
    // Full localStorage backup for safety
    localStorageBackup: allLocalStorageKeys,
    // Metadata for verification
    meta: {
      totalRecords: records.length,
      totalJournalEntries: journal.length,
      totalJapVerified: records.reduce((sum, r) => sum + (r.count || 0), 0)
    }
  };

  return exportPayload;
}

// ===== ROBUST Import — restores EVERYTHING =====
async function importAllData(data) {
  if (!data) throw new Error('No data found in file');
  if (!data.version && !data.settings) throw new Error('Invalid backup file — not a Swami Samarth Jap Tracker backup');
  
  // Validate critical fields
  const errors = [];
  
  // Restore settings
  if (data.settings) {
    saveSettings(data.settings);
  } else {
    errors.push('No settings found in backup');
  }
  
  // Restore milestones
  if (data.milestones) {
    saveMilestones(data.milestones);
  }
  
  // Restore total jap
  if (data.totalJap !== undefined && data.totalJap !== null) {
    saveTotalJap(data.totalJap);
  } else if (data.dailyRecords) {
    // Recalculate from records if totalJap missing
    const calculated = data.dailyRecords.reduce((sum, r) => sum + (r.count || 0), 0);
    saveTotalJap(calculated);
  }
  
  // Restore streak data
  if (data.streakData) {
    saveStreakData(data.streakData);
  }
  
  // Restore localStorage backup (covers notification keys, anniversary keys, etc.)
  if (data.localStorageBackup) {
    for (const [key, value] of Object.entries(data.localStorageBackup)) {
      localStorage.setItem(key, value);
    }
  }
  
  // Restore daily records
  let recordsImported = 0;
  if (data.dailyRecords && Array.isArray(data.dailyRecords)) {
    for (const rec of data.dailyRecords) {
      if (rec && rec.date) {
        // Ensure month field exists
        if (!rec.month) {
          const parts = rec.date.split('-');
          rec.month = parts[0] + '-' + parts[1];
        }
        await saveDailyRecord(rec);
        recordsImported++;
      }
    }
  }
  
  // Restore journal entries
  let journalImported = 0;
  if (data.journalEntries && Array.isArray(data.journalEntries)) {
    for (const entry of data.journalEntries) {
      if (entry && entry.date) {
        await saveJournalEntry(entry);
        journalImported++;
      }
    }
  }
  
  return {
    success: true,
    recordsImported,
    journalImported,
    errors,
    totalJap: getTotalJap()
  };
}

// ===== Verify data integrity after import =====
async function verifyDataIntegrity() {
  const records = await getAllDailyRecords();
  const storedTotal = getTotalJap();
  const calculatedTotal = records.reduce((sum, r) => sum + (r.count || 0), 0);
  
  if (storedTotal !== calculatedTotal) {
    // Auto-fix mismatch
    saveTotalJap(calculatedTotal);
    return { fixed: true, storedTotal, calculatedTotal };
  }
  return { fixed: false, total: storedTotal };
}

// Clear all data
async function clearAllData() {
  // Clear all swami-related localStorage
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('swami') || key.startsWith('lastNotif_') || key.startsWith('anniversaryShown_'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  
  const db = await openDB();
  const tx = db.transaction(['dailyRecords', 'journal', 'undoStack'], 'readwrite');
  tx.objectStore('dailyRecords').clear();
  tx.objectStore('journal').clear();
  tx.objectStore('undoStack').clear();
  return new Promise((resolve) => { tx.oncomplete = resolve; });
}
