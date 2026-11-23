const storageKey = 'tengen-local-records';
const maxRecords = 15;
const scoreAddress = 0x043c;
const linesAddress = 0x0496;
const nameAddress = 0x04c3;
const alphabet = {
  en: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ru: ' АБВГДЕЖЁИЙКЛМНЪПРСТУФХШЭЮЯ'
};

export function initialsText(record) {
  return record.initials.map(letter => alphabet[record.language][letter]).join('');
}

export function loadRecords() {
  try {
    const entries = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(entries)) return entries.filter(validRecord).slice(0, maxRecords);
  } catch { /* Some browsers block local storage. */ }
  return [];
}

function validRecord(entry) {
  return entry && (entry.language === 'ru' || entry.language === 'en') &&
    Number.isInteger(entry.score) && entry.score >= 0 && entry.score <= 999999 &&
    Number.isInteger(entry.lines) && entry.lines >= 0 && entry.lines <= 999 &&
    Array.isArray(entry.initials) && entry.initials.length === 3 &&
    entry.initials.every(letter => Number.isInteger(letter) && letter >= 0 && letter < 27);
}

export function addRecord(record, current) {
  const latest = loadRecords();
  const previous = latest.length ? latest : current;
  const entries = [record, ...previous].sort((a, b) => b.score - a.score).slice(0, maxRecords);
  try { localStorage.setItem(storageKey, JSON.stringify(entries)); } catch {}
  return entries;
}

function writeDigits(ram, address, value, width) {
  const digits = String(value).padStart(width, '0');
  for (let i = 0; i < width; i++) ram[address + i] = digits.charCodeAt(i);
}

export function seedRanking(nes, records) {
  const ram = nes.cpu.mem;
  for (let row = 0; row < maxRecords; row++) {
    const entry = records[row];
    writeDigits(ram, scoreAddress + row * 6, entry?.score ?? 0, 6);
    writeDigits(ram, linesAddress + row * 3, entry?.lines ?? 0, 3);
    for (let i = 0; i < 3; i++) ram[nameAddress + row * 3 + i] = entry?.initials[i] ?? 0;
  }
}

export function editingRecord(nes) {
  const ram = nes.cpu.mem;
  for (let offset = 0; offset < maxRecords * 3; offset++) {
    // The native initials cursor sets the high bits of the selected row.
    if (ram[nameAddress + offset] & 0xc0) return Math.floor(offset / 3);
  }
  return null;
}

export function readConfirmedRecord(nes, row, language) {
  const ram = nes.cpu.mem;
  const digits = (start, count) => Number(String.fromCharCode(...ram.subarray(start, start + count)));
  const address = nameAddress + row * 3;
  const initials = Array.from(ram.subarray(address, address + 3), letter => letter & 0x3f);
  const record = { language, score: digits(scoreAddress + row * 6, 6), lines: digits(linesAddress + row * 3, 3), initials };
  return validRecord(record) ? record : null;
}
