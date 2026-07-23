// App state + persistence + seed data.
// localStorage is only ever touched inside function bodies (never at module
// top level) so this module works in Node with a stubbed
// globalThis.localStorage, and the store lazily loads on first use rather
// than at import time — tests can install the stub after importing.

import { SOUNDS } from './audio.js';

const STORAGE_KEY = 'librata.zazen.v1';
const CURRENT_SCHEMA = 1;

const DEFAULT_SOUND_ID = SOUNDS[1].id; // 'rin-medium' — the house default
const DEFAULT_GAP = 2;

let doc = null;
const listeners = new Set();

function hasStorage() {
  return typeof globalThis !== 'undefined' && !!globalThis.localStorage;
}

function readStorage() {
  if (!hasStorage()) return null;
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage() {
  if (!hasStorage()) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // storage unavailable/full — state stays in memory for this session
  }
}

/** Schema-migration hook. Only schema 1 exists today; future bumps chain here. */
function migrate(raw) {
  if (raw.schema === CURRENT_SCHEMA) return raw;
  return { ...raw, schema: CURRENT_SCHEMA };
}

function bells(count, gapSec, soundId) {
  return { count, gapSec, soundId };
}

function section(name, durationSec, bellSpec) {
  return { id: crypto.randomUUID(), name, durationSec, bells: bellSpec };
}

function session(name, description, sections, closing) {
  return { id: crypto.randomUUID(), name, description, sections, closing };
}

/** The four seed sessions from PLAN §6. */
function seedSessions() {
  const morningSit = session(
    'Morning sit',
    '',
    [
      section('Settling', 5 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Breath', 20 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Return', 5 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
    ],
    bells(3, 4, 'tibetan-deep'),
  );

  const shortSit = session(
    'Short sit',
    '',
    [
      section('Settling', 3 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Breath', 12 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
    ],
    bells(2, DEFAULT_GAP, 'rin-medium'),
  );

  const bodyAndBreath = session(
    'Body and breath',
    '',
    [
      section('Arrival', 5 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Body', 15 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Breath', 20 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Dedication', 5 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
    ],
    bells(3, 4, 'rin-medium'),
  );

  const openAwareness = session(
    'Open awareness',
    '',
    [
      section('Settling', 10 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Open sitting', 45 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
      section('Return', 5 * 60, bells(1, DEFAULT_GAP, 'rin-medium')),
    ],
    bells(3, 5, 'gong-low'),
  );

  return [morningSit, shortSit, bodyAndBreath, openAwareness];
}

function seedDoc() {
  const sessions = seedSessions();
  return {
    schema: CURRENT_SCHEMA,
    currentSessionId: sessions[0].id,
    sessions,
    settings: { volume: 0.8, keepAwake: true, theme: 'carta' },
    playback: null,
  };
}

function ensureLoaded() {
  if (doc) return;
  const raw = readStorage();
  if (raw) {
    doc = migrate(raw);
  } else {
    doc = seedDoc();
    writeStorage();
  }
}

function notify() {
  writeStorage();
  for (const fn of listeners) fn();
}

export function getState() {
  ensureLoaded();
  return doc;
}

export function subscribe(fn) {
  ensureLoaded();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSessions() {
  ensureLoaded();
  return doc.sessions;
}

export function getSession(id) {
  ensureLoaded();
  return doc.sessions.find((s) => s.id === id);
}

export function getCurrentSession() {
  ensureLoaded();
  return getSession(doc.currentSessionId);
}

export function setCurrentSession(id) {
  ensureLoaded();
  if (!getSession(id)) return;
  doc.currentSessionId = id;
  notify();
}

export function createSession() {
  ensureLoaded();
  const newSection = section('New section', 10 * 60, bells(1, DEFAULT_GAP, DEFAULT_SOUND_ID));
  const newSession = session('New session', '', [newSection], bells(1, DEFAULT_GAP, DEFAULT_SOUND_ID));
  doc.sessions.push(newSession);
  notify();
  return newSession;
}

export function updateSession(id, patch) {
  ensureLoaded();
  const target = getSession(id);
  if (!target) return undefined;
  Object.assign(target, patch);
  notify();
  return target;
}

export function duplicateSession(id) {
  ensureLoaded();
  const index = doc.sessions.findIndex((s) => s.id === id);
  if (index === -1) return undefined;
  const source = doc.sessions[index];
  const copy = session(
    `${source.name} copy`,
    source.description,
    source.sections.map((s) => section(s.name, s.durationSec, bells(s.bells.count, s.bells.gapSec, s.bells.soundId))),
    bells(source.closing.count, source.closing.gapSec, source.closing.soundId),
  );
  doc.sessions.splice(index + 1, 0, copy);
  notify();
  return copy;
}

export function deleteSession(id) {
  ensureLoaded();
  if (doc.sessions.length <= 1) return false;
  const index = doc.sessions.findIndex((s) => s.id === id);
  if (index === -1) return false;
  doc.sessions.splice(index, 1);
  if (doc.currentSessionId === id) {
    doc.currentSessionId = doc.sessions[0].id;
  }
  notify();
  return true;
}

export function addSection(sessionId) {
  ensureLoaded();
  const target = getSession(sessionId);
  if (!target) return undefined;
  const newSection = section('New section', 5 * 60, bells(1, DEFAULT_GAP, DEFAULT_SOUND_ID));
  target.sections.push(newSection);
  notify();
  return newSection;
}

export function updateSection(sessionId, sectionId, patch) {
  ensureLoaded();
  const target = getSession(sessionId);
  if (!target) return undefined;
  const targetSection = target.sections.find((s) => s.id === sectionId);
  if (!targetSection) return undefined;
  Object.assign(targetSection, patch);
  notify();
  return targetSection;
}

export function removeSection(sessionId, sectionId) {
  ensureLoaded();
  const target = getSession(sessionId);
  if (!target) return false;
  if (target.sections.length <= 1) return false;
  const index = target.sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return false;
  target.sections.splice(index, 1);
  notify();
  return true;
}

export function moveSection(sessionId, sectionId, dir) {
  ensureLoaded();
  const target = getSession(sessionId);
  if (!target) return false;
  const index = target.sections.findIndex((s) => s.id === sectionId);
  const swapWith = index + dir;
  if (index === -1 || swapWith < 0 || swapWith >= target.sections.length) return false;
  [target.sections[index], target.sections[swapWith]] = [target.sections[swapWith], target.sections[index]];
  notify();
  return true;
}

export function getSettings() {
  ensureLoaded();
  return doc.settings;
}

export function updateSettings(patch) {
  ensureLoaded();
  Object.assign(doc.settings, patch);
  notify();
  return doc.settings;
}

export function getSavedPlayback() {
  ensureLoaded();
  return doc.playback;
}

export function savePlayback(sessionId, positionSec) {
  ensureLoaded();
  doc.playback = { sessionId, positionSec, savedAt: Date.now() };
  notify();
}

export function clearPlayback() {
  ensureLoaded();
  doc.playback = null;
  notify();
}

export function sessionDuration(targetSession) {
  return targetSession.sections.reduce((sum, s) => sum + s.durationSec, 0);
}

export function sectionStarts(targetSession) {
  let start = 0;
  return targetSession.sections.map((s) => {
    const at = start;
    start += s.durationSec;
    return at;
  });
}
