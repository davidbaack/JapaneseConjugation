import React, { useState, useEffect, useRef, useMemo } from 'react';
import { IconCheck, IconX, IconVolume, IconSpark, IconChat, IconPen } from '../components/Icons.jsx';
import ScriptDisplay from '../components/ScriptDisplay.jsx';
import KanaInputPad from '../components/KanaInputPad.jsx';
import { PitchAccentSection } from '../components/PitchAccent.jsx';
import { ContextExamplePanel } from '../components/ContextExamplePanel.jsx';
import { ConjugationBreakdown } from '../components/ConjugationBreakdown.jsx';
import { ChatPanel } from '../components/ChatPanel.jsx';
import { callGemini, aiSystemFromPrefs, extractJSON } from '../utils/gemini.js';
import { toHiragana, toHiraganaProgress } from '../utils/romaji.js';
import {
  conjugateItem,
  filterWordsForPrefs,
  pickPromptType,
  getTypeInfo,
  getWordMeta,
  getOfflineTemplateSentence,
  explainItem,
  diagnoseItem,
  GROUP_NAMES,
  isAdjective,
  promptFormLabel
} from '../utils/conjugator.js';
import { selectNext, recordMistake, gradeCard, bumpDaily, fmtInterval } from '../utils/storage.js';
import {
  formDisplay,
  promptDisplay,
  englishForForm,
  drillDirectionFor,
  makeChoices,
  makeReverseChoices,
  dictionaryAnswerMatches,
  typoGuardForAnswer
} from '../utils/display.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

function kanaCoachCells(expected, input, revealed = 0, pendingLast = false) {
  const target = Array.from(expected || '');
  const typed = Array.from(toHiraganaProgress(input || ''));
  // Trailing 'n' is held pending in progress mode; commit it as 'ん' when context confirms it
  if (typed.length < target.length && target[typed.length] === 'ん' && /n$/i.test((input || '').trimEnd())) {
    typed.push('ん');
  }
  const lastTypedIndex = typed.length - 1;
  const cells = target.map((expectedKana, i) => {
    const got = typed[i] || '';
    const hinted = !got && i < revealed;
    const wrongButLast = pendingLast && got && got !== expectedKana && i === lastTypedIndex;
    return {
      expected: expectedKana,
      shown: got || (hinted ? expectedKana : ''),
      state: got ? (got === expectedKana ? 'correct' : (wrongButLast ? 'pending' : 'wrong')) : (hinted ? 'hint' : 'empty')
    };
  });
  for (let i = target.length; i < typed.length; i++) {
    cells.push({ expected: '', shown: typed[i], state: pendingLast && i === lastTypedIndex ? 'pending' : 'extra' });
  }
  return cells;
}

export function explainReversePrompt(item, type) {
  const form = conjugateItem(item, type);
  const ti = getTypeInfo(type);
  return {
    intro: `${item.dict} (${item.reading}) is ${GROUP_NAMES[item.group]}.`,
    rule: `The prompt was the ${ti.label} form ${form}. Reverse drills ask you to identify the dictionary form behind that conjugation.`,
    derivation: `${form} → ${item.reading}`,
    note: isAdjective(item)
      ? 'Answer with the dictionary adjective form, not another tense or politeness level.'
      : 'Answer with the dictionary verb form, the form used in dictionaries before adding endings.'
  };
}

