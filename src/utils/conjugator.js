import { toHiragana } from './romaji.js';
import {
  CONJ_TYPES,
  ADJ_TYPES,
  ALL_CARD_TYPES,
  TYPE_LABEL,
  getTypeInfo,
  TYPE_PREVIEW_VERBS,
  TYPE_PREVIEW_ADJECTIVES
} from '../data/conjugationTypes.js';
import {
  WORD_META,
  JLPT_LEVELS,
  WORD_TYPE_OPTIONS,
  WORD_GROUP_OPTIONS,
  GENKI_LESSONS,
  MINNA_LESSONS
} from '../data/starterWords.js';
import { DEFAULT_PREFS } from '../data/defaults.js';

// ============================================================================
// DATA FILTERING & METADATA HELPERS
// ============================================================================
export function normalizeJlptLevel(value){
  const m=String(value||'').trim().toUpperCase().match(/^N[1-5]$/);
  return m?m[0]:null;
}

export function getWordMeta(word){
  const embedded={};
  const jlpt=normalizeJlptLevel(word?.jlpt||word?.level);
  if(jlpt)embedded.jlpt=jlpt;
  if(word?.lesson)embedded.lesson=Number(word.lesson)||null;
  if(word?.minnaLesson)embedded.minnaLesson=Number(word.minnaLesson)||null;
  return{jlpt:'N3',lesson:null,minnaLesson:null,...(WORD_META[word?.dict] || {}),...embedded};
}

export function isIrregularAdjective(word){
  return !!(word&&word.group==='i-adjective'&&(word.irregular||word.reading==='いい'||word.reading==='かっこいい'||word.dict==='いい'||word.dict==='良い'));
}

export function wordKind(word){
  return isAdjective(word)?word.group:'verb';
}

export function wordGroupId(word){
  return isIrregularAdjective(word)?'irregular-adjective':word.group;
}

export function classifyGroupId(word){
  return wordGroupId(word);
}

export function wordKey(word){
  return`${word.group}:${word.dict}`;
}

export function filterWordsForPrefs(words,prefs=DEFAULT_PREFS,wordLists=[]){
  const levels=prefs.jlptLevels&&prefs.jlptLevels.length?prefs.jlptLevels:JLPT_LEVELS;
  const types=prefs.wordTypes&&prefs.wordTypes.length?prefs.wordTypes:WORD_TYPE_OPTIONS.map(o=>o.id);
  const groups=prefs.wordGroups&&prefs.wordGroups.length?prefs.wordGroups:WORD_GROUP_OPTIONS.map(o=>o.id);
  const lessonFilter=Array.isArray(prefs.genkiLessons)&&prefs.genkiLessons.length&&prefs.genkiLessons.length<GENKI_LESSONS.length?new Set(prefs.genkiLessons.map(Number)):null;
  const minnaFilter=Array.isArray(prefs.minnaLessons)&&prefs.minnaLessons.length&&prefs.minnaLessons.length<MINNA_LESSONS.length?new Set(prefs.minnaLessons.map(Number)):null;
  const selectedLists=prefs.wordListIds&&prefs.wordListIds.length?prefs.wordListIds:[];
  const allowedKeys=selectedLists.length?new Set(wordLists.filter(l=>selectedLists.includes(l.id)).flatMap(l=>l.wordKeys||[])):null;
  return words.filter(w=>{
    const meta=getWordMeta(w);
    const passesLesson=!lessonFilter&&!minnaFilter
      ||(lessonFilter&&lessonFilter.has(meta.lesson))
      ||(minnaFilter&&minnaFilter.has(meta.minnaLesson));
    return levels.includes(meta.jlpt) &&
           types.includes(wordKind(w)) &&
           groups.includes(wordGroupId(w)) &&
           passesLesson &&
           (!allowedKeys||allowedKeys.has(wordKey(w)));
  });
}

export function typePreviewItems(typeId){
  return ADJ_TYPES.some(t=>t.id===typeId)?TYPE_PREVIEW_ADJECTIVES:TYPE_PREVIEW_VERBS;
}

export function typePreviewValues(typeId){
  return typePreviewItems(typeId).map(item=>({item,answer:conjugateItem(item,typeId)})).filter(x=>x.answer);
}

export function compatibleTypes(item){
  return isAdjective(item)?ADJ_TYPES:CONJ_TYPES;
}

export function isTypeCompatible(item,typeId){
  return compatibleTypes(item).some(t=>t.id===typeId);
}

export function enabledTypeIdsFor(enabledTypeIds){
  return enabledTypeIds&&enabledTypeIds.length?enabledTypeIds:ALL_CARD_TYPES.map(t=>t.id);
}

