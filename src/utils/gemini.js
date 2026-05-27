import { toHiragana, isAllKana } from './romaji.js';
import { normalizeJlptLevel } from './conjugator.js';

export const AI_SYSTEM = `You are a friendly Japanese language teacher helping a student who just got a verb conjugation wrong. The student can read hiragana and katakana but struggles with kanji. Always write Japanese in hiragana/katakana with romaji in brackets after it, e.g. たべた [tabeta]. Be warm, encouraging, and concise — 2 to 3 short paragraphs at most. Focus on the specific rule missed and give one extra example.`;
export const AI_COACH_SYSTEM = `You are a concise Japanese conjugation and sentence coach. Analyze verbs and adjectives in context, identify conjugation mistakes, explain the rule, give a natural corrected sentence, and finish with one tiny practice prompt. Keep Japanese readable for learners by adding romaji after key forms.`;

export const AI_FEEDBACK_LEVELS = [
  {id:'beginner',label:'Beginner',prompt:'Use plain English, short sentences, kana plus romaji for every key Japanese form, and no more than one new grammar term at a time.'},
  {id:'expert',label:'Expert JP',prompt:'Give compact, Japanese-heavy feedback. Use Japanese grammar terms when useful, include romaji only after the most important forms, and challenge the learner with one harder contrast.'}
];

export const AI_GUIDE_TONES = [
  {id:'sensei',label:'Calm',prompt:'Sound like a patient teacher: warm, precise, and encouraging without being wordy.'},
  {id:'coach',label:'Coach',prompt:'Sound like an energetic study coach: upbeat, direct, and momentum-building.'},
  {id:'direct',label:'Direct',prompt:'Sound like a concise examiner: minimal praise, clear correction, and one exact next action.'}
];

export function geminiText(d) {
  const parts = d.candidates?.[0]?.content?.parts || [];
  return (parts.find(p => !p.thought) || parts[0])?.text || '';
}

export function normalizeGroup(g) {
  if(!g)return null;
  const v=g.toLowerCase();
  if(v.includes('ichidan')||v.includes('ru-verb')||v.includes('group 2'))return'ichidan';
  if(v.includes('godan')||v.includes('u-verb')||v.includes('group 1'))return'godan';
  if(v.includes('suru'))return'suru';
  if(v.includes('kuru'))return'kuru';
  if(v.includes('i-adjective'))return'i-adjective';
  if(v.includes('na-adjective'))return'na-adjective';
  return null;
}

export function extractJSON(text) {
  for(let i=0;i<text.length;i++){
    if(text[i]!=='{')continue;
    let depth=0,inStr=false;
    for(let j=i;j<text.length;j++){
      const c=text[j];
      if(inStr){if(c==='\\')j++;else if(c==='"')inStr=false;}
      else if(c==='"')inStr=true;
      else if(c==='{')depth++;
      else if(c==='}'){if(!--depth){try{return JSON.parse(text.slice(i,j+1));}catch(e){break;}}}
    }
  }
  return null;
}

export async function callGemini(contents, apiKey, maxTokens=600, temp=0.7, systemText=AI_SYSTEM) {
  if(!apiKey)throw new Error('No Gemini API key — add it in Settings.');
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({contents,systemInstruction:{parts:[{text:systemText}]},generationConfig:{maxOutputTokens:maxTokens,temperature:temp}})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message||`HTTP ${r.status}`);
  return geminiText(d);
}

export function aiSystemFromPrefs(prefs, base=AI_SYSTEM) {
  const levelVal = prefs?.aiFeedbackLevel || 'beginner';
  const toneVal = prefs?.aiGuideTone || 'sensei';
  const level=AI_FEEDBACK_LEVELS.find(o=>o.id===levelVal)||AI_FEEDBACK_LEVELS[0];
  const tone=AI_GUIDE_TONES.find(o=>o.id===toneVal)||AI_GUIDE_TONES[0];
  return `${base}\n\nFeedback depth: ${level.prompt}\nGuide voice: ${tone.prompt}`;
}