export default function StudyView({ state, setState, verbs, geminiKey, practicePrefs = DEFAULT_PREFS, wordLists = [] }) {
  const [current, setCurrent] = useState(null);
  const [answer, setAnswer] = useState('');
  const [phase, setPhase] = useState('answering');
  const [wasCorrect, setWasCorrect] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [showEnglishHint, setShowEnglishHint] = useState(false);
  const [aiHintText, setAiHintText] = useState('');
  const [aiHintLoading, setAiHintLoading] = useState(false);
  const [aiHintErr, setAiHintErr] = useState('');
  const [aiTypingHint, setAiTypingHint] = useState('');
  const [aiTypingHintLoading, setAiTypingHintLoading] = useState(false);
  const [coachRevealed, setCoachRevealed] = useState(0);
  const [revealedMiss, setRevealedMiss] = useState(false);
  const [reviewChoiceLabel, setReviewChoiceLabel] = useState('');
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [typoGuard, setTypoGuard] = useState(null);
  const [kanaPadOpen, setKanaPadOpen] = useState(false);
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [reviewBase, setReviewBase] = useState(state.session.reviewed || 0);
  const [aiSentence, setAiSentence] = useState(null);
  const inputRef = useRef(null);
  const autoAdvanceRef = useRef(null);
  const hadKanaMistakeRef = useRef(false);

  const enabledTypes = state.enabledTypes.length > 0 ? state.enabledTypes : ['plain-past'];
  const practiceWords = useMemo(() => {
    // Make sure we have a clean reference in case selectNext or other utilities call it
    // Wait, conjugator.js defines filterWordsForPrefs
    // Let's import it from ../utils/conjugator.js
    return filterWordsForPrefs(verbs, practicePrefs, wordLists);
  }, [verbs, practicePrefs, wordLists]);

  const listeningPrompt = !!practicePrefs.listeningPrompt;
  const drillDirection = current ? drillDirectionFor(current, practicePrefs) : 'forward';
  const reverseDrill = drillDirection === 'reverse';
  const sourceForm = current ? conjugateItem(current.verb, current.type) : '';
  const promptType = current && !reverseDrill ? pickPromptType(current.verb, current.type, practicePrefs) : null;
  const promptAudioText = current
    ? reverseDrill
      ? sourceForm
      : promptType
        ? conjugateItem(current.verb, promptType)
        : current.verb.reading
    : '';

  useEffect(() => {
    if (current === null) {
      setCurrent(selectNext(state, practiceWords, enabledTypes, null, practicePrefs));
    }
  }, [current, practiceWords, enabledTypes, practicePrefs]);

  useEffect(() => {
    if (
      current &&
      practiceWords.length &&
      !practiceWords.some(w => w.dict === current.verb.dict && w.group === current.verb.group)
    ) {
      setCurrent(null);
      setAnswer('');
      setPhase('answering');
    }
  }, [practiceWords, current]);

  useEffect(() => {
    if (phase === 'answering' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [current, phase]);

  useEffect(() => {
    setShowPromptText(!listeningPrompt);
  }, [current?.id, listeningPrompt]);

  useEffect(() => {
    setShowEnglishHint(false);
    setAiHintText('');
    setAiHintErr('');
    setAiHintLoading(false);
  }, [current?.id, practicePrefs.englishHints]);

  // Handle TTS speech synthesis inside StudyView
  useEffect(() => {
    // Only import window object if running in browser
    if (typeof window === 'undefined') return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    if (current && phase === 'answering' && listeningPrompt && promptAudioText) {
      speakJapaneseLocal(promptAudioText, 0.85);
    }
  }, [current?.id, phase, listeningPrompt, promptAudioText, practicePrefs.voiceURI]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (current && phase === 'reviewing' && practicePrefs.autoSpeak) {
      speakJapaneseLocal(conjugateItem(current.verb, current.type), 0.9);
    }
  }, [current, phase, practicePrefs.autoSpeak, practicePrefs.voiceURI]);

  useEffect(() => {
    setCoachRevealed(0);
  }, [current?.id, practicePrefs.answerMode]);

  useEffect(() => {
    if (!current) return;
    if (phase !== 'answering') return;
    if (reverseDrill) return;
    if (!['input', 'guided'].includes(practicePrefs.answerMode)) return;
    const exp = reverseDrill ? current.verb.reading : sourceForm;
    const preview = toHiragana(answer);
    if (exp && preview === exp) {
      submit();
    }
  }, [answer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'answering') {
      setRevealedMiss(false);
      setReviewChoiceLabel('');
    }
  }, [current?.id, phase]);

  useEffect(() => {
    setSelfCheckOpen(false);
  }, [current?.id, phase, practicePrefs.answerMode]);

  useEffect(() => {
    setTypoGuard(null);
  }, [current?.id, phase]);

  useEffect(() => {
    if (!['input', 'guided'].includes(practicePrefs.answerMode)) {
      setKanaPadOpen(false);
    }
  }, [practicePrefs.answerMode]);

  useEffect(() => {
    setReviewBase(state.session.reviewed || 0);
  }, [practicePrefs.reviewLimit]);

  useEffect(() => {
    if (practicePrefs.durationSec > 0) {
      setEndAt(Date.now() + practicePrefs.durationSec * 1000);
    } else {
      setEndAt(null);
    }
    setNow(Date.now());
  }, [practicePrefs.durationSec]);

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [endAt]);

  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!current) {
      setAiSentence(null);
      return;
    }
    if (practicePrefs.drillMode !== 'sentence') {
      setAiSentence(null);
      return;
    }

    const key = `${current.verb.group}:${current.verb.dict}|${current.type}`;

    try {
      const cache = JSON.parse(localStorage.getItem('dojo_ai_sentence_cache') || '{}');
      if (cache[key]) {
        setAiSentence({ sentence: cache[key].sentence, translation: cache[key].translation, loading: false, err: '' });
        return;
      }
    } catch (e) {}

    if (geminiKey) {
      setAiSentence({ sentence: '', translation: '', loading: true, err: '' });

      const expectedVal = reverseDrill ? current.verb.reading : sourceForm;
      const targetLabel = getTypeInfo(current.type).label;
      const jlptLevel = getWordMeta(current.verb).jlpt || 'N5';
      const scriptPref =
        practicePrefs.scriptMode === 'hiragana'
          ? 'Write the Japanese sentence in Hiragana only (no Kanji).'
          : practicePrefs.scriptMode === 'romaji'
            ? 'Write the Japanese sentence in Romaji only (English letters).'
            : 'Use standard Japanese writing with Kanji and Hiragana.';
      const prompt = `Create one short, level-appropriate Japanese practice sentence for a learner of JLPT ${jlptLevel}.
${scriptPref}
The sentence must naturally contain the word "${current.verb.dict}" (${current.verb.reading}) conjugated into its "${targetLabel}" form (which is "${expectedVal}").
In the sentence, replace the conjugated form with a blank "[______]".

Return ONLY valid JSON (no markdown formatting, no code block backticks):
{"sentence": "Japanese sentence with [______]", "translation": "English translation"}

Keep it concise and clear.`;

      callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        400,
        0.2,
        'You create short Japanese grammar sentences for quizzes. Return JSON only.'
      )
        .then(reply => {
          const data = extractJSON(reply);
          if (data && data.sentence && data.translation) {
            const resultObj = { sentence: data.sentence, translation: data.translation };
            try {
              const cache = JSON.parse(localStorage.getItem('dojo_ai_sentence_cache') || '{}');
              cache[key] = resultObj;
              localStorage.setItem('dojo_ai_sentence_cache', JSON.stringify(cache));
            } catch (e) {}
            setAiSentence({ ...resultObj, loading: false, err: '' });
          } else {
            throw new Error('Invalid JSON structure from AI.');
          }
        })
        .catch(() => {
          const fallback = getOfflineTemplateSentence(current.verb, current.type);
          setAiSentence({ ...fallback, loading: false, err: '' });
        });
    } else {
      const fallback = getOfflineTemplateSentence(current.verb, current.type);
      setAiSentence({ ...fallback, loading: false, err: '' });
    }
  }, [current?.id, practicePrefs.drillMode, geminiKey]);

  function speakJapaneseLocal(text, rateVal = 0.85) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = rateVal;
    if (practicePrefs.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === practicePrefs.voiceURI);
      if (voice) u.voice = voice;
    }
    window.speechSynthesis.speak(u);
  }

  if (!current) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-12 text-center">
        <p className="text-stone-600 dark:text-stone-300 mb-2">No cards available</p>
        <p className="text-xs text-stone-400 dark:text-stone-500">Enable conjugation types in Settings.</p>
      </div>
    );
  }

  const expected = reverseDrill ? current.verb.reading : sourceForm;
  const promptView = reverseDrill
    ? formDisplay(sourceForm, practicePrefs, current.verb, current.type)
    : promptDisplay(current.verb, promptType, practicePrefs);
  const expectedView = reverseDrill
    ? promptDisplay(current.verb, null, practicePrefs)
    : formDisplay(expected, practicePrefs, current.verb, current.type);
  const promptEnglish = reverseDrill ? englishForForm(current.verb, current.type) : englishForForm(current.verb, promptType);
  const targetEnglish = reverseDrill ? englishForForm(current.verb, null) : englishForForm(current.verb, current.type);
  const englishHintsHidden = (practicePrefs.englishHints || DEFAULT_PREFS.englishHints) === 'hidden';
  const kanaMatchDisplay = practicePrefs.kanaMatchDisplay || DEFAULT_PREFS.kanaMatchDisplay;
  const typeInfo = getTypeInfo(current.type);
  const reviewExplanation =
    phase === 'reviewing'
      ? reverseDrill
        ? explainReversePrompt(current.verb, current.type)
        : explainItem(current.verb, current.type)
      : null;
  const explanation = !wasCorrect ? reviewExplanation : null;
  const diagnostic =
    phase === 'reviewing' && !wasCorrect && !reverseDrill && !revealedMiss
      ? diagnoseItem(current.verb, current.type, answer)
      : '';
  const choices = reverseDrill ? makeReverseChoices(current, practiceWords) : makeChoices(current, practiceWords);
  const wordType = isAdjective(current.verb) ? 'Adjective' : 'Verb';
  const noChangePrompt = !reverseDrill && promptType === current.type;
  const taskLabel = reverseDrill ? `Reverse ${typeInfo.label}` : typeInfo.label;
  const taskHint = reverseDrill ? 'answer with dictionary form' : noChangePrompt ? 'same form; answer may not change' : typeInfo.hint;
  const taskSub = reverseDrill ? '辞書形' : typeInfo.sub;
  const taskOverride = reverseDrill
    ? `Reverse drill: identify the dictionary form from ${typeInfo.label} (${sourceForm})`
    : noChangePrompt
      ? `Trick no-change drill: the prompt is already ${typeInfo.label}, so the correct answer is the same form.`
      : '';
  const reviewLimit = Number(practicePrefs.reviewLimit || 0);
  const reviewsDone = Math.max(0, (state.session.reviewed || 0) - reviewBase);
  const sessionSkipped = state.session?.skipped || 0;
  const reviewSetComplete = reviewLimit > 0 && reviewsDone >= reviewLimit;
  const timeLeft = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : null;
  const hidePromptText = listeningPrompt && phase === 'answering' && !showPromptText;
  const hideEnglishHint = englishHintsHidden && phase === 'answering' && !showEnglishHint;
  const coachPreview = toHiragana(answer);
  const coachProgress = toHiraganaProgress(answer);
  const preview = coachPreview;
  const coachCells = practicePrefs.answerMode === 'guided' ? kanaCoachCells(expected, answer, coachRevealed, phase === 'answering') : [];
  const coachWrongIndex = coachCells.findIndex(c => c.state === 'wrong');
  const coachTypedCount = Array.from(coachProgress).length;
  const expectedKanaCount = Array.from(expected).length;
  const coachStatus =
    coachWrongIndex >= 0
      ? `Kana ${coachWrongIndex + 1} should be ${coachCells[coachWrongIndex].expected}.`
      : coachPreview === expected
        ? 'Complete match. Press Enter.'
        : coachTypedCount > expectedKanaCount
          ? 'Extra kana after the answer.'
          : `${Math.min(coachTypedCount, expectedKanaCount)}/${expectedKanaCount} kana matched.`;
  const liveCells = practicePrefs.answerMode === 'input' && !reverseDrill ? kanaCoachCells(expected, answer, 0, phase === 'answering') : [];
  const liveWrongIndex = liveCells.findIndex(c => c.state === 'wrong' || c.state === 'extra');
  const liveMatched = liveCells.filter(c => c.state === 'correct').length;
  const liveStatus =
    liveWrongIndex >= 0
      ? liveCells[liveWrongIndex].state === 'extra'
        ? 'Extra kana after the answer.'
        : `Kana ${liveWrongIndex + 1} does not match yet.`
      : preview === expected
        ? 'Complete match. Press Enter.'
        : `${Math.min(liveMatched, expectedKanaCount)}/${expectedKanaCount} kana matched.`;
  const reviewKanaCells = ['input', 'guided'].includes(practicePrefs.answerMode) && !reverseDrill
    ? kanaCoachCells(expected, answer, practicePrefs.answerMode === 'guided' ? coachRevealed : 0)
    : [];

  async function generateAIClue() {
    if (!current || !geminiKey) return;
    setAiHintLoading(true);
    setAiHintErr('');
    setAiHintText('');
    try {
      const prompt = `Give one concise non-answer clue for this Japanese conjugation drill. Do NOT reveal the exact answer "${expected}" and do not spell out the full transformed form.\n\nBase word: ${
        current.verb.dict
      } (${current.verb.reading})\nMeaning: ${current.verb.meaning}\nClass: ${
        GROUP_NAMES[current.verb.group] || current.verb.group
      }\nTask: ${
        reverseDrill
          ? `identify the dictionary form from ${typeInfo.label} ${sourceForm}`
          : `transform ${promptFormLabel(current.verb, promptType)} to ${typeInfo.label}`
      }\n\nInclude one semantic hint and one rule cue. Keep it under 30 words.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        220,
        0.25,
        aiSystemFromPrefs(
          practicePrefs,
          'You give safe study hints for Japanese conjugation quizzes. Never reveal the exact answer.'
        )
      );
      setAiHintText(reply);
    } catch (e) {
      setAiHintErr(e.message || 'AI clue failed.');
    }
    setAiHintLoading(false);
  }

  async function generateTypingHint() {
    if (!current || !geminiKey) return;
    setAiTypingHintLoading(true);
    setAiTypingHint('');
    const typedKana = toHiragana(answer) || answer;
    try {
      const prompt = `A student is conjugating a Japanese verb and needs targeted guidance.\n\nBase word: ${current.verb.dict} (${current.verb.reading}), meaning: "${current.verb.meaning}"\nVerb class: ${GROUP_NAMES[current.verb.group] || current.verb.group}\nTask: transform to ${typeInfo.label}${taskSub ? ` (${taskSub})` : ''}${typedKana ? `\nStudent typed so far: "${typedKana}"` : '\nStudent has not typed anything yet.'}\n\nDo NOT reveal the correct answer. Give one short targeted hint (under 20 words) about where to start or what to fix next.`;
      const reply = await callGemini(
        [{ role: 'user', parts: [{ text: prompt }] }],
        geminiKey,
        120,
        0.3,
        aiSystemFromPrefs(practicePrefs, 'You help students learn Japanese conjugation. Never reveal the full correct answer.')
      );
      setAiTypingHint(reply);
    } catch (e) {
      // silently fail — no error shown for inline hint
    }
    setAiTypingHintLoading(false);
  }

  function submit(choiceValue) {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    if (phase === 'reviewing') {
      setChatOpen(false);
      setAnswer('');
      setCoachRevealed(0);
      setRevealedMiss(false);
      setReviewChoiceLabel('');
      setSelfCheckOpen(false);
      setTypoGuard(null);
      setAiTypingHint('');
      setAiTypingHintLoading(false);
      hadKanaMistakeRef.current = false;
      setPhase('answering');
      if (!reviewSetComplete) {
        setCurrent(selectNext(state, practiceWords, enabledTypes, current.id, practicePrefs));
      }
      return;
    }
    const raw = choiceValue !== undefined ? choiceValue : answer;
    if (!raw.trim()) return;
    const normalized = choiceValue !== undefined ? raw : toHiragana(raw);
    const finalOk = reverseDrill ? dictionaryAnswerMatches(raw, current.verb) : normalized === expected;
    const ok = finalOk && !(kanaMatchDisplay !== 'none' && hadKanaMistakeRef.current);
    const nearMiss =
      choiceValue === undefined && !ok ? typoGuardForAnswer(raw, normalized, expected, current.verb, reverseDrill) : null;
    if (nearMiss && typoGuard?.key !== nearMiss.key) {
      setTypoGuard(nearMiss);
      return;
    }
    if (choiceValue !== undefined) setAnswer(raw);
    const dict = current.verb.dict,
      rid = current.id;
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: { ...(state.verbStats?.[dict] || {}), [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) } }
    };
    const nextMistakes = ok
      ? state.mistakes
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? current.type : promptType,
          reverseDrill ? raw.trim() : normalized,
          expected
        );
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      session: {
        ...(state.session || {}),
        reviewed: (state.session?.reviewed || 0) + 1,
        correct: (state.session?.correct || 0) + (ok ? 1 : 0)
      },
      daily: bumpDaily(state.daily, ok, practicePrefs.dailyGoal || 10)
    };
    setState(nextState);
    setChatOpen(!ok && !!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setReviewChoiceLabel('');
    setRevealedMiss(false);
    setSelfCheckOpen(false);
    setWasCorrect(ok);
    setPhase('reviewing');
    const reviewWillComplete = reviewLimit > 0 && reviewsDone + 1 >= reviewLimit;
    if (ok && practicePrefs.autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        if (endAt && Date.now() >= endAt) return;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setAiTypingHint('');
        setAiTypingHintLoading(false);
        hadKanaMistakeRef.current = false;
        setPhase('answering');
        setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
      }, 850);
    }
  }

  function skipCurrent() {
    if (!current) return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const nextState = { ...state, session: { ...(state.session || {}), skipped: (state.session?.skipped || 0) + 1 } };
    setState(nextState);
    setChatOpen(false);
    setAnswer('');
    setCoachRevealed(0);
    setRevealedMiss(false);
    setReviewChoiceLabel('');
    setSelfCheckOpen(false);
    setTypoGuard(null);
    setAiTypingHint('');
    setAiTypingHintLoading(false);
    hadKanaMistakeRef.current = false;
    setPhase('answering');
    setWasCorrect(false);
    setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
  }

  function gradeSelfCheck(ok, label) {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const dict = current.verb.dict,
      rid = current.id;
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: { ...(state.verbStats?.[dict] || {}), [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + (ok ? 0 : 1) } }
    };
    const nextMistakes = ok
      ? state.mistakes
      : recordMistake(
          state.mistakes,
          current.verb,
          current.type,
          reverseDrill ? current.type : promptType,
          `self-check: ${label}`,
          expected
        );
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], ok) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      session: {
        ...(state.session || {}),
        reviewed: (state.session?.reviewed || 0) + 1,
        correct: (state.session?.correct || 0) + (ok ? 1 : 0)
      },
      daily: bumpDaily(state.daily, ok, practicePrefs.dailyGoal || 10)
    };
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setReviewChoiceLabel(label);
    setRevealedMiss(!ok);
    setSelfCheckOpen(false);
    setChatOpen(!ok && !!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setWasCorrect(ok);
    setPhase('reviewing');
    const reviewWillComplete = reviewLimit > 0 && reviewsDone + 1 >= reviewLimit;
    if (ok && practicePrefs.autoAdvanceCorrect && !reviewWillComplete) {
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        if (endAt && Date.now() >= endAt) return;
        setChatOpen(false);
        setAnswer('');
        setCoachRevealed(0);
        setRevealedMiss(false);
        setReviewChoiceLabel('');
        setSelfCheckOpen(false);
        setTypoGuard(null);
        setAiTypingHint('');
        setAiTypingHintLoading(false);
        hadKanaMistakeRef.current = false;
        setPhase('answering');
        setCurrent(selectNext(nextState, practiceWords, enabledTypes, current.id, practicePrefs));
      }, 850);
    }
  }

  function revealAnswer() {
    if (!current || phase !== 'answering') return;
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    const dict = current.verb.dict,
      rid = current.id;
    const prevVS = state.verbStats?.[dict]?.[rid] || { seen: 0, incorrect: 0 };
    const newVerbStats = {
      ...state.verbStats,
      [dict]: { ...(state.verbStats?.[dict] || {}), [rid]: { seen: prevVS.seen + 1, incorrect: prevVS.incorrect + 1 } }
    };
    const nextMistakes = recordMistake(
      state.mistakes,
      current.verb,
      current.type,
      reverseDrill ? current.type : promptType,
      '(revealed)',
      expected
    );
    const nextState = {
      ...state,
      cards: { ...state.cards, [rid]: gradeCard(state.cards[rid], false) },
      verbStats: newVerbStats,
      mistakes: nextMistakes,
      session: { ...(state.session || {}), reviewed: (state.session?.reviewed || 0) + 1, correct: state.session?.correct || 0 },
      daily: bumpDaily(state.daily, false, practicePrefs.dailyGoal || 10)
    };
    setState(nextState);
    setAnswer('');
    setTypoGuard(null);
    setChatOpen(!!geminiKey && !!practicePrefs.autoAiExplainErrors);
    setReviewChoiceLabel("I don't know");
    setSelfCheckOpen(false);
    setRevealedMiss(true);
    setWasCorrect(false);
    setPhase('reviewing');
  }

  function focusAnswerInput() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function insertAnswerText(text) {
    setTypoGuard(null);
    if (kanaMatchDisplay !== 'none' && (practicePrefs.answerMode === 'guided' || !reverseDrill)) {
      const newVal = answer + text;
      const revealed = practicePrefs.answerMode === 'guided' ? coachRevealed : 0;
      const cells = kanaCoachCells(expected, newVal, revealed, true);
      if (cells.some(c => c.state === 'wrong' || c.state === 'extra')) {
        hadKanaMistakeRef.current = true;
      }
    }
    setAnswer(prev => `${prev}${text}`);
    focusAnswerInput();
  }

  function backspaceAnswerText() {
    setTypoGuard(null);
    setAnswer(prev => Array.from(prev).slice(0, -1).join(''));
    focusAnswerInput();
  }

  function clearAnswerText() {
    setTypoGuard(null);
    setAnswer('');
    focusAnswerInput();
  }

  const card = state.cards[current.id];
  if ((reviewSetComplete && phase === 'answering') || timeLeft === 0) {
    return (
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-8 text-center">
        <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-medium mb-2">
          {reviewSetComplete ? 'Review set complete' : 'Timed drill complete'}
        </div>
        <div className="text-4xl font-semibold text-stone-900 dark:text-stone-100 mb-2">
          {state.session.correct}/{state.session.reviewed}
        </div>
        <div className="text-sm text-stone-500 mb-1">
          Session accuracy: {state.session.reviewed ? Math.round((state.session.correct / state.session.reviewed) * 100) : 0}%
        </div>
        {reviewLimit > 0 && <div className="text-xs text-stone-400 mb-5">{Math.min(reviewsDone, reviewLimit)}/{reviewLimit} cards in this set</div>}
        {!reviewLimit && <div className="mb-5" />}
        <button
          onClick={() => {
            setReviewBase(state.session.reviewed || 0);
            setEndAt(practicePrefs.durationSec > 0 ? Date.now() + practicePrefs.durationSec * 1000 : null);
            setNow(Date.now());
            setCurrent(selectNext(state, practiceWords, enabledTypes, current.id, practicePrefs));
            setAnswer('');
            setPhase('answering');
          }}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium"
        >
          {reviewSetComplete ? 'Start another set' : 'Restart timed drill'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        <div className="px-4 py-4 sm:px-6 sm:py-8 text-center relative">
          <div className="absolute top-4 left-4 sm:top-8 sm:left-6 text-[9px] text-stone-400">
            JLPT {getWordMeta(current.verb).jlpt}
          </div>
          {(timeLeft !== null || reviewLimit > 0 || !!sessionSkipped) ? (
            <div className="flex justify-end mb-3">
              <div className="text-xs text-stone-400 text-right shrink-0">
                {timeLeft !== null && (
                  <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                  </div>
                )}
                {reviewLimit > 0 && (
                  <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                    {Math.min(reviewsDone, reviewLimit)}/{reviewLimit} set
                  </div>
                )}
                {!!sessionSkipped && <div className="text-stone-500">{sessionSkipped} skipped</div>}
                <div className="text-[9px]">
                  {[
                    getWordMeta(current.verb).lesson && `Genki L${getWordMeta(current.verb).lesson}`,
                    getWordMeta(current.verb).minnaLesson && `Minna L${getWordMeta(current.verb).minnaLesson}`,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute top-4 right-4 sm:top-8 sm:right-6 text-right text-[9px] text-stone-400">
              {[
                getWordMeta(current.verb).lesson && `Genki L${getWordMeta(current.verb).lesson}`,
                getWordMeta(current.verb).minnaLesson && `Minna L${getWordMeta(current.verb).minnaLesson}`,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          {hidePromptText ? (
            <div className="max-w-md mx-auto rounded-2xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-5">
              <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-3">
                Listening prompt
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => speakJapaneseLocal(promptAudioText, 0.85)}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-1.5"
                >
                  <IconVolume className="w-4 h-4" />
                  Replay
                </button>
                <button
                  onClick={() => setShowPromptText(true)}
                  className="px-3 py-2 border border-indigo-250 bg-white/70 hover:bg-white text-indigo-700 rounded-lg text-sm dark:bg-stone-800 dark:border-stone-700 dark:text-stone-300"
                >
                  Show text
                </button>
              </div>
            </div>
          ) : practicePrefs.drillMode === 'sentence' && aiSentence ? (
            aiSentence.loading ? (
              <div className="text-xl sm:text-2xl text-stone-400 italic py-6 animate-pulse">
                Generating sentence context...
              </div>
            ) : aiSentence.err ? (
              <div className="text-rose-500 py-6 text-sm">{aiSentence.err}</div>
            ) : (
              <div className="text-2xl sm:text-3xl font-medium mb-4 text-center leading-relaxed tracking-wide text-stone-850 dark:text-stone-150" lang="ja">
                {aiSentence.sentence}
              </div>
            )
          ) : (
            <ScriptDisplay
              view={promptView}
              className="text-4xl sm:text-5xl font-medium mb-2 text-stone-900 dark:text-stone-100"
              subClassName="text-base text-stone-500"
            />
          )}
          {promptType && !hidePromptText && (
            <div className="text-xs text-stone-400">
              Base: <span lang="ja">{current.verb.dict}</span>
              {current.verb.dict !== current.verb.reading && <span lang="ja"> · {current.verb.reading}</span>}
            </div>
          )}
          {noChangePrompt && !hidePromptText && (
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-[11px] font-medium">
              Trick: no change needed
            </div>
          )}
          {reverseDrill && !hidePromptText && <div className="text-xs text-stone-400">Answer with the dictionary form.</div>}
          
          {hideEnglishHint ? (
            <div className="mt-3 max-w-md mx-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2 text-xs text-stone-500">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span>English hint hidden until review.</span>
                <button
                  onClick={() => setShowEnglishHint(true)}
                  className="px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-750 dark:text-stone-300"
                >
                  Show hint
                </button>
                <button
                  onClick={generateAIClue}
                  disabled={!geminiKey || aiHintLoading}
                  className="px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 disabled:opacity-40 text-indigo-700 dark:bg-stone-900 dark:border-stone-800 dark:text-indigo-400 inline-flex items-center gap-1"
                >
                  <IconSpark className="w-3.5 h-3.5" />
                  {aiHintLoading ? 'Thinking...' : 'AI clue'}
                </button>
              </div>
              {aiHintText && <div className="mt-2 text-stone-705 dark:text-stone-300 leading-relaxed">{aiHintText}</div>}
              {aiHintErr && <div className="mt-2 text-rose-600">{aiHintErr}</div>}
            </div>
          ) : practicePrefs.drillMode === 'sentence' && aiSentence && !aiSentence.loading ? (
            <div className="text-sm text-stone-500 mt-2 italic">Context: {aiSentence.translation}</div>
          ) : (
            <>
              <div className="text-sm text-stone-500 mt-2 italic">{promptEnglish}</div>
              {aiHintText && phase === 'answering' && (
                <div className="mt-2 text-xs text-stone-500 max-w-md mx-auto rounded-lg border border-indigo-100 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2">
                  {aiHintText}
                </div>
              )}
            </>
          )}

          {phase === 'reviewing' && (
            <div className="text-xs text-stone-400 mt-1">
              {GROUP_NAMES[current.verb.group]} · {wordType}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-1">
            {phase === 'answering' ? (
              <>
                <div className="flex justify-center mb-3">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800/60 shadow-sm">
                    <span className="text-sm font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                      {taskLabel}
                    </span>
                    {taskSub && (
                      <span className="text-sm text-indigo-500 dark:text-indigo-400 font-medium" lang="ja">
                        {taskSub}
                      </span>
                    )}
                    {targetEnglish && targetEnglish !== promptEnglish ? (
                      <span className="text-xs text-indigo-400 dark:text-indigo-500">· {targetEnglish}</span>
                    ) : taskHint ? (
                      <span className="text-xs text-indigo-400 dark:text-indigo-500">· {taskHint}</span>
                    ) : null}
                    {current.ruleLabel && (
                      <span className="text-xs text-indigo-400 dark:text-indigo-500">· {current.ruleLabel}</span>
                    )}
                  </div>
                </div>
                {typoGuard && (
                  <div className="mb-3 rounded-xl border border-amber-250 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                    <div className="font-medium">Almost - possible typo.</div>
                    <div className="text-xs mt-0.5">{typoGuard.detail}</div>
                  </div>
                )}

                {practicePrefs.answerMode === 'self-check' ? (
                  <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4">
                    <div className="text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                      Self-check deck
                    </div>
                    {!selfCheckOpen ? (
                      <>
                        <p className="text-sm text-stone-600 dark:text-stone-400 mb-3">
                          Say or write the answer on your own, then reveal it and grade honestly.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2">
                          <button
                            onClick={() => setSelfCheckOpen(true)}
                            className="py-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl font-medium transition"
                          >
                            Reveal answer
                          </button>
                          <button
                            onClick={skipCurrent}
                            className="py-2.5 border border-stone-250 bg-white hover:bg-stone-50 text-stone-600 rounded-xl font-medium dark:bg-stone-900 dark:border-stone-800 dark:text-stone-300 transition"
                          >
                            Skip without penalty
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-xl bg-white dark:bg-stone-900 border border-stone-205 dark:border-stone-800 px-3 py-3">
                          <div className="text-[11px] uppercase tracking-wider text-stone-400 mb-1">Answer</div>
                          <ScriptDisplay
                            view={expectedView}
                            word={current.verb}
                            type={current.type}
                            colorHighlight={practicePrefs.colorCodeConjugations !== false}
                            className="text-2xl font-semibold text-stone-900 dark:text-stone-100"
                            subClassName="text-xs text-stone-500 mt-1"
                          />
                          <div className="text-xs text-stone-500 mt-2">{targetEnglish}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <button
                            onClick={() => gradeSelfCheck(true, 'Remembered')}
                            className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition"
                          >
                            Remembered
                          </button>
                          <button
                            onClick={() => gradeSelfCheck(false, 'Unsure')}
                            className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-sm font-medium transition"
                          >
                            Unsure
                          </button>
                          <button
                            onClick={() => gradeSelfCheck(false, 'Missed')}
                            className="py-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-xl text-sm font-medium transition"
                          >
                            Missed
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : practicePrefs.answerMode === 'choice' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reverseDrill
                        ? choices.map(w => {
                            const cv = promptDisplay(w, null, practicePrefs);
                            return (
                              <button
                                key={w.dict + ':' + w.reading}
                                onClick={() => submit(w.dict)}
                                className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                              >
                                <ScriptDisplay view={cv} className="text-xl" subClassName="text-xs text-stone-400 mt-1" />
                                {!hideEnglishHint && <div className="mt-1 text-xs text-stone-500">{w.meaning}</div>}
                              </button>
                            );
                          })
                        : choices.map(c => {
                            const cv = formDisplay(c, practicePrefs);
                            return (
                              <button
                                key={c}
                                onClick={() => submit(c)}
                                className="min-h-14 px-3 py-3 border-2 border-stone-200 dark:border-stone-800 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-xl text-xl text-stone-800 dark:text-stone-200 transition"
                              >
                                <ScriptDisplay view={cv} className="text-xl" subClassName="text-xs text-stone-400 mt-1" />
                              </button>
                            );
                          })}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={revealAnswer}
                        className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                      >
                        I don't know
                      </button>
                      <button
                        onClick={skipCurrent}
                        className="py-2.5 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                      >
                        Skip without penalty
                      </button>
                    </div>
                  </>
                ) : practicePrefs.answerMode === 'guided' ? (
                  <>
                    <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3 mb-3">
                      <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                        {coachCells.map((cell, i) => {
                          const cls =
                            kanaMatchDisplay === 'none'
                              ? cell.state === 'empty'
                                ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300'
                                : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                              : cell.state === 'correct'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                                : cell.state === 'wrong' || cell.state === 'extra'
                                  ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                                  : cell.state === 'pending'
                                    ? 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                    : cell.state === 'hint'
                                      ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-805 dark:text-amber-300'
                                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                          return (
                            <div
                              key={i}
                              className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border flex items-center justify-center text-xl font-medium tabular-nums transition ${cls}`}
                            >
                              {cell.shown || '·'}
                            </div>
                          );
                        })}
                      </div>
                      {kanaMatchDisplay === 'color-count' && (
                        <div
                          className={`mt-2 text-xs text-center ${
                            coachWrongIndex >= 0 ? 'text-rose-700' : coachPreview === expected ? 'text-emerald-700' : 'text-stone-500'
                          }`}
                        >
                          {coachStatus}
                        </div>
                      )}
                      {geminiKey && !reverseDrill && answer && (
                        <div className="mt-2 flex flex-col items-center gap-1">
                          <button
                            onClick={generateTypingHint}
                            disabled={aiTypingHintLoading}
                            className="text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-40 inline-flex items-center gap-1 transition"
                          >
                            <IconSpark className="w-3 h-3" />
                            {aiTypingHintLoading ? 'Thinking…' : 'Hint'}
                          </button>
                          {aiTypingHint && (
                            <div className="w-full rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-xs text-stone-700 dark:text-stone-300 text-left">
                              {aiTypingHint}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={answer}
                        onChange={e => {
                          setTypoGuard(null);
                          const newVal = e.target.value;
                          if (kanaMatchDisplay !== 'none') {
                            const cells = kanaCoachCells(expected, newVal, coachRevealed, true);
                            if (cells.some(c => c.state === 'wrong' || c.state === 'extra')) {
                              hadKanaMistakeRef.current = true;
                            }
                          }
                          setAnswer(newVal);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (answer.trim()) submit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            skipCurrent();
                          }
                        }}
                        placeholder={reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'}
                        className="flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-transparent caret-stone-850 dark:caret-stone-150 focus:border-indigo-500 focus:outline-none transition"
                        lang="ja"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                      />
                      <button
                        type="button"
                        onClick={() => setKanaPadOpen(v => !v)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg border text-sm inline-flex items-center gap-1.5 transition ${
                          kanaPadOpen
                            ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                            : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        <IconPen className="w-4 h-4" />
                        Kana pad
                      </button>
                    </div>
                    {answer && coachPreview !== answer && (
                      <div className="mt-2 text-center text-sm text-stone-500" lang="ja">
                        → {coachPreview}
                      </div>
                    )}
                    <KanaInputPad
                      open={kanaPadOpen}
                      onToggle={() => setKanaPadOpen(v => !v)}
                      onInsert={insertAnswerText}
                      onBackspace={backspaceAnswerText}
                      onClear={clearAnswerText}
                      onSubmit={() => submit()}
                      canSubmit={!!answer.trim()}
                      noToggle
                    />
                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => submit()}
                        disabled={!answer.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition disabled:opacity-40"
                      >
                        Check (Enter)
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setCoachRevealed(Math.min(expectedKanaCount, Math.max(coachRevealed, coachTypedCount) + 1))}
                          disabled={coachRevealed >= expectedKanaCount || phase !== 'answering'}
                          className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 disabled:opacity-40 rounded-xl text-sm"
                        >
                          Hint
                        </button>
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-xl text-sm text-amber-800"
                        >
                          Reveal
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-205 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-800 text-stone-605 dark:text-stone-300 rounded-xl text-sm"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={answer}
                        onChange={e => {
                          setTypoGuard(null);
                          const newVal = e.target.value;
                          if (kanaMatchDisplay !== 'none' && !reverseDrill) {
                            const cells = kanaCoachCells(expected, newVal, 0, true);
                            if (cells.some(c => c.state === 'wrong' || c.state === 'extra')) {
                              hadKanaMistakeRef.current = true;
                            }
                          }
                          setAnswer(newVal);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (answer.trim()) submit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            skipCurrent();
                          }
                        }}
                        placeholder={reverseDrill ? 'Type dictionary form...' : 'Type romaji or kana...'}
                        className="flex-1 min-w-0 px-4 py-3 text-xl text-center border-2 border-stone-200 dark:border-stone-805 rounded-xl bg-white dark:bg-stone-950 text-transparent caret-stone-850 dark:caret-stone-150 focus:border-indigo-500 focus:outline-none transition"
                        lang="ja"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                      />
                      <button
                        type="button"
                        onClick={() => setKanaPadOpen(v => !v)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg border text-sm inline-flex items-center gap-1.5 transition ${
                          kanaPadOpen
                            ? 'bg-stone-800 border-stone-800 text-white dark:bg-indigo-600 dark:border-indigo-600 dark:text-white'
                            : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:hover:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        <IconPen className="w-4 h-4" />
                        Kana pad
                      </button>
                    </div>
                    {answer && preview !== answer && (
                      <div className="mt-2 text-center text-sm text-stone-500" lang="ja">
                        → {preview}
                      </div>
                    )}
                    <KanaInputPad
                      open={kanaPadOpen}
                      onToggle={() => setKanaPadOpen(v => !v)}
                      onInsert={insertAnswerText}
                      onBackspace={backspaceAnswerText}
                      onClear={clearAnswerText}
                      onSubmit={() => submit()}
                      canSubmit={!!answer.trim()}
                      noToggle
                    />
                    {!!liveCells.length && (
                      <div className="mt-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3">
                        <div className="flex flex-wrap justify-center gap-1.5" lang="ja">
                          {liveCells.map((cell, i) => {
                            const cls =
                              kanaMatchDisplay === 'none'
                                ? cell.state === 'empty'
                                  ? 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300'
                                  : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                : cell.state === 'correct'
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-805 dark:text-emerald-300'
                                  : cell.state === 'wrong' || cell.state === 'extra'
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-805 dark:text-rose-300'
                                    : cell.state === 'pending'
                                      ? 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300'
                                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                            return (
                              <div
                                key={i}
                                className={`w-9 h-10 sm:w-10 sm:h-11 rounded-xl border flex items-center justify-center text-lg font-medium tabular-nums transition ${cls}`}
                              >
                                {cell.shown || '·'}
                              </div>
                            );
                          })}
                        </div>
                        {kanaMatchDisplay === 'color-count' && (
                          <div
                            className={`mt-2 text-xs text-center ${
                              liveWrongIndex >= 0 ? 'text-rose-700' : preview === expected ? 'text-emerald-700' : 'text-stone-500'
                            }`}
                          >
                            {liveStatus}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-3 space-y-2">
                      <button
                        onClick={() => submit()}
                        disabled={!answer.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition disabled:opacity-40"
                      >
                        Check (Enter)
                      </button>
                      <div className={`grid gap-2 ${geminiKey && !reverseDrill ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        {geminiKey && !reverseDrill && (
                          <button
                            onClick={generateTypingHint}
                            disabled={aiTypingHintLoading}
                            className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition disabled:opacity-40"
                          >
                            {aiTypingHintLoading ? '…' : 'Hint'}
                          </button>
                        )}
                        <button
                          onClick={revealAnswer}
                          className="py-2.5 border border-amber-205 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-medium transition"
                        >
                          Reveal
                        </button>
                        <button
                          onClick={skipCurrent}
                          className="py-2.5 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 hover:bg-stone-105 text-stone-600 dark:text-stone-300 rounded-xl font-medium transition"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                    {aiTypingHint && (
                      <div className="mt-2 rounded-lg border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-950/20 px-3 py-2 text-xs text-stone-700 dark:text-stone-300 text-left">
                        {aiTypingHint}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div
                className={`rounded-xl p-4 ${
                  wasCorrect ? 'bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/50' : 'bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/50'
                }`}
              >
                <div className="flex items-start gap-3 text-left">
                  <div className={`mt-0.5 flex-shrink-0 ${wasCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {wasCorrect ? <IconCheck className="w-5 h-5" /> : <IconX className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${wasCorrect ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800'}`}>
                      {wasCorrect ? 'Correct!' : 'Not quite.'}
                    </div>
                    {!wasCorrect && (
                      <div className="text-xs text-rose-700 mt-1">
                        {reviewChoiceLabel
                          ? `You chose: ${reviewChoiceLabel}`
                          : revealedMiss
                            ? "You chose: I don't know"
                            : 'You wrote:'}{' '}
                        {!revealedMiss && !reviewChoiceLabel && (
                          <span lang="ja" className="font-semibold">
                            {reverseDrill ? answer.trim() || '(empty)' : toHiragana(answer) || '(empty)'}
                          </span>
                        )}
                      </div>
                    )}
                    {reviewKanaCells.length > 0 && (
                      <div className="mt-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 p-2">
                        <div className="flex flex-wrap justify-center gap-1" lang="ja">
                          {reviewKanaCells.map((cell, i) => {
                            const cls =
                              cell.state === 'correct'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                                : cell.state === 'wrong' || cell.state === 'extra'
                                  ? 'bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
                                  : cell.state === 'hint'
                                    ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-300 dark:text-amber-300'
                                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-300';
                            return (
                              <div
                                key={i}
                                className={`w-8 h-9 sm:w-9 sm:h-10 rounded-lg border flex items-center justify-center text-base font-medium tabular-nums ${cls}`}
                              >
                                {cell.shown || '·'}
                              </div>
                            );
                          })}
                        </div>
                        <div className={`mt-1 text-xs text-center ${wasCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {reviewKanaCells.filter(c => c.state === 'correct').length}/{expectedKanaCount} kana matched
                        </div>
                      </div>
                    )}
                    <ScriptDisplay
                      view={expectedView}
                      word={current.verb}
                      type={current.type}
                      colorHighlight={practicePrefs.colorCodeConjugations !== false}
                      className={`text-xl mt-2 ${wasCorrect ? 'text-emerald-900 dark:text-emerald-100' : 'text-rose-900 dark:text-rose-100'}`}
                      subClassName="text-xs text-stone-500 mt-1"
                    />
                    <div className={`text-xs mt-1 ${wasCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-705 dark:text-rose-400'}`}>
                      {targetEnglish}
                    </div>
                    <PitchAccentSection
                      word={current.verb}
                      kanaText={expected}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                    {wasCorrect && practicePrefs.autoAdvanceCorrect && (
                      <div className="text-xs text-emerald-700 mt-2">Next card coming up...</div>
                    )}
                  </div>
                </div>

                <ContextExamplePanel
                  item={current.verb}
                  type={current.type}
                  geminiKey={geminiKey}
                  practicePrefs={practicePrefs}
                />

                {wasCorrect && reviewExplanation && (
                  <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-900/50 space-y-2.5 text-left">
                    <div className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-450 font-medium">
                      Why this is right
                    </div>
                    <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{reviewExplanation.intro}</div>
                    {reviewExplanation.rule && (
                      <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{reviewExplanation.rule}</div>
                    )}
                    {reviewExplanation.derivation && reviewExplanation.derivation !== expected && (
                      <div className="text-base text-center bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100" lang="ja">
                        {reviewExplanation.derivation}
                      </div>
                    )}
                    {reviewExplanation.note && (
                      <div className="text-xs text-stone-605 dark:text-stone-400 italic bg-stone-50/80 dark:bg-stone-950/80 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-800">
                        {reviewExplanation.note}
                      </div>
                    )}
                    <ConjugationBreakdown
                      word={current.verb}
                      type={current.type}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                  </div>
                )}

                {!wasCorrect && explanation && (
                  <div className="mt-4 pt-4 border-t border-rose-200 dark:border-rose-900/50 space-y-2.5 text-left">
                    <div className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400 font-medium">
                      Why it's <span lang="ja" className="normal-case tracking-normal">{expected}</span>
                    </div>
                    {diagnostic && (
                      <div className="text-sm text-rose-800 dark:text-rose-300 bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2">
                        <span className="font-medium text-rose-900 dark:text-rose-200">Likely mix-up: </span>
                        {diagnostic}
                      </div>
                    )}
                    <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{explanation.intro}</div>
                    {explanation.rule && (
                      <div className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">{explanation.rule}</div>
                    )}
                    {explanation.derivation && explanation.derivation !== expected && (
                      <div className="text-base text-center bg-white/70 dark:bg-stone-900/70 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100" lang="ja">
                        {explanation.derivation}
                      </div>
                    )}
                    {explanation.note && (
                      <div className="text-xs text-stone-600 dark:text-stone-400 italic bg-stone-50/80 dark:bg-stone-950/80 rounded-lg px-3 py-2 border border-stone-200 dark:border-stone-800">
                        {explanation.note}
                      </div>
                    )}
                    <ConjugationBreakdown
                      word={current.verb}
                      type={current.type}
                      geminiKey={geminiKey}
                      practicePrefs={practicePrefs}
                    />
                    {geminiKey ? (
                      !chatOpen ? (
                        <button
                          onClick={() => setChatOpen(true)}
                          className="w-full mt-1 py-2 border border-rose-200 dark:border-rose-900 hover:bg-rose-100/50 dark:hover:bg-rose-950/50 rounded-xl text-sm text-rose-700 dark:text-rose-450 flex items-center justify-center gap-1.5 transition"
                        >
                          <IconChat className="w-4 h-4" /> Ask Gemini why
                        </button>
                      ) : (
                        <ChatPanel
                          verb={current.verb}
                          type={current.type}
                          userAnswer={revealedMiss ? '(revealed)' : answer}
                          expected={expected}
                          explanation={explanation}
                          geminiKey={geminiKey}
                          practicePrefs={practicePrefs}
                          taskOverride={taskOverride}
                        />
                      )
                    ) : (
                      <div className="text-xs text-stone-400 text-center pt-1">
                        Add a Gemini API key in Settings to enable AI chat.
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => submit()}
                  autoFocus
                  className="w-full mt-3 py-2.5 bg-stone-800 hover:bg-stone-900 dark:bg-stone-200 dark:hover:bg-stone-150 text-white dark:text-stone-900 rounded-xl font-medium transition"
                >
                  Next (Enter)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-stone-400">
        Tip: type romaji like <span className="font-mono text-stone-500">tabeta</span>, use kana{' '}
        <span lang="ja" className="text-stone-550 dark:text-stone-450">
          たべた
        </span>
        , or press Esc to skip without penalty.
      </div>
    </div>
  );
}