export function practiceTypesForItem(item,enabledTypeIds,prefs=DEFAULT_PREFS){
  const enabled=new Set(enabledTypeIdsFor(enabledTypeIds));
  const skip=prefs.skipDuplicateForms!==false;
  const seen=new Set();
  return compatibleTypes(item).filter(t=>{
    if(!enabled.has(t.id))return false;
    const answer=conjugateItem(item,t.id);
    if(!answer)return false;
    if(skip&&seen.has(answer))return false;
    seen.add(answer);
    return true;
  });
}

export function isRedundantPracticeType(item,typeId,enabledTypeIds,prefs=DEFAULT_PREFS){
  // A form with no valid conjugation (e.g. short causative-passive on an
  // ichidan/す-godan/する verb) can never be practiced — it would surface as a
  // blank card. Exclude it regardless of the duplicate-skipping preference.
  if(!conjugateItem(item,typeId))return true;
  if(prefs.skipDuplicateForms===false)return false;
  return !practiceTypesForItem(item,enabledTypeIds,prefs).some(t=>t.id===typeId);
}

export function hashString(s){
  let h=0;
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;
  return Math.abs(h);
}

export function resolveDisplayScripts(prefs=DEFAULT_PREFS){
  const ds=prefs.displayScripts;
  if(ds&&(ds.kanji||ds.kana||ds.romaji))return{kanji:!!ds.kanji,kana:!!ds.kana,romaji:!!ds.romaji};
  if(prefs.scriptMode==='hiragana')return{kanji:false,kana:true,romaji:false};
  if(prefs.scriptMode==='romaji')return{kanji:false,kana:false,romaji:true};
  if(prefs.scriptMode==='all')return{kanji:true,kana:true,romaji:true};
  return{kanji:true,kana:true,romaji:false};
}

export function pickPromptType(item,targetType,prefs=DEFAULT_PREFS){
  const source=prefs.promptForm||'dictionary';
  const allowTrick=!!prefs.trickQuestions;
  const types=compatibleTypes(item).filter(t=>allowTrick||t.id!==targetType);
  if(source==='dictionary'||!types.length)return null;
  if(source==='random')return types[hashString(`${item.dict}|${targetType}|${allowTrick?'trick':'normal'}|${JSON.stringify(resolveDisplayScripts(prefs))}`)%types.length].id;
  if(isTypeCompatible(item,source)&&(allowTrick||source!==targetType))return source;
  return null;
}

export function promptFormLabel(item,promptType){
  if(!promptType)return isAdjective(item)?'Dictionary adjective':'Dictionary verb';
  return getTypeInfo(promptType).label;
}

// ============================================================================
// CONJUGATION ENGINE
// ============================================================================
export const A_ROW = {う:'わ',く:'か',ぐ:'が',す:'さ',つ:'た',ぬ:'な',ぶ:'ば',む:'ま',る:'ら'};
export const I_ROW = {う:'い',く:'き',ぐ:'ぎ',す:'し',つ:'ち',ぬ:'に',ぶ:'び',む:'み',る:'り'};
export const E_ROW = {う:'え',く:'け',ぐ:'げ',す:'せ',つ:'て',ぬ:'ね',ぶ:'べ',む:'め',る:'れ'};
export const O_ROW = {う:'お',く:'こ',ぐ:'ご',す:'そ',つ:'と',ぬ:'の',ぶ:'ぼ',む:'も',る:'ろ'};
export const PAST_END = {く:'いた',ぐ:'いだ',す:'した',つ:'った',う:'った',る:'った',ぬ:'んだ',ぶ:'んだ',む:'んだ'};
export const TE_END = {く:'いて',ぐ:'いで',す:'して',つ:'って',う:'って',る:'って',ぬ:'んで',ぶ:'んで',む:'んで'};
export const ONBIN_TE_CHOICES = ['て','って','んで','いて','いで','して','きて'];
export const ONBIN_TA_CHOICES = ['た','った','んだ','いた','いだ','した','きた'];

export const ONBIN_PATTERN_META = {
  ichidan:{label:'ichidan る',cue:'Drop る, add て / た.',group:'る'},
  utsuru:{label:'う・つ・る',cue:'う・つ・る compress to small っ.',group:'っ'},
  mnb:{label:'む・ぶ・ぬ',cue:'む・ぶ・ぬ become ん + voiced ending.',group:'ん'},
  ku:{label:'く',cue:'く becomes いて / いた.',group:'い'},
  gu:{label:'ぐ',cue:'ぐ becomes いで / いだ.',group:'い'},
  su:{label:'す',cue:'す becomes して / した.',group:'し'},
  iku:{label:'行く exception',cue:'行く is the famous exception: いって / いった.',group:'っ'},
  suru:{label:'する',cue:'する becomes して / した.',group:'し'},
  kuru:{label:'来る',cue:'来る becomes きて / きた.',group:'き'}
};