export async function lookupWordWithGemini(query, apiKey, isAdj=false) {
  if(!apiKey)throw new Error('No Gemini API key set');
  const typeStr = isAdj ? 'adjective' : 'verb';
  const groupOptions = isAdj ? 'i-adjective or na-adjective' : 'ichidan or godan or suru or kuru';
  const meaningStr = isAdj ? 'English meaning' : 'English meaning starting with to';
  const prompt=`Look up this Japanese ${typeStr}: "${query}"\n\nReturn ONLY a JSON object (no markdown, no extra text):\n{"dict":"kanji/kana dictionary form or stem","reading":"hiragana only","meaning":"${meaningStr}","group":"${groupOptions}"}\n\nIf the input is English or romaji, find the most common Japanese ${typeStr} for that meaning.`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1024,temperature:0.1,thinkingConfig:{thinkingBudget:0}}})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message||`HTTP ${r.status}`);
  const result=extractJSON(geminiText(d));
  if(result)result.group=normalizeGroup(result.group);
  if(!result||!result.dict||!result.reading||!result.meaning||!result.group)
    throw new Error('Unexpected AI response — try a different input');
  return result;
}

export async function getSuggestedWord(existing, apiKey, isAdj=false) {
  if(!apiKey)throw new Error('No Gemini API key set');
  const typeStr = isAdj ? 'adjective' : 'verb';
  const groupOptions = isAdj ? 'i-adjective or na-adjective' : 'ichidan or godan or suru or kuru';
  const list=existing.map(v=>`${v.dict} (${v.reading}) — ${v.meaning} [${v.group}]`).join('\n');
  const prompt=`I'm learning Japanese ${typeStr} conjugation with an SRS app. Here are the ${existing.length} ${typeStr}s I'm already studying:\n\n${list}\n\nBased on my current vocabulary, suggest ONE new ${typeStr} to add next. Consider JLPT frequency, useful patterns I haven't covered, and what learners at this level typically need. Do NOT suggest any ${typeStr} already in my list.\n\nReturn ONLY a JSON object (no markdown):\n{"dict":"e.g. dict form","reading":"e.g. hiragana reading","meaning":"e.g. English meaning","group":"${groupOptions}","reason":"One sentence explaining why this is a good next ${typeStr} for me."}`;
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1024,temperature:0.9,thinkingConfig:{thinkingBudget:0}}})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error?.message||`HTTP ${r.status}`);
  const result=extractJSON(geminiText(d));
  if(result)result.group=normalizeGroup(result.group);
  if(!result||!result.dict||!result.reading||!result.meaning||!result.group)throw new Error('Unexpected AI response');
  return result;
}

export function normalizeScannerGroup(v) {
  if(!v)return null;
  if(v.includes('i-adjective')||v.includes('i adjective')||v.includes('i-adj')||v.includes('い-adj')||v.includes('い adjective')||v.includes('い形容詞'))return'i-adjective';
  if(v.includes('na-adjective')||v.includes('na adjective')||v.includes('na-adj')||v.includes('な-adj')||v.includes('な adjective')||v.includes('な形容詞'))return'na-adjective';
  return normalizeGroup(v);
}

export function parseScannerAIWords(text){
  const data=typeof text==='string'?extractJSON(text):text;
  const rows=Array.isArray(data?.words)?data.words:[];
  const seen=new Set();
  return rows.map(row=>{
    const group=normalizeScannerGroup(row.group);
    const dict=String(row.dict||'').trim();
    const reading=toHiragana(String(row.reading||'').trim());
    const meaning=String(row.meaning||'').trim();
    if(!dict||!reading||!meaning||!group||!isAllKana(reading))return null;
    const key=`${group}:${dict}`;
    if(seen.has(key))return null;
    seen.add(key);
    const jlpt=normalizeJlptLevel(row.jlpt||row.level);
    return{dict,reading,meaning,group,evidence:String(row.evidence||row.surface||'').trim(),...(jlpt?{jlpt}:{})};
  }).filter(Boolean);
}
