import { FORM_GROUPS } from '../data/conjugationTypes.js';
import { DICTIONARY_TYPE_ID, typeIdFromCardId } from './storage.js';

function cleanNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

function attemptedFromStats(stats = {}) {
  return cleanNumber(stats.correct) + cleanNumber(stats.incorrect);
}

function normalizeSourceTypeStats(sourceTypeStats = {}) {
  return Object.entries(sourceTypeStats || {})
    .map(([typeId, stats]) => ({
      typeId,
      correct: cleanNumber(stats?.correct),
      incorrect: cleanNumber(stats?.incorrect),
    }))
    .filter((entry) => entry.typeId && entry.correct + entry.incorrect > 0);
}

function mistakeProgressType(mistake = {}) {
  if (mistake.type === DICTIONARY_TYPE_ID) {
    return mistake.sourceType || mistake.promptType || '';
  }
  return mistake.type || '';
}

function statusFor({ attempted, accuracy, mistakeCount }) {
  if (attempted >= 3 && accuracy >= 85) return 'strong';
  if (attempted > 0 && (accuracy < 60 || mistakeCount > 0)) return 'weak';
  if (attempted > 0) return 'developing';
  return 'new';
}

function sortScoreFor(status, mistakeCount, accuracy) {
  if (status === 'weak') return -1000 - mistakeCount * 50 + accuracy;
  if (status === 'new') return 500;
  if (status === 'developing') return 100 + accuracy;
  return 1000 + accuracy;
}

export function buildFormFamilyProgress(state = {}, families = FORM_GROUPS) {
  const rows = families.map((family) => ({
    ...family,
    typeSet: new Set(family.typeIds || []),
    correct: 0,
    incorrect: 0,
    mistakeCount: 0,
  }));
  const rowsByType = new Map();
  rows.forEach((row) => {
    row.typeSet.forEach((typeId) => rowsByType.set(typeId, row));
  });

  let unattributedPracticed = 0;
  for (const [cardId, card] of Object.entries(state.cards || {})) {
    const cardType = typeIdFromCardId(cardId);
    if (cardType === DICTIONARY_TYPE_ID) {
      const sourceStats = normalizeSourceTypeStats(card?.sourceTypeStats);
      if (sourceStats.length > 0) {
        let sourceAttempted = 0;
        sourceStats.forEach(({ typeId, correct, incorrect }) => {
          sourceAttempted += correct + incorrect;
          const row = rowsByType.get(typeId);
          if (!row) {
            unattributedPracticed += correct + incorrect;
            return;
          }
          row.correct += correct;
          row.incorrect += incorrect;
        });
        unattributedPracticed += Math.max(0, attemptedFromStats(card) - sourceAttempted);
        continue;
      }

      const correct = cleanNumber(card?.correct);
      const incorrect = cleanNumber(card?.incorrect);
      const attempted = correct + incorrect;
      const row = rowsByType.get(card?.sourceType);
      if (row) {
        row.correct += correct;
        row.incorrect += incorrect;
      } else {
        unattributedPracticed += attempted;
      }
      continue;
    }

    const row = rowsByType.get(cardType);
    if (!row) continue;
    row.correct += cleanNumber(card?.correct);
    row.incorrect += cleanNumber(card?.incorrect);
  }

  for (const mistake of state.mistakes || []) {
    if (mistake?.resolved) continue;
    const row = rowsByType.get(mistakeProgressType(mistake));
    if (row) row.mistakeCount += 1;
  }

  const strengthRows = rows
    .map(({ typeSet: _typeSet, ...row }) => {
      const attempted = row.correct + row.incorrect;
      const accuracy = attempted ? Math.round((row.correct / attempted) * 100) : 0;
      const status = statusFor({ attempted, accuracy, mistakeCount: row.mistakeCount });
      return {
        ...row,
        attempted,
        accuracy,
        status,
        sortScore: sortScoreFor(status, row.mistakeCount, accuracy),
      };
    })
    .sort((a, b) => a.sortScore - b.sortScore || a.label.localeCompare(b.label));

  return {
    rows: strengthRows,
    totalPracticed:
      unattributedPracticed + strengthRows.reduce((sum, row) => sum + (row.attempted || 0), 0),
    unattributedPracticed,
  };
}

export function buildFormFamilyStrengthRows(state = {}, families = FORM_GROUPS) {
  return buildFormFamilyProgress(state, families).rows;
}