export function onbinPatternForVerb(verb){
  if(!verb)return ONBIN_PATTERN_META.ichidan;
  if(verb.group==='ichidan')return ONBIN_PATTERN_META.ichidan;
  if(verb.group==='suru')return ONBIN_PATTERN_META.suru;
  if(verb.group==='kuru')return ONBIN_PATTERN_META.kuru;
  if(verb.group==='godan'){
    const r=verb.reading;
    if(r==='いく'||r.endsWith('いく'))return ONBIN_PATTERN_META.iku;
    const last=r.slice(-1);
    if(['う','つ','る'].includes(last))return ONBIN_PATTERN_META.utsuru;
    if(['む','ぶ','ぬ'].includes(last))return ONBIN_PATTERN_META.mnb;
    if(last==='く')return ONBIN_PATTERN_META.ku;
    if(last==='ぐ')return ONBIN_PATTERN_META.gu;
    if(last==='す')return ONBIN_PATTERN_META.su;
  }
  return ONBIN_PATTERN_META.ichidan;
}

export function onbinStem(verb){
  if(!verb)return'';
  if(verb.group==='suru'&&verb.reading.endsWith('する'))return verb.reading.slice(0,-2);
  if(verb.group==='kuru'&&verb.reading.endsWith('くる'))return verb.reading.slice(0,-2);
  return verb.reading.slice(0,-1);
}

export function onbinTailFor(verb,targetType){
  const expected=conjugate(verb,targetType);
  const stem=onbinStem(verb);
  return expected.startsWith(stem)?expected.slice(stem.length):expected;
}

export function desiderativeStem(verb){
  const{reading,group}=verb;
  if(group==='ichidan')return reading.slice(0,-1);
  if(group==='godan'){const last=reading.slice(-1);return reading.slice(0,-1)+I_ROW[last];}
  if(group==='suru')return(reading.endsWith('する')?reading.slice(0,-2):'')+'し';
  if(group==='kuru')return(reading.endsWith('くる')?reading.slice(0,-2):'')+'き';
  return reading;
}

export function shortCausativePassive(verb){
  const{reading,group}=verb;
  if(group==='godan'){
    const stem=reading.slice(0,-1),last=reading.slice(-1);
    if(last==='す')return'';
    return stem+A_ROW[last]+'される';
  }
  if(group==='kuru')return(reading.endsWith('くる')?reading.slice(0,-2):'')+'こさされる';
  return'';
}

export function shortCausative(verb){
  const{reading,group}=verb;
  if(group==='ichidan')return reading.slice(0,-1)+'さす';
  if(group==='godan'){
    const last=reading.slice(-1),stem=reading.slice(0,-1);
    return stem+A_ROW[last]+'す';
  }
  if(group==='suru')return(reading.endsWith('する')?reading.slice(0,-2):'')+'さす';
  if(group==='kuru')return(reading.endsWith('くる')?reading.slice(0,-2):'')+'こさす';
  return'';
}

export function conjugateShortCausative(verb,targetType){
  const form=shortCausative(verb);
  return form?conjugate({reading:form,dict:form,meaning:verb.meaning,group:'godan'},targetType):'';
}

export const KEIGO_SPECIALS = {
  たべる:{honorific:'めしあがる',humble:'いただく'},
  のむ:{honorific:'めしあがる',humble:'いただく'},
  みる:{honorific:'ごらんになる',humble:'はいけんする'},
  きる:{honorific:'おめしになる',humble:''},
  ねる:{honorific:'おやすみになる',humble:'やすませていただく'},
  しぬ:{honorific:'おなくなりになる',humble:''},
  いく:{honorific:'いらっしゃる',humble:'まいる'},
  くる:{honorific:'いらっしゃる',humble:'まいる'},
  いる:{honorific:'いらっしゃる',humble:'おる'},
  する:{honorific:'なさる',humble:'いたす'},
  いう:{honorific:'おっしゃる',humble:'もうす'},
  きく:{honorific:'おききになる',humble:'うかがう'},
  たずねる:{honorific:'おたずねになる',humble:'うかがう'},
  あう:{honorific:'おあいになる',humble:'おめにかかる'},
  かりる:{honorific:'おかりになる',humble:'はいしゃくする'},
  あげる:{honorific:'くださる',humble:'さしあげる'},
  もらう:{honorific:'おもらいになる',humble:'いただく'},
  くれる:{honorific:'くださる',humble:''},
  しる:{honorific:'ごぞんじである',humble:'ぞんじる'}
};

export const KEIGO_POLITE_OVERRIDES = {
  なさる:'なさいます',
  いらっしゃる:'いらっしゃいます',
  おっしゃる:'おっしゃいます',
  くださる:'くださいます',
  ござる:'ございます',
  ぞんじる:'ぞんじます',
  さしあげる:'さしあげます',
  ごぞんじである:'ごぞんじです'
};

