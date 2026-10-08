// @ts-check
// Shared helpers for auditing exported sentence corpus rows.
import { sentenceRowQualityIssue } from '../src/utils/sentenceQuality.js';

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function addSample(samples, key, row, limit) {
  if (!samples.has(key)) samples.set(key, []);
  const values = samples.get(key);
  if (values.length < limit) values.push(row);
}

function topCounts(map, { threshold = 2, limit = 20 } = {}) {
  return [...map.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

/**
 * @param {Array<{ type:string, rows:Array<Array> }>} chunks
 * @returns {Array<{ type:string, key:string, jaTemplate:string, en:string }>}
 */
export function rowsFromCorpusChunks(chunks) {
  return chunks.flatMap((chunk) =>
    (chunk.rows || []).map((row) => ({
      type: String(chunk.type || ''),
      key: String(row?.[0] || ''),
      jaTemplate: String(row?.[1] || ''),
      en: String(row?.[2] || ''),
    })),
  );
}

/**
 * @param {Array<{ type:string, key:string, jaTemplate:string, en:string }>} rows
 * @param {{ sampleLimit?: number, repeatedEnglishThreshold?: number, repeatedTemplateThreshold?: number }} [options]
 */
export function analyzeSentenceRows(rows, options = {}) {
  const sampleLimit = options.sampleLimit ?? 8;
  const issueCounts = new Map();
  const issueSamples = new Map();
  const englishCounts = new Map();
  const templateCounts = new Map();
  const hardIssues = [];

  for (const row of rows) {
    const issue = sentenceRowQualityIssue({
      en: row.en,
      type: row.type,
      jaTemplate: row.jaTemplate,
    });
    if (issue) {
      inc(issueCounts, issue);
      const sample = {
        type: row.type,
        key: row.key,
        jaTemplate: row.jaTemplate,
        en: row.en,
        reason: issue,
      };
      hardIssues.push(sample);
      addSample(issueSamples, issue, sample, sampleLimit);
    }
    inc(englishCounts, row.en);
    inc(templateCounts, `${row.type}\t${row.jaTemplate}`);
  }

  return {
    totalRows: rows.length,
    hardIssueCount: hardIssues.length,
    issueCounts: Object.fromEntries([...issueCounts.entries()].sort()),
    issueSamples: Object.fromEntries([...issueSamples.entries()].sort()),
    reviewSignals: {
      repeatedEnglish: topCounts(englishCounts, {
        threshold: options.repeatedEnglishThreshold ?? 20,
      }),
      repeatedTypeTemplates: topCounts(templateCounts, {
        threshold: options.repeatedTemplateThreshold ?? 25,
      }),
    },
  };
}

function sampleLines(samples = []) {
  return samples
    .map((sample) => `  - ${sample.type} ${sample.key}: ${sample.reason}: ${sample.en}`)
    .join('\n');
}

function countLines(entries = [], formatValue = (entry) => entry.value) {
  return entries.map((entry) => `  - ${entry.count}x ${formatValue(entry)}`).join('\n');
}

export function formatSentenceQualityReport(result) {
  const lines = [
    `Sentence corpus quality: ${result.totalRows} row(s) scanned.`,
    result.hardIssueCount ? `Hard issues: ${result.hardIssueCount}` : 'Hard issues: 0',
  ];

  for (const [reason, count] of Object.entries(result.issueCounts || {})) {
    lines.push(`\n${reason}: ${count}`);
    const samples = result.issueSamples?.[reason] || [];
    if (samples.length) lines.push(sampleLines(samples));
  }

  const repeatedEnglish = result.reviewSignals?.repeatedEnglish || [];
  const repeatedTypeTemplates = result.reviewSignals?.repeatedTypeTemplates || [];
  if (repeatedEnglish.length) {
    lines.push('\nReview signal: repeated English');
    lines.push(countLines(repeatedEnglish));
  }
  if (repeatedTypeTemplates.length) {
    lines.push('\nReview signal: repeated type/template');
    lines.push(
      countLines(repeatedTypeTemplates, (entry) => {
        const [type, template] = String(entry.value).split('\t');
        return `${type}: ${template}`;
      }),
    );
  }

  return lines.filter(Boolean).join('\n');
}
