/**
 * BACKEND PSP COMPACTION RECORD + ADMIN
 * Version: 3.9 - Allow dispatch OPEN with confirmation (forceSend)
 * Patch: OPEN reports print blank cells as blank (no null/undefined/space)
 * Timezone: Australia/Perth
 */

/* =========================
   CONFIG
========================= */

const TEMPLATE_DOC_ID = "1IX6iae4Szu7lpWuReptIfIbgf62rqS_e5B6ndWHrMGE";
const AUDIT_TEMPLATE_DOC_ID = "PASTE_AUDIT_TEMPLATE_ID_HERE";
const SHEET_NAME = "PSP-Register";
const EMAIL_REPORTE = "federico.ronco@apalliance.com.au , ronco.fe@gmail.com";
const APP_VERSION = "2026-02-27 09:40 Perth - SignOff+DebugFixes";

// Users validation spreadsheet
const USERS_SHEET_ID = "1bcJ6taRMA95YxJZdZ-OHazxKXAopJLvWctx4KtvivvA";
const USERS_SHEET_NAME = "Users";

// Locations
const LOCATION_MAP = {
  "McLennan Dr - SEC3": "1EPP6p3Th7LS5fD3HdbL2THMwRuPQr6jbjYFl7ZcMUzs"
};
const DEFAULT_ID = "1EPP6p3Th7LS5fD3HdbL2THMwRuPQr6jbjYFl7ZcMUzs";

const START_CHAINAGE = 3210;
const CHAINAGE_INCREMENT = 20;
const SIGN_OFF_ROW = 16;
const AUDIT_REPORTS_FOLDER_NAME = "Audit Reports";
const ENABLE_AUTO_PDF = false;

/* =========================
   ROUTING (Index / Admin)
========================= */

function doGet(e) {
  const view = (e && e.parameter && e.parameter.view) ? String(e.parameter.view) : "";
  console.log(`APP_VERSION ${APP_VERSION}`);

  if (view === "admin") {
    return HtmlService.createTemplateFromFile("Admin")
      .evaluate()
      .setTitle("Admin Panel - readX")
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("PSP Site Log")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =========================
   AUTH
========================= */

function loginUser(user, pass) {
  try {
    const rateCheck = checkLoginRateLimit_();
    if (!rateCheck.ok) {
      return { success: false, error: rateCheck.error };
    }

    const ss = SpreadsheetApp.openById(USERS_SHEET_ID);
    const sheet = ss.getSheetByName(USERS_SHEET_NAME);
    if (!sheet) return { success: false, error: "Users sheet not found" };

    const data = sheet.getDataRange().getValues();
    const u = String(user || "").trim();
    const p = String(pass || "").trim();

    for (let i = 1; i < data.length; i++) {
      const rowUser = String(data[i][0] || "").trim();
      const rowPass = String(data[i][1] || "").trim();
      const rowEmail = String(data[i][2] || "").trim();

      if (rowUser === u && rowPass === p) {
        clearLoginRateLimit_();
        return { success: true, email: rowEmail, user: rowUser };
      }
    }

    return { success: false, error: "Invalid credentials" };
  } catch (e) {
    console.error("loginUser error:", e);
    return { success: false, error: "Login failed. Please try again." };
  }
}

function checkLoginRateLimit_() {
  try {
    const cache = CacheService.getUserCache();
    const key = getLoginRateKey_();
    const raw = cache.get(key);
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxAttempts = 6;

    let data = { count: 0, ts: now };
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) { data = { count: 0, ts: now }; }
    }

    if (now - data.ts > windowMs) data = { count: 0, ts: now };
    data.count += 1;

    cache.put(key, JSON.stringify(data), Math.ceil(windowMs / 1000));

    if (data.count > maxAttempts) {
      return { ok: false, error: "Too many login attempts. Please wait a minute." };
    }
    return { ok: true };
  } catch (e) {
    console.warn("Rate limit check failed:", e);
    return { ok: true };
  }
}

function clearLoginRateLimit_() {
  try {
    CacheService.getUserCache().remove(getLoginRateKey_());
  } catch (e) {
    console.warn("Rate limit clear failed:", e);
  }
}

function getLoginRateKey_() {
  const key = Session.getActiveUser().getEmail() || Session.getTemporaryActiveUserKey() || "anon";
  return `login_rate_${key}`;
}

/* =========================
   FIELD APP FUNCTIONS
========================= */