export function regularHonorificForm(verb){
  if(!verb)return'';
  if(verb.group==='suru'){
    const stem=verb.reading.endsWith('する')?verb.reading.slice(0,-2):'';
    return stem?stem+'なさる':'なさる';
  }
  if(verb.group==='kuru')return(verb.reading.endsWith('くる')?verb.reading.slice(0,-2):'')+'いらっしゃる';
  const stem=conjugate(verb,'masu-stem');
  return stem?'お'+stem+'になる':'';
}

export function regularHumbleForm(verb){
  if(!verb)return'';
  if(verb.group==='suru'){
    const stem=verb.reading.endsWith('する')?verb.reading.slice(0,-2):'';
    return stem?stem+'いたす':'いたす';
  }
  if(verb.group==='kuru')return(verb.reading.endsWith('くる')?verb.reading.slice(0,-2):'')+'まいる';
  const stem=conjugate(verb,'masu-stem');
  return stem?'お'+stem+'する':'';
}

export function keigoForm(verb,kind){
  const special=KEIGO_SPECIALS[verb?.reading]?.[kind];
  if(special!==undefined)return special;
  return kind==='honorific'?regularHonorificForm(verb):regularHumbleForm(verb);
}

export function politeKeigoForm(form){
  if(!form)return'';
  if(KEIGO_POLITE_OVERRIDES[form])return KEIGO_POLITE_OVERRIDES[form];
  for(const[plain,polite]of Object.entries(KEIGO_POLITE_OVERRIDES)){
    if(form.endsWith(plain))return form.slice(0,-plain.length)+polite;
  }
  if(form.endsWith('する'))return form.slice(0,-2)+'します';
  const last=form.slice(-1),stem=form.slice(0,-1);
  if(I_ROW[last])return stem+I_ROW[last]+'ます';
  if(form.endsWith('る'))return stem+'ます';
  return'';
}

export function politeRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'ます':'';}
export function politePastRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'ました':'';}
export function pastRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'た':'';}
export function pastNegativeRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'なかった':'';}
export function conditionalRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'れば':'';}
export function negativeRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'ない':'';}
export function politeNegativeRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'ません':'';}
export function politePastNegativeRuForm(form){return form&&form.endsWith('る')?form.slice(0,-1)+'ませんでした':'';}
export function negativeBaForm(form){return form&&form.endsWith('ない')?form.slice(0,-2)+'なければ':'';}
export function negativeTeConnectiveForm(form){return form&&form.endsWith('ない')?form.slice(0,-2)+'なくて':'';}

export function negativeZuForm(verb){
  const{reading,group}=verb;
  if(group==='ichidan')return reading.slice(0,-1)+'ず';
  if(group==='godan'){
    const stem=reading.slice(0,-1),last=reading.slice(-1);
    return stem+A_ROW[last]+'ず';
  }
  if(group==='suru')return(reading.endsWith('する')?reading.slice(0,-2):'')+'せず';
  if(group==='kuru')return(reading.endsWith('くる')?reading.slice(0,-2):'')+'こず';
  return'';
}

export function negativeZuniForm(verb){const form=negativeZuForm(verb);return form?form+'に':'';}
export function progressiveAspectForm(verb,ending){
  const te=conjugate(verb,'te-form');
  return te?te+ending:'';
}

export function commandNasaiForm(verb){
  const stem=conjugate(verb,'masu-stem');
  return stem?stem+'なさい':'';
}

