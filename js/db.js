// IndexedDB and localStorage data management
// v3 — Dual-write protection: all daily records backed up to localStorage
//       to prevent loss from Chrome storage eviction

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

// ===== Request Persistent Storage =====
// Prevents Chrome from evicting IndexedDB data
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    console.log('[Storage] Persistent storage:', granted ? 'GRANTED ✅' : 'DENIED ❌');
    return granted;
  }
  return false;
}

// ===== localStorage backup key helpers =====
const LS_RECORDS_PREFIX = 'swamiDR_';    // daily records
const LS_JOURNAL_PREFIX = 'swamiJE_';    // journal entries

function backupRecordToLS(record) {
  if (record && record.date) {
    try {
      localStorage.setItem(LS_RECORDS_PREFIX + record.date, JSON.stringify(record));
    } catch (e) {
      console.warn('[Backup] localStorage full, could not backup record', e);
    }
  }
}

function backupJournalToLS(entry) {
  if (entry && entry.date) {
    try {
      localStorage.setItem(LS_JOURNAL_PREFIX + entry.date, JSON.stringify(entry));
    } catch (e) {
      console.warn('[Backup] localStorage full, could not backup journal', e);
    }
  }
}

function getAllRecordsFromLS() {
  const records = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_RECORDS_PREFIX)) {
      try {
        const rec = JSON.parse(localStorage.getItem(key));
        if (rec && rec.date) records.push(rec);
      } catch (e) { /* skip corrupt entries */ }
    }
  }
  return records.sort((a, b) => a.date.localeCompare(b.date));
}

function getAllJournalFromLS() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_JOURNAL_PREFIX)) {
      try {
        const entry = JSON.parse(localStorage.getItem(key));
        if (entry && entry.date) entries.push(entry);
      } catch (e) { /* skip corrupt entries */ }
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

// ===== Daily Records (Dual-write: IndexedDB + localStorage) =====
async function getDailyRecord(dateStr) {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('dailyRecords', 'readonly');
      const store = tx.objectStore('dailyRecords');
      const req = store.get(dateStr);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch (e) {
    console.warn('[DB] IndexedDB read failed, trying localStorage fallback', e);
  }
  
  // Fallback: try localStorage
  const lsKey = LS_RECORDS_PREFIX + dateStr;
  const lsData = localStorage.getItem(lsKey);
  if (lsData) {
    try {
      return JSON.parse(lsData);
    } catch (e) { /* corrupt data */ }
  }
  return null;
}

async function saveDailyRecord(record) {
  // Always backup to localStorage first (most reliable on mobile)
  backupRecordToLS(record);
  
  // Then write to IndexedDB
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('dailyRecords', 'readwrite');
      const store = tx.objectStore('dailyRecords');
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[DB] IndexedDB write failed, data saved to localStorage only', e);
  }
}