// 1) Get last chainage (per location)
function getLastChainage(location) {
  try {
    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const sheet = getSheetByLocation_(location);
    console.log("[getLastChainage] start", JSON.stringify({ location: location, targetId: targetId }));

    if (!sheet) {
      console.log("[getLastChainage] sheet missing, returning start", START_CHAINAGE);
      return START_CHAINAGE;
    }

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) {
      console.log("[getLastChainage] lastCol<2, returning start", START_CHAINAGE);
      return START_CHAINAGE;
    }

    const row2Values = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];

    let lastRecorded = START_CHAINAGE;
    for (let i = row2Values.length - 1; i >= 0; i--) {
      if (row2Values[i] !== "" && !isNaN(row2Values[i])) {
        lastRecorded = Number(row2Values[i]);
        break;
      }
    }

    const lastAligned = alignDownToIncrement_(lastRecorded, CHAINAGE_INCREMENT);
    let nextCh = lastAligned - CHAINAGE_INCREMENT;
    const existingNumbers = row2Values.map(n => Number(n));
    while (existingNumbers.includes(nextCh) || nextCh % CHAINAGE_INCREMENT !== 0) nextCh -= CHAINAGE_INCREMENT;

    console.log("[getLastChainage] computed", JSON.stringify({ lastCol: lastCol, lastRecorded: lastRecorded, lastAligned: lastAligned, nextCh: nextCh }));
    return nextCh;

  } catch (e) {
    console.error("Error GetLastChainage:", e);
    return START_CHAINAGE;
  }
}

// 2) Duplicate check (per location)
function isChainageDuplicate(location, chainageToCheck) {
  try {
    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const sheet = getSheetByLocation_(location);
    console.log("[isChainageDuplicate] start", JSON.stringify({ location: location, targetId: targetId, chainageToCheck: chainageToCheck }));
    if (!sheet) return false;

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) return false;

    const row2Values = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
    const target = Number(chainageToCheck);
    if (!Number.isFinite(target)) return false;

    const dup = row2Values.some(val => Number(val) === target);
    console.log("[isChainageDuplicate] result", JSON.stringify({ lastCol: lastCol, target: target, duplicate: dup }));
    return dup;
  } catch (e) {
    console.error("isChainageDuplicate error:", e);
    return false;
  }
}