export function conjugate(verb,type){
  const{reading,group}=verb;
  if(type==='honorific')return keigoForm(verb,'honorific');
  if(type==='humble')return keigoForm(verb,'humble');
  if(type==='honorific-polite')return politeKeigoForm(keigoForm(verb,'honorific'));
  if(type==='humble-polite')return politeKeigoForm(keigoForm(verb,'humble'));
  const shortCausativeBase={'short-causative':'plain-present','short-causative-polite':'polite-present','short-causative-negative':'plain-negative','short-causative-polite-negative':'polite-negative','short-causative-past':'plain-past','short-causative-polite-past':'polite-past','short-causative-past-negative':'plain-past-negative','short-causative-polite-past-negative':'polite-past-negative','short-causative-conditional-ba':'conditional-ba','short-causative-negative-conditional-ba':'negative-conditional-ba'}[type];
  if(shortCausativeBase)return conjugateShortCausative(verb,shortCausativeBase);
  const politeBase={'potential-polite':'potential','passive-polite':'passive','causative-polite':'causative','causative-passive-polite':'causative-passive','short-causative-passive-polite':'short-causative-passive'}[type];
  if(politeBase)return politeRuForm(conjugate(verb,politeBase));
  const politePastBase={'potential-polite-past':'potential','passive-polite-past':'passive','causative-polite-past':'causative','causative-passive-polite-past':'causative-passive','short-causative-passive-polite-past':'short-causative-passive'}[type];
  if(politePastBase)return politePastRuForm(conjugate(verb,politePastBase));
  const pastBase={'potential-past':'potential','passive-past':'passive','causative-past':'causative','causative-passive-past':'causative-passive','short-causative-passive-past':'short-causative-passive'}[type];
  if(pastBase)return pastRuForm(conjugate(verb,pastBase));
  const pastNegBase={'potential-past-negative':'potential','passive-past-negative':'passive','causative-past-negative':'causative','causative-passive-past-negative':'causative-passive','short-causative-passive-past-negative':'short-causative-passive'}[type];
  if(pastNegBase)return pastNegativeRuForm(conjugate(verb,pastNegBase));
  const conditionalBase={'potential-conditional-ba':'potential','passive-conditional-ba':'passive','causative-conditional-ba':'causative','causative-passive-conditional-ba':'causative-passive','short-causative-passive-conditional-ba':'short-causative-passive'}[type];
  if(conditionalBase)return conditionalRuForm(conjugate(verb,conditionalBase));
  const negativeBase={'causative-passive-negative':'causative-passive','short-causative-passive-negative':'short-causative-passive'}[type];
  if(negativeBase)return negativeRuForm(conjugate(verb,negativeBase));
  const negativeBaBase={'negative-conditional-ba':'plain-negative','potential-negative-conditional-ba':'potential-negative','passive-negative-conditional-ba':'passive-negative','causative-negative-conditional-ba':'causative-negative','causative-passive-negative-conditional-ba':'causative-passive-negative','short-causative-passive-negative-conditional-ba':'short-causative-passive-negative'}[type];
  if(negativeBaBase)return negativeBaForm(conjugate(verb,negativeBaBase));
  if(type==='negative-te-connective')return negativeTeConnectiveForm(conjugate(verb,'plain-negative'));
  if(type==='negative-zu')return negativeZuForm(verb);
  if(type==='negative-zuni')return negativeZuniForm(verb);
  const progressiveEnding={'progressive':'いる','progressive-polite':'います','progressive-negative':'いない','progressive-polite-negative':'いません','progressive-past':'いた','progressive-polite-past':'いました','progressive-past-negative':'いなかった','progressive-polite-past-negative':'いませんでした'}[type];
  if(progressiveEnding)return progressiveAspectForm(verb,progressiveEnding);
  if(type==='command-nasai')return commandNasaiForm(verb);
  const politeNegBase={'potential-polite-negative':'potential','passive-polite-negative':'passive','causative-polite-negative':'causative','causative-passive-polite-negative':'causative-passive','short-causative-passive-polite-negative':'short-causative-passive'}[type];
  if(politeNegBase)return politeNegativeRuForm(conjugate(verb,politeNegBase));
  const politePastNegBase={'potential-polite-past-negative':'potential','passive-polite-past-negative':'passive','causative-polite-past-negative':'causative','causative-passive-polite-past-negative':'causative-passive','short-causative-passive-polite-past-negative':'short-causative-passive'}[type];
  if(politePastNegBase)return politePastNegativeRuForm(conjugate(verb,politePastNegBase));
  if(type==='short-causative-passive')return shortCausativePassive(verb);
  if(type==='desiderative')return desiderativeStem(verb)+'たい';
  if(type==='desiderative-polite')return desiderativeStem(verb)+'たいです';
  if(type==='desiderative-negative')return desiderativeStem(verb)+'たくない';
  if(type==='desiderative-polite-negative')return desiderativeStem(verb)+'たくないです';
  if(type==='desiderative-past')return desiderativeStem(verb)+'たかった';
  if(type==='desiderative-polite-past')return desiderativeStem(verb)+'たかったです';
  if(type==='desiderative-past-negative')return desiderativeStem(verb)+'たくなかった';
  if(type==='desiderative-polite-past-negative')return desiderativeStem(verb)+'たくなかったです';
  if(group==='ichidan'){
    const stem=reading.slice(0,-1);
    const te=stem+'て',neg=stem+'ない',past=stem+'た';
    const M={
      'plain-present':reading,'plain-past':past,'plain-negative':neg,'plain-past-negative':stem+'なかった',
      'polite-present':stem+'ます','polite-past':stem+'ました','polite-negative':stem+'ません','polite-past-negative':stem+'ませんでした',
      'masu-stem':stem,'polite-volitional':stem+'ましょう','polite-te':stem+'まして','polite-conditional-tara':stem+'ましたら',
      'te-form':te,'potential':stem+'られる','potential-negative':stem+'られない','volitional':stem+'よう','conditional-tara':past+'ら','negative-conditional-tara':stem+'なかったら','conditional-ba':stem+'れば',
      'conditional-nara':reading+'なら','conjectural':reading+'だろう','imperative':stem+'ろ','passive':stem+'られる','passive-negative':stem+'られない',
      'causative':stem+'させる','causative-negative':stem+'させない','causative-passive':stem+'させられる',
      'desiderative':stem+'たい','progressive':te+'いる','negative-te':neg+'で','prohibition':reading+'な',
      'request-kudasai':te+'ください','negative-request':neg+'でください','permission':te+'もいい','obligation':neg.slice(0,-1)+'ければならない'
    };
    return M[type]||'';
  }
  if(group==='godan'){
    const stem=reading.slice(0,-1),last=reading.slice(-1);
    let pastEnd=PAST_END[last],teEnd=TE_END[last];
    if(reading==='いく'||reading.endsWith('いく')){pastEnd='った';teEnd='って';}
    const neg=reading==='ある'?'ない':stem+A_ROW[last]+'ない';
    const pastNeg=reading==='ある'?'なかった':stem+A_ROW[last]+'なかった';
    const te=stem+teEnd,past=stem+pastEnd,iStem=stem+I_ROW[last],aStem=stem+A_ROW[last],eStem=stem+E_ROW[last],oStem=stem+O_ROW[last];
    const M={
      'plain-present':reading,'plain-past':past,'plain-negative':neg,'plain-past-negative':pastNeg,
      'polite-present':iStem+'ます','polite-past':iStem+'ました','polite-negative':iStem+'ません','polite-past-negative':iStem+'ませんでした',
      'masu-stem':iStem,'polite-volitional':iStem+'ましょう','polite-te':iStem+'まして','polite-conditional-tara':iStem+'ましたら',
      'te-form':te,'potential':eStem+'る','potential-negative':eStem+'ない','volitional':oStem+'う','conditional-tara':past+'ら','negative-conditional-tara':pastNeg+'ら','conditional-ba':eStem+'ば',
      'conditional-nara':reading+'なら','conjectural':reading+'だろう','imperative':eStem,'passive':aStem+'れる','passive-negative':aStem+'れない',
      'causative':aStem+'せる','causative-negative':aStem+'せない','causative-passive':aStem+'せられる',
      'desiderative':iStem+'たい','progressive':te+'いる','negative-te':neg+'で','prohibition':reading+'な',
      'request-kudasai':te+'ください','negative-request':neg+'でください','permission':te+'もいい','obligation':neg.slice(0,-1)+'ければならない'
    };
    return M[type]||'';
  }
  if(group==='suru'){
    const stem=reading.endsWith('する')&&reading!=='する'?reading.slice(0,-2):'';
    const M={
      'plain-present':'する','plain-past':'した','plain-negative':'しない','plain-past-negative':'しなかった',
      'polite-present':'します','polite-past':'しました','polite-negative':'しません','polite-past-negative':'しませんでした',
      'masu-stem':'し','polite-volitional':'しましょう','polite-te':'しまして','polite-conditional-tara':'しましたら',
      'te-form':'して','potential':'できる','potential-negative':'できない','volitional':'しよう','conditional-tara':'したら','negative-conditional-tara':'しなかったら','conditional-ba':'すれば',
      'conditional-nara':'するなら','conjectural':'するだろう','imperative':'しろ','passive':'される','passive-negative':'されない',
      'causative':'させる','causative-negative':'させない','causative-passive':'させられる',
      'desiderative':'したい','progressive':'している','negative-te':'しないで','prohibition':'するな',
      'request-kudasai':'してください','negative-request':'しないでください','permission':'してもいい','obligation':'しなければならない'
    };
    return stem+(M[type]||'');
  }
  if(group==='kuru'){
    const stem=reading.endsWith('くる')?reading.slice(0,-2):'';
    const M={
      'plain-present':'くる','plain-past':'きた','plain-negative':'こない','plain-past-negative':'こなかった',
      'polite-present':'きます','polite-past':'きました','polite-negative':'きません','polite-past-negative':'きませんでした',
      'masu-stem':'き','polite-volitional':'きましょう','polite-te':'きまして','polite-conditional-tara':'しましたら',
      'te-form':'きて','potential':'こられる','potential-negative':'こられない','volitional':'こよう','conditional-tara':'きたら','negative-conditional-tara':'こなかったら','conditional-ba':'くれば',
      'conditional-nara':'くるなら','conjectural':'くるだろう','imperative':'こい','passive':'こられる','passive-negative':'こられない',
      'causative':'こさせる','causative-negative':'こさせない','causative-passive':'こさせられる',
      'desiderative':'きたい','progressive':'きている','negative-te':'こないで','prohibition':'くるな',
      'request-kudasai':'きてください','negative-request':'こないでください','permission':'きてもいい','obligation':'こなければならない'
    };
    return stem+(M[type]||'');
  }
  return'';
}