async function getAllDailyRecords() {
  let idbRecords = [];
  try {
    const db = await openDB();
    idbRecords = await new Promise((resolve, reject) => {
      const tx = db.transaction('dailyRecords', 'readonly');
      const store = tx.objectStore('dailyRecords');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[DB] IndexedDB getAll failed', e);
  }
  
  // Get localStorage records
  const lsRecords = getAllRecordsFromLS();
  
  // Merge: use the record with the higher count for each date
  const merged = new Map();
  for (const rec of idbRecords) {
    merged.set(rec.date, rec);
  }
  for (const rec of lsRecords) {
    const existing = merged.get(rec.date);
    if (!existing || rec.count > existing.count) {
      merged.set(rec.date, rec);
    }
  }
  
  // If IndexedDB was empty but localStorage had data, restore to IndexedDB
  if (idbRecords.length === 0 && lsRecords.length > 0) {
    console.log(`[Recovery] Restoring ${lsRecords.length} records from localStorage to IndexedDB`);
    try {
      const db = await openDB();
      const tx = db.transaction('dailyRecords', 'readwrite');
      const store = tx.objectStore('dailyRecords');
      for (const rec of lsRecords) {
        store.put(rec);
      }
      await new Promise((resolve) => { tx.oncomplete = resolve; });
      console.log('[Recovery] IndexedDB restoration complete ✅');
    } catch (e) {
      console.warn('[Recovery] Could not restore to IndexedDB', e);
    }
  }
  
  const result = Array.from(merged.values());
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

async function getRecordsForMonth(monthStr) {
  const all = await getAllDailyRecords();
  return all.filter(r => r.month === monthStr);
}

// ===== Journal (Dual-write: IndexedDB + localStorage) =====
async function saveJournalEntry(entry) {
  // Always backup to localStorage first
  backupJournalToLS(entry);
  
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('journal', 'readwrite');
      const store = tx.objectStore('journal');
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[DB] Journal IndexedDB write failed, saved to localStorage only', e);
  }
}

async function getJournalEntry(dateStr) {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction('journal', 'readonly');
      const store = tx.objectStore('journal');
      const req = store.get(dateStr);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (result) return result;
  } catch (e) {
    console.warn('[DB] Journal IndexedDB read failed', e);
  }
  
  // Fallback to localStorage
  const lsKey = LS_JOURNAL_PREFIX + dateStr;
  const lsData = localStorage.getItem(lsKey);
  if (lsData) {
    try { return JSON.parse(lsData); } catch (e) { /* skip */ }
  }
  return null;
}

async function getAllJournalEntries() {
  let idbEntries = [];
  try {
    const db = await openDB();
    idbEntries = await new Promise((resolve, reject) => {
      const tx = db.transaction('journal', 'readonly');
      const store = tx.objectStore('journal');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[DB] Journal IndexedDB getAll failed', e);
  }
  
  // Get localStorage journal entries
  const lsEntries = getAllJournalFromLS();
  
  // Merge: prefer entry with more content
  const merged = new Map();
  for (const entry of idbEntries) {
    merged.set(entry.date, entry);
  }
  for (const entry of lsEntries) {
    if (!merged.has(entry.date)) {
      merged.set(entry.date, entry);
    }
  }
  
  // Restore to IndexedDB if it was empty
  if (idbEntries.length === 0 && lsEntries.length > 0) {
    console.log(`[Recovery] Restoring ${lsEntries.length} journal entries from localStorage to IndexedDB`);
    try {
      const db = await openDB();
      const tx = db.transaction('journal', 'readwrite');
      const store = tx.objectStore('journal');
      for (const entry of lsEntries) {
        store.put(entry);
      }
      await new Promise((resolve) => { tx.oncomplete = resolve; });
    } catch (e) {
      console.warn('[Recovery] Could not restore journal to IndexedDB', e);
    }
  }
  
  const result = Array.from(merged.values());
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

// Undo Stack (per day)
async function pushUndo(entry) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('undoStack', 'readwrite');
      const store = tx.objectStore('undoStack');
      store.add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[DB] Undo push failed', e);
  }
}

async function popUndo(dateStr) {
  try {
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
  } catch (e) {
    console.warn('[DB] Undo pop failed', e);
    return null;
  }
}

async function clearUndoForDate(dateStr) {
  try {
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
  } catch (e) {
    console.warn('[DB] Undo clear failed', e);
  }
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
    version: 3,
    appName: 'Swami Samarth Jap Tracker',
    exportDate: new Date().toISOString(),
    exportTimestamp: Date.now(),
    // Core data
    settings: getSettings(),
    milestones: getMilestones(),
    totalJap: getTotalJap(),
    streakData: getStreakData(),
    // All records (merged from IndexedDB + localStorage)
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
  
  // Restore daily records (dual-write to both IndexedDB AND localStorage)
  let recordsImported = 0;
  if (data.dailyRecords && Array.isArray(data.dailyRecords)) {
    for (const rec of data.dailyRecords) {
      if (rec && rec.date) {
        // Ensure month field exists
        if (!rec.month) {
          const parts = rec.date.split('-');
          rec.month = parts[0] + '-' + parts[1];
        }
        await saveDailyRecord(rec); // This now does dual-write
        recordsImported++;
      }
    }
  }
  
  // Restore journal entries (dual-write)
  let journalImported = 0;
  if (data.journalEntries && Array.isArray(data.journalEntries)) {
    for (const entry of data.journalEntries) {
      if (entry && entry.date) {
        await saveJournalEntry(entry); // This now does dual-write
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
  // Clear all swami-related localStorage (including backup keys)
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('swami') ||
      key.startsWith(LS_RECORDS_PREFIX) ||
      key.startsWith(LS_JOURNAL_PREFIX) ||
      key.startsWith('lastNotif_') ||
      key.startsWith('anniversaryShown_')
    )) {
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