// 3) Save data
function saveData(formData) {
  console.log("APP_VERSION", APP_VERSION);
  const preTargetId = LOCATION_MAP[formData?.location] || DEFAULT_ID;
  console.log("[saveData] input", JSON.stringify({ location: formData?.location, chainage: formData?.chainage, targetId: preTargetId }));

  const validation = validateSaveData_(formData);
  if (!validation.ok) {
    console.warn("[saveData] validation failed", JSON.stringify({ error: validation.error, location: formData?.location, chainage: formData?.chainage, targetId: preTargetId }));
    return { ok: false, error: validation.error };
  }

  const clean = validation.clean;
  const lock = LockService.getDocumentLock();
  try {
    if (!lock.tryLock(15000)) {
      return { ok: false, error: "System busy. Please retry in a moment." };
    }

    const targetId = LOCATION_MAP[clean.location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(targetId);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

    const newCh = clean.chainage;
    const lastCol = sheet.getLastColumn();
    let targetCol = lastCol + 1;
    console.log("[saveData] sheet info", JSON.stringify({ targetId: targetId, lastCol: lastCol }));

    // Keep chainages ordered
    if (lastCol >= 2) {
      const existingChainages = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
      for (let i = 0; i < existingChainages.length; i++) {
        const currentCh = Number(existingChainages[i]);
        if (!isNaN(currentCh)) {
          if (newCh === currentCh) { targetCol = i + 2; break; }
          else if (newCh > currentCh) { targetCol = i + 2; sheet.insertColumnBefore(targetCol); break; }
        }
      }
    }
    console.log("[saveData] targetCol", JSON.stringify({ targetCol: targetCol }));

    const now = new Date();

    const values = [
      [now],
      [newCh],
      [""],
      [clean.l1_150],
      [clean.l1_450],
      [clean.l1_750],
      [""],
      [clean.l2_150],
      [clean.l2_450],
      [clean.l2_750],
      [""],
      [clean.l3_150],
      [clean.l3_450],
      [clean.l3_750],
      [clean.supervisor],
      [""]
    ];

    sheet.getRange(1, targetCol, values.length, 1).setValues(values);
    sheet.getRange(1, targetCol).setNumberFormat("dd/MM/yyyy HH:mm");

    // Optional auto PDF trigger each 10 data columns
    if (ENABLE_AUTO_PDF) {
      try {
        const totalDataCols = sheet.getLastColumn() - 1;
        if (totalDataCols > 0 && totalDataCols % 10 === 0) {
          generateAndSendPDF({ location: clean.location }, now, targetId);
        }
      } catch (e) {
        console.error("PDF Trigger Error:", e);
      }
    }

    return {
      ok: true,
      message: "Lodgement Success!",
      nextCh: newCh - CHAINAGE_INCREMENT
    };

  } catch (e) {
    console.error("saveData error:", e);
    return { ok: false, error: e && e.message ? e.message : "Save failed. Please try again." };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function validateSaveData_(formData) {
  const errors = [];
  const clean = {};

  clean.location = String(formData?.location || "").trim();
  if (!clean.location) errors.push("Location is required");

  clean.supervisor = String(formData?.supervisor || "").trim();
  if (!clean.supervisor) errors.push("Site inspector is required");

  const chainageRaw = formData?.chainage;
  const chainageInfo = parseChainageInt_(chainageRaw, CHAINAGE_INCREMENT);
  if (!chainageInfo.isFinite) {
    errors.push(`Invalid chainage: received '${chainageRaw}', parsed NaN. Must be multiple of ${CHAINAGE_INCREMENT}.`);
  } else if (!chainageInfo.isMultiple) {
    errors.push(`Invalid chainage: received '${chainageRaw}', parsed ${chainageInfo.value}. Must be multiple of ${CHAINAGE_INCREMENT}.`);
  }
  clean.chainage = chainageInfo.value;

  const fields = [
    ["l1_150", "Layer 1 - 150"],
    ["l1_450", "Layer 1 - 450"],
    ["l1_750", "Layer 1 - 750"],
    ["l2_150", "Layer 2 - 150"],
    ["l2_450", "Layer 2 - 450"],
    ["l2_750", "Layer 2 - 750"],
    ["l3_150", "Layer 3 - 150"],
    ["l3_450", "Layer 3 - 450"],
    ["l3_750", "Layer 3 - 750"]
  ];

  fields.forEach(([key, label]) => {
    const raw = formData?.[key];
    const num = Number(raw);
    if (raw === "" || raw === null || raw === undefined) {
      errors.push(`${label} is required`);
    } else if (!Number.isFinite(num)) {
      errors.push(`${label} must be a number`);
    } else if (num < 0 || num > 30) {
      errors.push(`${label} must be between 0 and 30`);
    }
    clean[key] = num;
  });

  if (errors.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, clean: clean };
}

function getSheetByLocation_(location) {
  const targetId = LOCATION_MAP[location] || DEFAULT_ID;
  const ss = SpreadsheetApp.openById(targetId);
  return ss.getSheetByName(SHEET_NAME);
}

function parseChainageInt_(value, increment) {
  const raw = String(value ?? "").trim();
  const num = parseInt(raw, 10);
  if (!Number.isFinite(num)) {
    return { value: num, isFinite: false, isMultiple: false };
  }
  const isMultiple = (num % increment === 0);
  return { value: num, isFinite: true, isMultiple: isMultiple };
}

function alignDownToIncrement_(value, increment) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return Math.floor(num / increment) * increment;
}

/* =========================
   SIGN OFF (Index)
========================= */

function getSignOffStatus(location, chainage) {
  try {
    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const sheet = getSheetByLocation_(location);
    if (!sheet) return { exists: false, signed: false, value: "", col: null };

    const chainageInfo = parseChainageInt_(chainage, CHAINAGE_INCREMENT);
    if (!chainageInfo.isFinite) return { exists: false, signed: false, value: "", col: null };

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) return { exists: false, signed: false, value: "", col: null };

    const row2Values = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
    let targetCol = null;
    for (let i = 0; i < row2Values.length; i++) {
      if (Number(row2Values[i]) === chainageInfo.value) {
        targetCol = i + 2;
        break;
      }
    }
    if (!targetCol) return { exists: false, signed: false, value: "", col: null };

    const val = String(sheet.getRange(SIGN_OFF_ROW, targetCol).getValue() || "").trim();
    return { exists: true, signed: val !== "", value: val, col: targetCol };
  } catch (e) {
    console.error("getSignOffStatus error:", e);
    return { exists: false, signed: false, value: "", col: null };
  }
}

function signOffByChainage(location, chainage, signerName, forceOverwrite) {
  const lock = LockService.getDocumentLock();
  try {
    if (!lock.tryLock(15000)) {
      return { ok: false, message: "System busy. Please retry in a moment." };
    }

    if (!location) return { ok: false, message: "Missing location" };
    if (!signerName) return { ok: false, message: "Missing signer name" };

    const chainageInfo = parseChainageInt_(chainage, CHAINAGE_INCREMENT);
    if (!chainageInfo.isFinite || !chainageInfo.isMultiple) {
      return { ok: false, message: `Invalid chainage '${chainage}'. Must be multiple of ${CHAINAGE_INCREMENT}.` };
    }

    const sheet = getSheetByLocation_(location);
    if (!sheet) return { ok: false, message: "Sheet not found" };

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) return { ok: false, message: "No records found" };

    const row2Values = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
    let targetCol = null;
    for (let i = 0; i < row2Values.length; i++) {
      if (Number(row2Values[i]) === chainageInfo.value) {
        targetCol = i + 2;
        break;
      }
    }
    if (!targetCol) return { ok: false, message: "Chainage not found in sheet" };

    const cell = sheet.getRange(SIGN_OFF_ROW, targetCol);
    const existing = String(cell.getValue() || "").trim();
    if (existing && !forceOverwrite) {
      return { ok: false, message: "Already signed. Enable force overwrite to replace." };
    }

    const stamp = `${String(signerName).trim()} - ${formatPerthDateTime_(new Date())}`;
    cell.setValue(stamp);

    return { ok: true, message: "Sign-off saved", value: stamp };
  } catch (e) {
    console.error("signOffByChainage error:", e);
    return { ok: false, message: "Sign-off failed" };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function formatPerthDateTime_(date) {
  const dt = (date instanceof Date) ? date : new Date(date);
  return Utilities.formatDate(dt, "Australia/Perth", "dd/MM/yyyy HH:mm");
}

/* =========================
   METRICS
========================= */

function getBackfilledMeters(location) {
  try {
    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return 0;

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) return 0;

    const chainageValues = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
    const uniqueChainages = [...new Set(chainageValues.filter(cell => cell !== "" && !isNaN(cell)))];

    return uniqueChainages.length * CHAINAGE_INCREMENT;
  } catch (e) {
    console.error("getBackfilledMeters error:", e);
    return 0;
  }
}

/* =========================
   ADMIN: BLOCKS
========================= */

function getHistoricalBlocks(location) {
  const targetId = LOCATION_MAP[location] || DEFAULT_ID;
  const ss = SpreadsheetApp.openById(targetId);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  const lastCol = sheet.getLastColumn();
  const blocks = [];

  for (let start = 2; start <= lastCol; start += 10) {
    const end = Math.min(start + 9, lastCol);
    const width = end - start + 1;

    const raw = sheet.getRange(2, start, 1, width).getValues()[0];
    const numeric = raw
      .map(v => (v === "" ? null : Number(v)))
      .filter(v => Number.isFinite(v));

    const blockNum = Math.floor((start - 2) / 10) + 1;

    let blockStart = "";
    let blockEnd = "";
    let missing = [];
    let status = "OPEN";
    let pages = 1;

    if (numeric.length > 0) {
      const maxCh = Math.max(...numeric);

      const expectedTen = Array.from({ length: 10 }, (_, i) => maxCh - i * CHAINAGE_INCREMENT);

      const set = new Set(numeric.map(n => Number(n)));
      missing = expectedTen.filter(ch => !set.has(ch));

      blockStart = expectedTen[0];
      blockEnd = expectedTen[9];

      status = (missing.length === 0) ? "READY" : "OPEN";
    } else {
      status = "OPEN";
      missing = [];
      blockStart = "";
      blockEnd = "";
    }

    blocks.push({
      reportNum: blockNum,
      startCol: start,
      endCol: end,
      blockStart: blockStart,
      blockEnd: blockEnd,
      recordCount: numeric.length,
      pages: pages,
      status: status,
      missing: missing
    });
  }

  return blocks;
}

/* =========================
   ADMIN: SECTIONS
========================= */

function createSection(payload) {
  try {
    const location = String(payload?.location || "").trim();
    const lengthRaw = payload?.length;
    const startRaw = payload?.startChainage;
    const direction = String(payload?.direction || "").trim().toLowerCase();

    if (!location) return { ok: false, error: "Missing location" };
    if (!direction || (direction !== "backwards" && direction !== "onwards")) {
      return { ok: false, error: "Missing direction" };
    }

    const lengthNum = Number(lengthRaw);
    if (!Number.isFinite(lengthNum) || lengthNum <= 0) {
      return { ok: false, error: "Section length must be > 0" };
    }

    const lastRecorded = getLastRecordedChainage_(location);
    if (!Number.isFinite(lastRecorded)) {
      return { ok: false, error: "Unable to determine last recorded chainage" };
    }

    let startCh = null;
    if (startRaw !== "" && startRaw !== null && startRaw !== undefined) {
      const chInfo = parseChainageInt_(startRaw, CHAINAGE_INCREMENT);
      if (!chInfo.isFinite || !chInfo.isMultiple) {
        return { ok: false, error: `Starting chainage must be multiple of ${CHAINAGE_INCREMENT}` };
      }
      startCh = chInfo.value;
    } else {
      startCh = (direction === "onwards")
        ? lastRecorded + CHAINAGE_INCREMENT
        : lastRecorded - CHAINAGE_INCREMENT;
    }

    const steps = Math.floor(lengthNum / CHAINAGE_INCREMENT);
    if (!Number.isFinite(steps) || steps <= 0) {
      return { ok: false, error: `Section length must be at least ${CHAINAGE_INCREMENT}m` };
    }

    const chainageList = buildSectionChainageList_(startCh, direction, steps, CHAINAGE_INCREMENT);
    const now = formatPerthDateTime_(new Date());

    const ssId = LOCATION_MAP[location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName("Sections");
    if (!sheet) {
      sheet = ss.insertSheet("Sections");
      sheet.getRange(1, 1, 1, 8).setValues([[
        "created_at",
        "location",
        "length_m",
        "direction",
        "start_chainage",
        "chainage_increment",
        "steps",
        "chainage_list_json"
      ]]);
    }

    sheet.appendRow([
      now,
      location,
      lengthNum,
      direction,
      startCh,
      CHAINAGE_INCREMENT,
      steps,
      JSON.stringify(chainageList)
    ]);

    return { ok: true, message: "Section created" };
  } catch (e) {
    console.error("createSection error:", e);
    return { ok: false, error: "Failed to create section" };
  }
}

function getLastRecordedChainage_(location) {
  try {
    const sheet = getSheetByLocation_(location);
    if (!sheet) return START_CHAINAGE;

    const lastCol = sheet.getLastColumn();
    if (lastCol < 2) return START_CHAINAGE;

    const row2Values = sheet.getRange(2, 2, 1, lastCol - 1).getValues()[0];
    let lastRecorded = START_CHAINAGE;
    for (let i = row2Values.length - 1; i >= 0; i--) {
      if (row2Values[i] !== "" && !isNaN(row2Values[i])) {
        lastRecorded = Number(row2Values[i]);
        break;
      }
    }
    return lastRecorded;
  } catch (e) {
    console.error("getLastRecordedChainage_ error:", e);
    return START_CHAINAGE;
  }
}

function buildSectionChainageList_(startCh, direction, steps, increment) {
  const list = [];
  const dir = String(direction || "").toLowerCase();
  for (let i = 0; i < steps; i++) {
    list.push(dir === "onwards" ? (startCh + i * increment) : (startCh - i * increment));
  }
  return list;
}

/* =========================
   ADMIN: SIGN OFF
========================= */

function signOffColumn(location, chainageOrCol, signerName, forceOverwrite) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);
    if (!location) return { ok: false, error: "Missing location" };
    if (!signerName) return { ok: false, error: "Missing signer name" };

    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: false, error: "Sheet not found" };

    const targetCol = resolveColumnIndex_(sheet, chainageOrCol);
    if (!targetCol) return { ok: false, error: "Target column not found" };

    const cell = sheet.getRange(SIGN_OFF_ROW, targetCol);
    const existing = String(cell.getValue() || "").trim();

    if (existing && !forceOverwrite) {
      return { ok: false, error: "Sign-off already exists" };
    }

    const stamp = `${String(signerName).trim()} - ${formatPerthDateTime_(new Date())}`;
    cell.setValue(stamp);

    return { ok: true, message: "Sign-off saved" };
  } catch (e) {
    console.error("signOffColumn error:", e);
    return { ok: false, error: "Sign-off failed" };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function signOffBlock(location, blockNum, signerName, forceOverwrite) {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(30000);
    if (!location) return { ok: false, error: "Missing location" };
    if (!blockNum) return { ok: false, error: "Missing block number" };
    if (!signerName) return { ok: false, error: "Missing signer name" };

    const blocks = getHistoricalBlocks(location);
    const block = blocks.find(b => Number(b.reportNum) === Number(blockNum));
    if (!block) return { ok: false, error: "Block not found" };

    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: false, error: "Sheet not found" };

    const width = block.endCol - block.startCol + 1;
    const chainageRow = sheet.getRange(2, block.startCol, 1, width).getValues()[0];
    const signOffRow = sheet.getRange(SIGN_OFF_ROW, block.startCol, 1, width).getValues()[0];

    const stamp = `${String(signerName).trim()} - ${formatPerthDateTime_(new Date())}`;
    let signed = 0;
    let skipped = 0;

    for (let i = 0; i < width; i++) {
      const chainage = Number(chainageRow[i]);
      if (!Number.isFinite(chainage)) continue;

      const existing = String(signOffRow[i] || "").trim();
      if (existing && !forceOverwrite) {
        skipped += 1;
        continue;
      }
      signOffRow[i] = stamp;
      signed += 1;
    }

    sheet.getRange(SIGN_OFF_ROW, block.startCol, 1, width).setValues([signOffRow]);

    return {
      ok: true,
      message: `Signed ${signed} record(s). Skipped ${skipped} already signed.`
    };
  } catch (e) {
    console.error("signOffBlock error:", e);
    return { ok: false, error: "Sign-off failed" };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function resolveColumnIndex_(sheet, chainageOrCol) {
  const lastCol = sheet.getLastColumn();
  const num = Number(chainageOrCol);

  if (Number.isFinite(num)) {
    const row2Values = sheet.getRange(2, 2, 1, Math.max(lastCol - 1, 1)).getValues()[0];
    for (let i = 0; i < row2Values.length; i++) {
      if (Number(row2Values[i]) === num) return i + 2;
    }
    if (Number.isInteger(num) && num >= 2 && num <= lastCol) return num;
  }

  return null;
}

/* =========================
   ADMIN: DISPATCH
========================= */

function sendAdminReport(location, blockNum, targetEmail, forceSend) {
  try {
    if (!location) return "Error: missing location";
    if (!blockNum) return "Error: missing block number";
    if (!targetEmail) return "Error: missing target email";

    const targetId = LOCATION_MAP[location] || DEFAULT_ID;

    const blocks = getHistoricalBlocks(location);
    const block = blocks.find(b => Number(b.reportNum) === Number(blockNum));
    if (!block) return "Error: block not found";

    const isReady = block.status === "READY";
    const force = String(forceSend) === "true" || forceSend === true;

    if (!isReady && !force) {
      const pend = (block.missing && block.missing.length) ? block.missing.join(", ") : "No data yet";
      return `BLOCK OPEN: pending CH: ${pend}`;
    }

    const data = { location: location };
    const timestamp = new Date();

    generateAndSendPDF(
      data,
      timestamp,
      targetId,
      block.startCol,
      block.endCol,
      targetEmail,
      { isOpen: !isReady, pending: block.missing || [] }
    );

    if (!isReady && force) {
      const pend = (block.missing && block.missing.length) ? block.missing.join(", ") : "No pending list";
      return `OPEN report dispatched to ${targetEmail}. Pending CH: ${pend}`;
    }

    return "Report sent to " + targetEmail;

  } catch (e) {
    console.error("sendAdminReport ERROR:", e);
    return "Error sending report: " + (e && e.message ? e.message : e.toString());
  }
}

/* =========================
   ADMIN: AUDIT REPORT
========================= */

function sendAuditReport(location, blockNum, targetEmail, includeOpen) {
  try {
    if (!location) return "Error: missing location";
    if (!blockNum) return "Error: missing block number";

    const blocks = getHistoricalBlocks(location);
    const block = blocks.find(b => Number(b.reportNum) === Number(blockNum));
    if (!block) return "Error: block not found";

    const isReady = block.status === "READY";
    const allowOpen = includeOpen === undefined ? true : (String(includeOpen) === "true" || includeOpen === true);

    if (!isReady && !allowOpen) {
      const pend = (block.missing && block.missing.length) ? block.missing.join(", ") : "No data yet";
      return `BLOCK OPEN: pending CH: ${pend}`;
    }

    const targetId = LOCATION_MAP[location] || DEFAULT_ID;
    const ss = SpreadsheetApp.openById(targetId);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return "Error: sheet not found";

    const width = block.endCol - block.startCol + 1;
    const rows = [
      { row: 1, label: "Date/Time" },
      { row: 2, label: "Chainage" },
      { row: 4, label: "L1 150" },
      { row: 5, label: "L1 450" },
      { row: 6, label: "L1 750" },
      { row: 8, label: "L2 150" },
      { row: 9, label: "L2 450" },
      { row: 10, label: "L2 750" },
      { row: 12, label: "L3 150" },
      { row: 13, label: "L3 450" },
      { row: 14, label: "L3 750" },
      { row: 15, label: "Site Inspector" },
      { row: 16, label: "Supervisor Sign Off" }
    ];

    const tableData = [];
    const colHeaders = ["Field"].concat(
      Array.from({ length: width }, (_, i) => `Col ${block.startCol + i}`)
    );
    tableData.push(colHeaders);

    rows.forEach(r => {
      const vals = sheet.getRange(r.row, block.startCol, 1, width).getDisplayValues()[0];
      tableData.push([r.label].concat(vals));
    });

    const reportNum = block.reportNum;
    const folder = getAuditReportsFolder_();
    const ts = formatPerthDateTime_(new Date());
    const fileName = `AUDIT_${location}_Rep${reportNum}_${ts.replace(/[:/ ]/g, "-")}`;

    const docBundle = createAuditDoc_(fileName, folder);
    const doc = docBundle.doc;
    const body = doc.getBody();

    body.appendParagraph("AUDIT REPORT").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Location: ${location}`);
    body.appendParagraph(`Report #${reportNum} • Columns ${block.startCol} to ${block.endCol}`);
    body.appendParagraph(`Generated: ${ts}`);
    body.appendParagraph("");
    body.appendTable(tableData);

    doc.saveAndClose();

    const pdfBlob = docBundle.file.getAs(MimeType.PDF).setName(`${fileName}.pdf`);
    const pdfFile = folder.createFile(pdfBlob);

    const toEmail = (targetEmail && String(targetEmail).trim())
      ? String(targetEmail).trim()
      : "";

    if (!toEmail) return "Error: missing target email";

    MailApp.sendEmail({
      to: toEmail,
      subject: `AUDIT REPORT - ${location} - Rep #${reportNum}`,
      body: `Audit report generated.\n\nRange: Column ${block.startCol} to ${block.endCol}\nGenerated: ${ts}\n`,
      attachments: [pdfFile.getBlob()]
    });

    return `Audit report sent to ${toEmail}`;
  } catch (e) {
    console.error("sendAuditReport error:", e);
    return "Error sending audit report";
  }
}

function getAuditReportsFolder_() {
  const folders = DriveApp.getFoldersByName(AUDIT_REPORTS_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(AUDIT_REPORTS_FOLDER_NAME);
}

function createAuditDoc_(fileName, folder) {
  if (AUDIT_TEMPLATE_DOC_ID && String(AUDIT_TEMPLATE_DOC_ID).trim() && AUDIT_TEMPLATE_DOC_ID !== "PASTE_AUDIT_TEMPLATE_ID_HERE") {
    try {
      const template = DriveApp.getFileById(AUDIT_TEMPLATE_DOC_ID);
      const copy = template.makeCopy(fileName, folder);
      const doc = DocumentApp.openById(copy.getId());
      doc.getBody().clear();
      return { doc: doc, file: copy, usedTemplate: true };
    } catch (e) {
      console.warn("Audit template unavailable, using fallback:", e);
    }
  }

  const doc = DocumentApp.create(fileName);
  const file = DriveApp.getFileById(doc.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return { doc: doc, file: file, usedTemplate: false };
}

/* =========================
   DOC HELPERS
========================= */

function appendElementToBody_(body, el) {
  const t = el.getType();

  if (t === DocumentApp.ElementType.PARAGRAPH) { body.appendParagraph(el.asParagraph()); return; }
  if (t === DocumentApp.ElementType.TABLE) { body.appendTable(el.asTable()); return; }
  if (t === DocumentApp.ElementType.LIST_ITEM) { body.appendListItem(el.asListItem()); return; }
  if (t === DocumentApp.ElementType.HORIZONTAL_RULE) { body.appendHorizontalRule(); return; }
  if (t === DocumentApp.ElementType.INLINE_IMAGE) { body.appendImage(el.asInlineImage()); return; }
  if (t === DocumentApp.ElementType.PAGE_BREAK) { body.appendPageBreak(); return; }

  try {
    body.appendParagraph(el.copy().getText ? el.copy().getText() : "");
  } catch (e) {
    body.appendParagraph("");
  }
}

function duplicateBodyAsNewPage_(doc, snapshotOverride) {
  const body = doc.getBody();
  const snapshot = snapshotOverride || [];
  if (!snapshot.length) {
    for (let i = 0; i < body.getNumChildren(); i++) snapshot.push(body.getChild(i).copy());
  }
  body.appendPageBreak();
  snapshot.forEach(el => appendElementToBody_(body, el));
}

function replaceTextInElement_(el, pattern, replacement) {
  try {
    el.editAsText().replaceText(pattern, replacement);
    return;
  } catch (e) {}

  if (el.getNumChildren) {
    const count = el.getNumChildren();
    for (let i = 0; i < count; i++) {
      replaceTextInElement_(el.getChild(i), pattern, replacement);
    }
  }
}

function replaceTextInRange_(body, startIdx, endIdx, pattern, replacement) {
  for (let i = startIdx; i <= endIdx; i++) {
    const child = body.getChild(i);
    replaceTextInElement_(child, pattern, replacement);
  }
}

/* =========================
   PDF GENERATION
========================= */

/* =========================
   PDF GENERATION
========================= */

function generateAndSendPDF(data, timestamp, sheetId, startColOverride, endColOverride, targetEmailOverride, meta) {
  data = data || { location: "McLennan Dr - SEC3" };
  timestamp = timestamp || new Date();
  sheetId = sheetId || DEFAULT_ID;

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`No existe la hoja ${SHEET_NAME}`);

  let configSheet = ss.getSheetByName("Config");
  if (!configSheet) {
    configSheet = ss.insertSheet("Config");
    configSheet.hideSheet();
    configSheet.getRange("A1:B1").setValues([[0, 1]]);
  }
  const lastProcessedCol = Number(configSheet.getRange("B1").getValue());

  let startCol = (startColOverride != null)
    ? Number(startColOverride)
    : (Number.isFinite(lastProcessedCol) ? (lastProcessedCol + 1) : 2);

  if (!Number.isFinite(startCol) || startCol < 2) startCol = 2;

  let endCol = (endColOverride != null) ? Number(endColOverride) : (startCol + 9);
  if (!Number.isFinite(endCol) || endCol < startCol) endCol = startCol;

  const width = endCol - startCol + 1;

  const currentLastCol = sheet.getLastColumn();
  if (currentLastCol < endCol) {
    console.log(`No hay suficientes columnas. Última: ${currentLastCol}. Necesario: ${endCol}`);
    return;
  }

  const reportNum = Math.floor((startCol - 2) / 10) + 1;

  const rangeValues = sheet.getRange(2, startCol, 14, width).getValues();
  const dateRow = sheet.getRange(1, startCol, 1, width).getValues()[0];

  const fmtCellDate = (d) => {
    if (!d) return "";
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    return Utilities.formatDate(dt, "Australia/Perth", "dd/MM/yyyy");
  };

  const isOpen = !!(meta && meta.isOpen);

  const safeOpenBlank = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string" && v.trim() === "") return "";
    return v;
  };

  const safeVal = (v) => (isOpen ? safeOpenBlank(v) : (v ?? ""));

  const template = DriveApp.getFileById(TEMPLATE_DOC_ID);
  const reportIssueDateStr = Utilities.formatDate(timestamp, "Australia/Perth", "dd/MM/yyyy");
  const dateForFilename = Utilities.formatDate(timestamp, "Australia/Perth", "dd-MM-yyyy");

  const fileName = `ITR-EXB-003_${data.location}_Rep${reportNum}_${dateForFilename}`;
  const copy = template.makeCopy(fileName);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  const header = doc.getHeader();
  const footer = doc.getFooter();

  const replaceEverywhere = (pattern, text) => {
    const val = String(text ?? "");
    body.replaceText(pattern, val);
    if (header) header.replaceText(pattern, val);
    if (footer) footer.replaceText(pattern, val);
  };

  replaceEverywhere("{{REPORT_DATE}}", reportIssueDateStr);
  replaceEverywhere("{{REPORT_NUMBER}}", String(reportNum));
  replaceEverywhere("{{WORK_LOCATION}}", data.location);

  const supRow = rangeValues?.[13] || [];
  const lastSupervisor = [...supRow].reverse().find(v => !(v === "" || v === null || v === undefined || (typeof v === "string" && v.trim() === ""))) || "";
  replaceEverywhere("{{SUPERVISOR_NAME}}", safeVal(lastSupervisor));

  const pageSize = 10;
  const pages = Math.ceil(width / pageSize);
  const baseCount = body.getNumChildren();
  const baseSnapshot = [];
  for (let i = 0; i < baseCount; i++) baseSnapshot.push(body.getChild(i).copy());
  for (let p = 1; p < pages; p++) duplicateBodyAsNewPage_(doc, baseSnapshot);

  for (let p = 0; p < pages; p++) {
    const startIdx = p * (baseCount + 1);
    const endIdx = startIdx + baseCount - 1;
    const offset = p * pageSize;

    for (let i = 0; i < pageSize; i++) {
      const idx = i;
      const colIdx = offset + i;

      replaceTextInRange_(body, startIdx, endIdx, `{{DATE_${idx}}}`, (dateRow && dateRow[colIdx]) ? fmtCellDate(dateRow[colIdx]) : "");
      replaceTextInRange_(body, startIdx, endIdx, `{{CH_${idx}}}`, safeVal(rangeValues?.[0]?.[colIdx]));

      replaceTextInRange_(body, startIdx, endIdx, `{{L1_A_${idx}}}`, safeVal(rangeValues?.[2]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L1_B_${idx}}}`, safeVal(rangeValues?.[3]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L1_C_${idx}}}`, safeVal(rangeValues?.[4]?.[colIdx]));

      replaceTextInRange_(body, startIdx, endIdx, `{{L2_A_${idx}}}`, safeVal(rangeValues?.[6]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L2_B_${idx}}}`, safeVal(rangeValues?.[7]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L2_C_${idx}}}`, safeVal(rangeValues?.[8]?.[colIdx]));

      replaceTextInRange_(body, startIdx, endIdx, `{{L3_A_${idx}}}`, safeVal(rangeValues?.[10]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L3_B_${idx}}}`, safeVal(rangeValues?.[11]?.[colIdx]));
      replaceTextInRange_(body, startIdx, endIdx, `{{L3_C_${idx}}}`, safeVal(rangeValues?.[12]?.[colIdx]));
    }
  }

  doc.saveAndClose();

  const pdfBlob = copy.getAs(MimeType.PDF);
  const totalMeters = getBackfilledMeters(data.location);

  const toEmail = (targetEmailOverride && String(targetEmailOverride).trim())
    ? String(targetEmailOverride).trim()
    : EMAIL_REPORTE;

  const pendingArr = (meta && Array.isArray(meta.pending)) ? meta.pending : [];
  const pendingTxt = pendingArr.length ? pendingArr.join(", ") : "None";

  const subject = isOpen
    ? `OPEN REPORT - PSP Record - ${data.location} - Rep #${reportNum}`
    : `PSP Record - ${data.location} - Rep #${reportNum}`;

  const bodyTxt =
    (isOpen
      ? `OPEN REPORT DISPATCHED (block not complete).\nPending CH to close this block: ${pendingTxt}\n\n`
      : `Attached formal report #${reportNum} for ${data.location}.\n\n`
    ) +
    `Range: Column ${startCol} to ${endCol}\n` +
    `Pages: ${pages}\n` +
    `Total backfilled to date: ${totalMeters} m.\n`;

  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    body: bodyTxt,
    attachments: [pdfBlob]
  });

  const sequential = (startColOverride == null && endColOverride == null);
  if (sequential) configSheet.getRange("B1").setValue(endCol);

  DriveApp.getFileById(copy.getId()).setTrashed(true);
}