export function adjectiveStem(adj){
  const reading=adj.reading;
  if(adj.irregular||reading==='いい'||reading==='かっこいい')return reading.slice(0,-2)+'よ';
  return reading.endsWith('い')?reading.slice(0,-1):reading;
}

export function conjugateAdjective(adj,type){
  const{reading,group}=adj;
  if(group==='i-adjective'){
    const stem=adjectiveStem(adj);
    const past=stem+'かった',neg=stem+'くない',pastNeg=stem+'くなかった';
    const M={
      'adj-plain-present':reading,'adj-plain-past':past,'adj-plain-negative':neg,'adj-plain-past-negative':pastNeg,
      'adj-polite-present':reading+'です','adj-polite-past':past+'です','adj-polite-negative':neg+'です','adj-polite-past-negative':pastNeg+'です',
      'adj-te-form':stem+'くて','adj-negative-te-form':negativeTeConnectiveForm(neg),'adj-adverb':stem+'く','adj-attributive':reading,'adj-conditional':stem+'ければ','adj-negative-conditional':negativeBaForm(neg),
      'adj-tara':past+'ら','adj-negative-tara':pastNeg+'ら','adj-sou':stem+'そう','adj-sugiru':stem+'すぎる','adj-naru':stem+'くなる'
    };
    return M[type]||'';
  }
  if(group==='na-adjective'){
    const stem=reading.replace(/na$/,'').replace(/な$/,'');
    const M={
      'adj-plain-present':stem+'だ','adj-plain-past':stem+'だった','adj-plain-negative':stem+'ではない','adj-plain-past-negative':stem+'ではなかった',
      'adj-polite-present':stem+'です','adj-polite-past':stem+'でした','adj-polite-negative':stem+'ではありません','adj-polite-past-negative':stem+'ではありませんでした',
      'adj-te-form':stem+'で','adj-negative-te-form':negativeTeConnectiveForm(stem+'ではない'),'adj-adverb':stem+'に','adj-attributive':stem+'な','adj-conditional':stem+'なら','adj-negative-conditional':negativeBaForm(stem+'ではない'),
      'adj-tara':stem+'だったら','adj-negative-tara':stem+'ではなかったら','adj-sou':stem+'そう','adj-sugiru':stem+'すぎる','adj-naru':stem+'になる'
    };
    return M[type]||'';
  }
  return'';
}

export function conjugateItem(item,type){
  return item.group==='i-adjective'||item.group==='na-adjective'?conjugateAdjective(item,type):conjugate(item,type);
}

export function getConjugationParts(word, type, answer) {
  const ans = answer || conjugateItem(word, type);
  if (!ans) return { stem: '', change: '', suffix: '' };

  const isAdj = isAdjective(word);
  const reading = word.reading;
  const dict = word.dict;
  const group = word.group;

  let stem = '';
  if (isAdj) {
    if (group === 'i-adjective') {
      stem = adjectiveStem(word);
    } else {
      stem = reading.replace(/な$/, '');
    }
  } else {
    if (group === 'ichidan') {
      stem = reading.slice(0, -1);
    } else if (group === 'godan') {
      stem = reading.slice(0, -1);
    } else if (group === 'suru') {
      stem = reading.endsWith('する') ? reading.slice(0, -2) : '';
    } else if (group === 'kuru') {
      stem = reading.endsWith('くる') ? reading.slice(0, -2) : '';
    }
  }

  let displayStem = stem;
  if (dict && reading && dict.length === reading.length) {
    displayStem = dict.slice(0, stem.length);
  } else if (dict && reading) {
    const diff = reading.length - stem.length;
    displayStem = dict.slice(0, Math.max(0, dict.length - diff));
  }

  let remainder = '';
  let matchedStem = '';
  if (ans.startsWith(displayStem)) {
    matchedStem = displayStem;
    remainder = ans.slice(displayStem.length);
  } else if (ans.startsWith(stem)) {
    matchedStem = stem;
    remainder = ans.slice(stem.length);
  } else {
    if (group === 'kuru') {
      if (ans.startsWith('来')) {
        matchedStem = '来';
        remainder = ans.slice(1);
      } else if (ans.startsWith('き') || ans.startsWith('こ') || ans.startsWith('く')) {
        matchedStem = ans.slice(0, 1);
        remainder = ans.slice(1);
      } else {
        matchedStem = '';
        remainder = ans;
      }
    } else {
      matchedStem = '';
      remainder = ans;
    }
  }

  let change = '';
  let suffix = remainder;

  if (isAdj) {
    if (group === 'i-adjective') {
      if (remainder.startsWith('か')) {
        change = 'か';
        suffix = remainder.slice(1);
      } else if (remainder.startsWith('く')) {
        change = 'く';
        suffix = remainder.slice(1);
      } else if (remainder.startsWith('い')) {
        change = 'い';
        suffix = remainder.slice(1);
      }
    } else {
      change = '';
      suffix = remainder;
    }
  } else {
    if (group === 'ichidan') {
      change = '';
      suffix = remainder;
    } else if (group === 'godan') {
      change = remainder.slice(0, 1);
      suffix = remainder.slice(1);
    } else if (group === 'suru') {
      const S = remainder;
      if (S.startsWith('させら')) { change = 'させら'; suffix = S.slice(4); }
      else if (S.startsWith('させ')) { change = 'させ'; suffix = S.slice(2); }
      else if (S.startsWith('され')) { change = 'され'; suffix = S.slice(2); }
      else if (S.startsWith('でき')) { change = 'でき'; suffix = S.slice(2); }
      else if (S.startsWith('しよ')) { change = 'しよ'; suffix = S.slice(2); }
      else if (S.startsWith('し')) { change = 'し'; suffix = S.slice(1); }
      else if (S.startsWith('す')) { change = 'す'; suffix = S.slice(1); }
      else { change = S.slice(0, 1); suffix = S.slice(1); }
    } else if (group === 'kuru') {
      const S = remainder;
      if (S.startsWith('させら')) { change = 'させら'; suffix = S.slice(4); }
      else if (S.startsWith('させ')) { change = 'させ'; suffix = S.slice(2); }
      else if (S.startsWith('られ')) { change = 'られ'; suffix = S.slice(2); }
      else if (S.startsWith('よ')) { change = 'よ'; suffix = S.slice(1); }
      else if (S.startsWith('い')) { change = 'い'; suffix = S.slice(1); }
      else if (S.startsWith('れ')) { change = 'れ'; suffix = S.slice(1); }
      else { change = ''; suffix = S; }
    }
  }

  return { stem: matchedStem, change, suffix };
}

export function isAdjective(item){return item.group==='i-adjective'||item.group==='na-adjective';}

export function surfaceStemPair(item){
  if(!item||!item.reading||!item.dict)return{readingStem:'',dictStem:''};
  if(item.group==='suru')return{readingStem:item.reading.endsWith('する')?item.reading.slice(0,-2):'',dictStem:item.dict.endsWith('する')?item.dict.slice(0,-2):item.dict};
  if(item.group==='kuru')return{readingStem:item.reading.endsWith('くる')?item.reading.slice(0,-2):'',dictStem:item.dict.replace(/(来る|くる)$/,'')};
  if(item.group==='i-adjective'){
    if(item.irregular||item.reading==='いい'||item.reading==='かっこいい')return{readingStem:'',dictStem:''};
    return{readingStem:adjectiveStem(item),dictStem:item.dict.endsWith('い')?item.dict.slice(0,-1):item.dict};
  }
  if(item.group==='na-adjective')return{readingStem:item.reading.replace(/な$/,''),dictStem:item.dict.replace(/な$/,'')};
  return{readingStem:item.reading.slice(0,-1),dictStem:item.dict.slice(0,-1)};
}

export function surfaceFormFor(item,typeId){
  const answer=conjugateItem(item,typeId);
  if(!answer||!item||!item.dict||item.dict===item.reading)return answer||'';
  const{readingStem,dictStem}=surfaceStemPair(item);
  if(item.group==='kuru'&&answer.startsWith(readingStem)){
    const tail=answer.slice(readingStem.length);
    if(['き','こ','く'].includes(tail[0]))return dictStem+'来'+tail.slice(1);
    return dictStem+tail;
  }
  if(readingStem&&answer.startsWith(readingStem))return dictStem+answer.slice(readingStem.length);
  return answer;
}

// ============================================================================
// RULE TAXONOMY
// ============================================================================
export const RULES = (() => {
  const rules = [];
  const short = {ichidan:'る-verb',godan:'う-verb',suru:'する',kuru:'来る'};
  for(const g of['ichidan','godan','suru','kuru']){
    for(const t of CONJ_TYPES){
      const ikuEx=g==='godan'&&(t.id==='plain-past'||t.id==='te-form');
      rules.push({
        id:`${g}|${t.id}`,group:g,type:t.id,label:short[g],
        verbFilter:(verbs)=>verbs.filter(v=>v.group===g&&(!ikuEx||!v.reading.endsWith('いく'))),
      });
    }
  }
  for(const t of ['plain-past','te-form']){
    rules.push({
      id:`exception-いく|${t}`,group:'godan',type:t,label:'行く Exception',
      verbFilter:(verbs)=>verbs.filter(v=>v.group==='godan'&&v.reading.endsWith('いく')),
    });
  }
  const adjShort={'i-adjective':'い-adj','na-adjective':'な-adj'};
  for(const g of['i-adjective','na-adjective']){
    for(const t of ADJ_TYPES){
      rules.push({
        id:`${g}|${t.id}`,group:g,type:t.id,label:adjShort[g],
        verbFilter:(words)=>words.filter(w=>w.group===g),
      });
    }
  }
  return rules;
})();

export { getTypeInfo };
