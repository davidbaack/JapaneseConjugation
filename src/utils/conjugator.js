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

export function getOfflineTemplateSentence(word, type) {
  const isAdj = isAdjective(word);
  const targetLabel = getTypeInfo(type).label;
  const translation = `Fill in: ${word.dict} (${word.reading}) -> ${targetLabel}`;
  if (isAdj) {
    if (word.group === 'i-adjective') {
      return {
        sentence: `この物は [______] ですね。`,
        translation: `${translation} (This thing is [______].)`,
      };
    } else {
      return {
        sentence: `ここはとても [______] です。`,
        translation: `${translation} (This place is very [______].)`,
      };
    }
  } else {
    return {
      sentence: `明日は、 [______] つもりです。`,
      translation: `${translation} (Tomorrow, I plan to [______].)`,
    };
  }
}

export function getConjugationSteps(word, type) {
  const ans = conjugateItem(word, type);
  const parts = getConjugationParts(word, type, ans);
  const steps = [];

  steps.push({
    title: "Identify Word Type & Group",
    desc: `"${word.dict}" (${word.reading}) means "${word.meaning}" and is ${GROUP_NAMES[word.group] || word.group}.`
  });

  let stemDesc = "";
  if (isAdjective(word)) {
    if (word.group === 'i-adjective') {
      const stemVal = adjectiveStem(word);
      const isIrreg = word.irregular || word.reading === 'いい' || word.reading === 'かっこいい';
      stemDesc = isIrreg 
        ? `Since this is an irregular い-adjective, change the base ending to "よ" to get the stem: "${stemVal}".`
        : `Drop the final "い" from the dictionary form to get the stem: "${stemVal}".`;
    } else {
      stemDesc = `Remove the final "な" from the dictionary form to get the stem: "${parts.stem}".`;
    }
  } else {
    if (word.group === 'ichidan') {
      stemDesc = `Drop the final "る" from the dictionary form to get the stem: "${parts.stem}".`;
    } else if (word.group === 'godan') {
      const lastChar = word.reading.slice(-1);
      const targetVowel = parts.change;
      stemDesc = `This is a godan verb. Shift its final dictionary hiragana "${lastChar}" to its inflected form "${targetVowel}". The base stem is now "${parts.stem}${parts.change}".`;
    } else if (word.group === 'suru') {
      stemDesc = `Conjugate the "する" portion to "${parts.change}". The compound base is "${parts.stem}".`;
    } else if (word.group === 'kuru') {
      stemDesc = `The irregular verb 来る root kanji/kana shifts to "${parts.stem}${parts.change}".`;
    }
  }
  steps.push({
    title: "Apply Stem & Vowel Shift",
    desc: stemDesc
  });

  const suffixDesc = parts.suffix 
    ? `Append the grammatical suffix "${parts.suffix}" representing the target form (${getTypeInfo(type).label}).`
    : `No additional grammatical suffix is needed for this form.`;
  steps.push({
    title: "Append Grammatical Suffix",
    desc: suffixDesc
  });

  steps.push({
    title: "Verify Conjugation Result",
    desc: `Combine the stem and suffix to get the final form.`,
    isResult: true,
    expected: ans
  });

  return steps;
}

export const GROUP_NAMES = {
  ichidan:'an ichidan verb (る-verb / Group 2)',
  godan:'a godan verb (う-verb / Group 1)',
  suru:'irregular (the verb する, Group 3)',
  kuru:'irregular (the verb 来る, Group 3)',
  'irregular-adjective':'an irregular い-adjective',
  'i-adjective':'an い-adjective',
  'na-adjective':'a な-adjective'
};

export function explainConjugation(verb,type){
  const{reading,group,dict}=verb;
  const result=conjugate(verb,type);
  const stem=reading.slice(0,-1),last=reading.slice(-1);
  const intro=`${dict} (${reading}) is ${GROUP_NAMES[group]}.`;
  let rule='',derivation=result,note='';
  if(group==='ichidan'){const M={'plain-present':['Dictionary form.',result],'plain-past':['Drop る, add た.',`${stem} + た = ${result}`],'plain-negative':['Drop る, add ない.',`${stem} + ない = ${result}`],'plain-past-negative':['Drop る, add なかった.',`${stem} + なかった = ${result}`],'polite-present':['Drop る, add ます.',`${stem} + ます = ${result}`],'polite-past':['Drop る, add ました.',`${stem} + ました = ${result}`],'polite-negative':['Drop る, add ません.',`${stem} + ません = ${result}`],'polite-past-negative':['Drop る, add ませんでした.',`${stem} + ませんでした = ${result}`],'te-form':['Drop る, add て.',`${stem} + て = ${result}`],'potential':['Drop る, add られる.',`${stem} + られる = ${result}`],'volitional':['Drop る, add よう.',`${stem} + よう = ${result}`],'conditional-tara':['Past form + ら.',`${stem} + たら = ${result}`],'negative-conditional-tara':['Plain past negative + ら.',`${stem} + なかった + ら = ${result}`],'conditional-ba':['Drop る, add れば.',`${stem} + れば = ${result}`],'imperative':['Drop る, add ろ.',`${stem} + ろ = ${result}`],'passive':['Drop る, add られる.',`${stem} + られる = ${result}`],'causative':['Drop る, add させる.',`${stem} + させる = ${result}`]};[rule,derivation]=M[type]||['',result];}
  else if(group==='godan'){const isIku=reading==='いく'||reading.endsWith('いく');const ikuNote=isIku?' Note: 行く is irregular — past/te use った/って.':'';const pEnd=isIku?'った':PAST_END[last];const teEnd=isIku?'って':TE_END[last];const negPast=conjugate(verb,'plain-past-negative');const M={'plain-present':['Dictionary form.',result],'plain-past':[`Past: く→いた, ぐ→いだ, す→した, つ/う/る→った, ぬ/ぶ/む→んだ.${ikuNote}`,`${stem} + ${pEnd} = ${result}`],'plain-negative':[`あ-row (う→わ!) + ない.`,`${stem} + ${A_ROW[last]} + ない = ${result}`],'plain-past-negative':[`あ-row + なかった.`,`${stem} + ${A_ROW[last]} + なかった = ${result}`],'polite-present':[`い-row + ます.`,`${stem} + ${I_ROW[last]} + ます = ${result}`],'polite-past':[`い-row + ました.`,`${stem} + ${I_ROW[last]} + ました = ${result}`],'polite-negative':[`い-row + ません.`,`${stem} + ${I_ROW[last]} + ません = ${result}`],'polite-past-negative':[`い-row + ませんでした.`,`${stem} + ${I_ROW[last]} + ませんでした = ${result}`],'te-form':[`Te mirrors past with て/で: く→いて, ぐ→いで, す→して, つ/う/る→って, ぬ/ぶ/む→んで.${ikuNote}`,`${stem} + ${teEnd} = ${result}`],'potential':[`え-row + る.`,`${stem} + ${E_ROW[last]} + る = ${result}`],'volitional':[`お-row + う.`,`${stem} + ${O_ROW[last]} + う = ${result}`],'conditional-tara':['Past form + ら.',`${stem} + ${pEnd} + ら = ${result}`],'negative-conditional-tara':['Plain past negative + ら; う-ending verbs use わ.',`${negPast} + ら = ${result}`],'conditional-ba':[`え-row + ば.`,`${stem} + ${E_ROW[last]} + ば = ${result}`],'imperative':[`え-row (blunt).`,`${stem} + ${E_ROW[last]} = ${result}`],'passive':[`あ-row + れる.`,`${stem} + ${A_ROW[last]} + れる = ${result}`],'causative':[`あ-row + せる.`,`${stem} + ${A_ROW[last]} + せる = ${result}`],'short-causative-passive':[`Short causative-passive: あ-row + される.`,`${stem} + ${A_ROW[last]} + される = ${result}`]};[rule,derivation]=M[type]||['',result];if(/[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]る$/.test(reading)){note=`Trap: ${dict} looks ichidan but is godan.`;}if(type==='short-causative-passive'&&last==='す'){rule='す-ending Godan verbs do not use the contracted short causative-passive in standard drills.';derivation=`Use regular causative-passive: ${conjugate(verb,'causative-passive')}`;note='For forms like 話す, keep させられる instead of shortening.';}}
  else if(group==='suru'){const compound=reading.endsWith('する')&&reading!=='する'?reading.slice(0,-2):'';const M={'plain-present':'Dictionary form.','plain-past':'する → した (irregular).','plain-negative':'する → しない.','plain-past-negative':'する → しなかった.','polite-present':'する → します.','polite-past':'する → しました.','polite-negative':'する → しません.','polite-past-negative':'する → しませんでした.','te-form':'する → して.','potential':'Special: する → できる.','volitional':'する → しよう.','conditional-tara':'する → したら.','negative-conditional-tara':'する → しなかったら.','conditional-ba':'する → すれば.','imperative':'する → しろ.','passive':'する → される.','causative':'する → させる.'};rule=M[type]||'';derivation=compound?`${compound} + (する conjugated) = ${result}`:result;}
  else if(group==='kuru'){const M={'plain-present':'来る (くる).','plain-past':'来る → 来た (きた). く→き.','plain-negative':'来る → 来ない (こない). く→こ.','plain-past-negative':'来る → 来なかった. く→こ.','polite-present':'来る → 来ます (きます). く→き.','polite-past':'来る → 来ました. く→き.','polite-negative':'来る → 来ません. く→き.','polite-past-negative':'来る → 来ませんでした. く→き.','te-form':'来る → 来て (きて). く→き.','potential':'来る → 来られる (こられる). く→こ.','volitional':'来る → 来よう (こよう). く→こ.','conditional-tara':'来る → 来たら (きたら). く→き.','negative-conditional-tara':'来る → 来なかったら (こなかったら). く→こ.','conditional-ba':'来る → 来れば (くれば). く stays.','imperative':'来る → 来い (こい). く→こ.','passive':'来る → 来られる. く→こ.','causative':'来る → 来させる. く→こ.','short-causative-passive':'Short spoken form: 来さされる (こさされる).'};rule=`${dict} is irregular: く shifts to き (polite/past/te) or こ (negative/potential/volitional).`;note=M[type]||'';}
  return{intro,rule,derivation,note};
}

export function explainAdjective(adj,type){
  const result=conjugateAdjective(adj,type);
  const stem=adjectiveStem(adj);
  const intro=`${adj.dict} (${adj.reading}) is ${GROUP_NAMES[adj.group]}.`;
  let rule='',derivation=result,note='';
  if(adj.group==='i-adjective'){
    const irregular=adj.irregular||adj.reading==='いい'||adj.reading==='かっこいい';
    const M={
      'adj-plain-present':['Dictionary form.',result],
      'adj-plain-past':['Drop い, add かった.',`${stem} + かった = ${result}`],
      'adj-plain-negative':['Drop い, add くない.',`${stem} + くない = ${result}`],
      'adj-plain-past-negative':['Drop い, add くなかった.',`${stem} + くなかった = ${result}`],
      'adj-polite-present':['Add です to the dictionary form.',`${adj.reading} + です = ${result}`],
      'adj-polite-past':['Make the plain past, then add です.',`${stem} + かった + です = ${result}`],
      'adj-polite-negative':['Make the plain negative, then add です.',`${stem} + くない + です = ${result}`],
      'adj-polite-past-negative':['Make the plain past negative, then add です.',`${stem} + くなかった + です = ${result}`],
      'adj-te-form':['Drop い, add くて.',`${stem} + くて = ${result}`],
      'adj-negative-te-form':['Make the plain negative, then replace ない with なくて.',`${stem} + くなくて = ${result}`],
      'adj-adverb':['Drop い, add く.',`${stem} + く = ${result}`],
      'adj-attributive':['Use the dictionary form before a noun.',result],
      'adj-conditional':['Drop い, add ければ.',`${stem} + ければ = ${result}`],
      'adj-negative-conditional':['Make the plain negative, then replace ない with なければ.',`${stem} + くなければ = ${result}`],
      'adj-tara':['Plain past + ら.',`${stem} + かった + ら = ${result}`],
      'adj-negative-tara':['Plain past negative + ら.',`${stem} + くなかった + ら = ${result}`],
      'adj-sou':['Drop い, add そう.',`${stem} + そう = ${result}`],
      'adj-sugiru':['Drop い, add すぎる.',`${stem} + すぎる = ${result}`],
      'adj-naru':['Drop い, add くなる.',`${stem} + くなる = ${result}`]
    };
    [rule,derivation]=M[type]||['',result];
    if(irregular)note='いい and かっこいい conjugate from よい, so the stem becomes よ.';
  }else{
    const s=adj.reading.replace(/な$/,'');
    const M={
      'adj-plain-present':['Add だ for the plain predicative form.',`${s} + だ = ${result}`],
      'adj-plain-past':['Add だった.',`${s} + だった = ${result}`],
      'adj-plain-negative':['Add ではない.',`${s} + ではない = ${result}`],
      'adj-plain-past-negative':['Add ではなかった.',`${s} + ではなかった = ${result}`],
      'adj-polite-present':['Add です.',`${s} + です = ${result}`],
      'adj-polite-past':['Add でした.',`${s} + でした = ${result}`],
      'adj-polite-negative':['Add ではありません.',`${s} + ではありません = ${result}`],
      'adj-polite-past-negative':['Add ではありませんでした.',`${s} + ではありませんでした = ${result}`],
      'adj-te-form':['Use で to connect clauses.',`${s} + で = ${result}`],
      'adj-negative-te-form':['Make the plain negative, then replace ない with なくて.',`${s} + ではなくて = ${result}`],
      'adj-adverb':['Add に for the adverbial form.',`${s} + に = ${result}`],
      'adj-attributive':['Add な before a noun.',`${s} + な = ${result}`],
      'adj-conditional':['Use なら for the common conditional.',`${s} + なら = ${result}`],
      'adj-negative-conditional':['Make the plain negative, then replace ない with なければ.',`${s} + ではなければ = ${result}`],
      'adj-tara':['Plain past + ら.',`${s} + だった + ら = ${result}`],
      'adj-negative-tara':['Plain past negative + ら.',`${s} + ではなかった + ら = ${result}`],
      'adj-sou':['Add そう.',`${s} + そう = ${result}`],
      'adj-sugiru':['Add すぎる.',`${s} + すぎる = ${result}`],
      'adj-naru':['Add になる.',`${s} + になる = ${result}`]
    };
    [rule,derivation]=M[type]||['',result];
  }
  return{intro,rule,derivation,note};
}

export function explainItem(item,type){
  if(isAdjective(item))return explainAdjective(item,type);
  const e=explainConjugation(item,type);
  const common={
    'masu-stem':'Use the stem that appears before ます.',
    'polite-volitional':'Use the ます stem, then add ましょう.',
    'polite-te':'Use the ます stem, then add まして.',
    'polite-conditional-tara':'Use the polite past ました, then add ら.',
    'honorific':'Use a special honorific verb when one exists; otherwise use お + ます-stem + になる to raise someone else\'s action.',
    'honorific-polite':'Make the honorific form, then put it in polite ます style. Special verbs like なさる and いらっしゃる become なさいます and いらっしゃいます.',
    'humble':'Use a special humble verb when one exists; otherwise use お + ます-stem + する to lower your own action.',
    'humble-polite':'Make the humble form, then put it in polite ます style. Suru-based humble forms become します / いたします.',
    'potential-negative':'Make the potential form, then make it negative.',
    'potential-polite':'Make the potential form, then replace final る with ます.',
    'potential-polite-negative':'Make the potential form, then replace final る with ません.',
    'potential-polite-past':'Make the potential form, then replace final る with ました.',
    'potential-polite-past-negative':'Make the potential form, then replace final る with ませんでした.',
    'potential-past':'Make the potential form, then replace final る with た.',
    'potential-past-negative':'Make the potential form, then replace final る with なかった.',
    'potential-conditional-ba':'Make the potential form, then replace final る with れば.',
    'negative-conditional-ba':'Make the plain negative form, then replace ない with なければ.',
    'potential-negative-conditional-ba':'Make the potential negative form, then replace ない with なければ.',
    'conditional-nara':'Use the dictionary form, then add なら.',
    'conjectural':'Use the dictionary form, then add だろう.',
    'passive-polite':'Make the passive form, then replace final る with ます.',
    'passive-negative':'Make the passive form, then make it negative.',
    'passive-polite-negative':'Make the passive form, then replace final る with ません.',
    'passive-polite-past':'Make the passive form, then replace final る with ました.',
    'passive-polite-past-negative':'Make the passive form, then replace final る with ませんでした.',
    'passive-past':'Make the passive form, then replace final る with た.',
    'passive-past-negative':'Make the passive form, then replace final る with なかった.',
    'passive-conditional-ba':'Make the passive form, then replace final る with れば.',
    'passive-negative-conditional-ba':'Make the passive negative form, then replace ない with なければ.',
    'causative-polite':'Make the causative form, then replace final る with ます.',
    'causative-negative':'Make the causative form, then make it negative.',
    'causative-polite-negative':'Make the causative form, then replace final る with ません.',
    'causative-polite-past':'Make the causative form, then replace final る with ました.',
    'causative-polite-past-negative':'Make the causative form, then replace final る with ませんでした.',
    'causative-past':'Make the causative form, then replace final る with た.',
    'causative-past-negative':'Make the causative form, then replace final る with なかった.',
    'causative-conditional-ba':'Make the causative form, then replace final る with れば.',
    'causative-negative-conditional-ba':'Make the causative negative form, then replace ない with なければ.',
    'short-causative':'Use the colloquial short causative: あ-row + す for godan verbs, or replace させる with さす.',
    'short-causative-polite':'Make the short causative, then conjugate that す-ending form with ます.',
    'short-causative-negative':'Make the short causative, then conjugate that す-ending form with ない.',
    'short-causative-polite-negative':'Make the short causative, then conjugate that す-ending form with ません.',
    'short-causative-past':'Make the short causative, then conjugate that す-ending form with た.',
    'short-causative-polite-past':'Make the short causative, then conjugate that す-ending form with ました.',
    'short-causative-past-negative':'Make the short causative, then conjugate that す-ending form with なかった.',
    'short-causative-polite-past-negative':'Make the short causative-polite-past-negative form.',
    'short-causative-conditional-ba':'Make the short causative, then conjugate that す-ending form with ば.',
    'short-causative-negative-conditional-ba':'Make the short causative negative, then replace ない with なければ.',
    'causative-passive-polite':'Make the causative-passive form, then replace final る with ます.',
    'causative-passive-polite-past':'Make the causative-passive form, then replace final る with ました.',
    'causative-passive-past':'Make the causative-passive form, then replace final る with た.',
    'causative-passive-negative':'Make the causative-passive form, then replace final る with ない.',
    'causative-passive-polite-negative':'Make the causative-passive form, then replace final る with ません.',
    'causative-passive-polite-past-negative':'Make the causative-passive form, then replace final る with ませんでした.',
    'causative-passive-past-negative':'Make the causative-passive form, then replace final る with なかった.',
    'causative-passive-conditional-ba':'Make the causative-passive form, then replace final る with れば.',
    'causative-passive-negative-conditional-ba':'Make the causative-passive negative form, then replace ない with なければ.',
    'short-causative-passive-polite':'Make the short causative-passive form, then replace final る with ます.',
    'short-causative-passive-polite-past':'Make the short causative-passive form, then replace final る with ました.',
    'short-causative-passive-past':'Make the short causative-passive form, then replace final る with た.',
    'short-causative-passive-negative':'Make the short causative-passive form, then replace final る with ない.',
    'short-causative-passive-polite-negative':'Make the short causative-passive form, then replace final る with ません.',
    'short-causative-passive-polite-past-negative':'Make the short causative-passive form, then replace final る with ませんでした.',
    'short-causative-passive-past-negative':'Make the short causative-passive form, then replace final る with なかった.',
    'short-causative-passive-conditional-ba':'Make the short causative-passive form, then replace final る with れば.',
    'short-causative-passive-negative-conditional-ba':'Make the short causative-passive negative form, then replace ない with なければ.',
    'request-kudasai':'Use the te-form, then add ください.',
    'negative-request':'Use the negative te-form, then add ください.',
    'negative-te-connective':'Make the plain negative form, then replace ない with なくて.',
    'negative-zu':'Use the ない stem, then add ず. Irregulars: する → せず; 来る → こず.',
    'negative-zuni':'Use ず + に for formal or written "without doing." Irregulars: する → せずに; 来る → こずに.',
    'permission':'Use the te-form, then add もいい.',
    'obligation':'Use the negative stem before い, then add ければならない.',
    'desiderative-polite':'Use the たい form, then add です.',
    'desiderative-negative':'Use the たい form, then conjugate たい like an い-adjective: たい → たくない.',
    'desiderative-polite-negative':'Use the たい form, conjugate it like an い-adjective to たくない, then add です.',
    'desiderative-past':'Use the たい form, then conjugate たい like an い-adjective: たい → たかった.',
    'desiderative-polite-past':'Use the たい form, conjugate it like an い-adjective to たかった, then add です.',
    'desiderative-past-negative':'Use the たい form, then conjugate たい like an い-adjective: たい → たくなかった.',
    'desiderative-polite-past-negative':'Use the たい form, conjugate it like an い-adjective to たくなかった, then add です.',
    'progressive-polite':'Use the te-form, then add います.',
    'progressive-negative':'Use the te-form, then add いない.',
    'progressive-polite-negative':'Use the te-form, then add いません.',
    'progressive-past':'Use the te-form, then add いた.',
    'progressive-polite-past':'Use the te-form, then add いました.',
    'progressive-past-negative':'Use the te-form, then add いなかった.',
    'progressive-polite-past-negative':'Use the te-form, then add いませんでした.',
    'command-nasai':'Use the masu-stem, then add なさい. This is a firm instruction, often from a parent, teacher, sign, or test prompt.'
  };
  if(!e.rule&&common[type])e.rule=common[type];
  if(!e.rule&&type==='causative-passive')e.rule=item.group==='godan'?'Use the あ-row stem, then add せられる.':'Use the causative stem and add られる.';
  if(!e.rule&&type==='short-causative-passive')e.rule=item.group==='godan'?(String(item.reading||'').endsWith('す')?'す-ending Godan verbs keep the regular させられる causative-passive in standard practice.':'Use the あ-row stem, then add される for the shorter spoken causative-passive.'):'Use 来さされる for the shorter spoken form of 来る.';
  if(!e.rule&&type==='desiderative')e.rule=item.group==='godan'?'Use the い-row stem, then add たい.':'Use the verb stem, then add たい.';
  if(!e.rule&&type==='progressive')e.rule='Use the te-form, then add いる.';
  if(!e.rule&&type==='negative-te')e.rule='Use the plain negative form, then add で.';
  if(!e.rule&&type==='prohibition')e.rule='Use the dictionary form, then add な for a blunt prohibition.';
  if(!e.rule&&type==='command-nasai')e.rule='Use the masu-stem, then add なさい.';
  return e;
}

export function diagnose(verb,type,userAnswer){
  const got=toHiragana(userAnswer);
  if(!got)return'';
  for(const t of CONJ_TYPES){if(t.id===type)continue;if(conjugate(verb,t.id)===got)return`That's the ${t.label.toLowerCase()} form — wrong conjugation pattern.`;}
  for(const g of['ichidan','godan'].filter(g=>g!==verb.group)){try{const alt=conjugate({...verb,group:g},type);if(alt===got)return`You conjugated this as a ${g==='ichidan'?'る-verb':'う-verb'}, but ${verb.dict} is ${verb.group==='ichidan'?'ichidan':verb.group==='godan'?'godan':'irregular'}.`;}catch{}}
  return'';
}

export function diagnoseItem(item,type,userAnswer){
  if(!isAdjective(item))return diagnose(item,type,userAnswer);
  const got=toHiragana(userAnswer);
  if(!got)return'';
  for(const t of ADJ_TYPES){if(t.id===type)continue;if(conjugateAdjective(item,t.id)===got)return`That's the ${t.label.toLowerCase()} form, but this card asks for ${getTypeInfo(type).label.toLowerCase()}.`;}
  const other=item.group==='i-adjective'?'na-adjective':'i-adjective';
  try{if(conjugateAdjective({...item,group:other},type)===got)return`You used the ${other==='i-adjective'?'い-adjective':'な-adjective'} pattern, but ${item.dict} is ${GROUP_NAMES[item.group]}.`;}catch{}
  return'';
}

export function contextSentenceFor(item,type){
  const form=conjugateItem(item,type);
  const label=(TYPE_LABEL[type]||type).toLowerCase();
  if(isAdjective(item)){
    const place='この場所';
    const M={
      'adj-plain-present':[`${place}は${form}。`,'This place is described with the target adjective.'],
      'adj-plain-past':[`昨日は${form}。`,'Yesterday it was described with the target adjective.'],
      'adj-plain-negative':[`${place}は${form}。`,'This place is not described that way.'],
      'adj-plain-past-negative':[`昨日は${form}。`,'Yesterday it was not described that way.'],
      'adj-polite-present':[`${place}は${form}。`,'Polite sentence using the adjective.'],
      'adj-polite-past':[`昨日は${form}。`,'Polite past sentence using the adjective.'],
      'adj-polite-negative':[`${place}は${form}。`,'Polite negative sentence using the adjective.'],
      'adj-polite-past-negative':[`昨日は${form}。`,'Polite past-negative sentence using the adjective.'],
      'adj-te-form':[`${form}、便利です。`,'Connects the adjective to another description.'],
      'adj-negative-te-form':[`${form}、困ります。`,'Connects a negative adjective to a result.'],
      'adj-adverb':[`${form}話してください。`,'Uses the adverbial form before a verb.'],
      'adj-attributive':[`${form}場所です。`,'Uses the adjective before a noun.'],
      'adj-conditional':[`${form}、行きます。`,'Uses the conditional before a result.'],
      'adj-negative-conditional':[`${form}、行きません。`,'If it is not that way, the result changes.'],
      'adj-tara':[`${form}、行きます。`,'Uses the tara conditional before a result.'],
      'adj-negative-tara':[`${form}、行きません。`,'If it is not that way, the result changes.'],
      'adj-sou':[`${form}です。`,'Looks or seems that way.'],
      'adj-sugiru':[`${form}ので、困ります。`,'Too much of that quality causes a problem.'],
      'adj-naru':[`だんだん${form}。`,'Shows a change into that state.']
    };
    const picked=M[type]||[`${place}は${form}。`,`Short context using the ${label} form.`];
    return{ja:picked[0],en:picked[1],form,label};
  }
  const M={
    'plain-present':[`毎日、${form}。`,'I do this every day.'],
    'plain-past':[`昨日、${form}。`,'I did this yesterday.'],
    'plain-negative':[`今日は${form}。`,'I will not do this today.'],
    'plain-past-negative':[`昨日は${form}。`,'I did not do this yesterday.'],
    'polite-present':[`毎日、${form}。`,'Polite sentence for doing this every day.'],
    'polite-past':[`昨日、${form}。`,'Polite sentence for doing this yesterday.'],
    'polite-negative':[`今日は${form}。`,'Polite sentence for not doing this today.'],
    'polite-past-negative':[`昨日は${form}。`,'Polite sentence for not doing this yesterday.'],
    'masu-stem':[`${form}ながら、音楽を聞きます。`,'Uses the stem with ながら for doing two things together.'],
    'polite-volitional':[`一緒に${form}。`,'Polite invitation to do this together.'],
    'polite-te':[`${form}、少し休みます。`,'Polite connective before the next action.'],
    'polite-conditional-tara':[`${form}、教えてください。`,'Polite if/when sentence.'],
    'honorific':[`先生はよく${form}。`,'Raises the teacher or customer as the doer of this action.'],
    'honorific-polite':[`先生はよく${form}。`,'Politely raises the teacher or customer as the doer of this action.'],
    'humble':[`私はあとで${form}。`,'Lowers the speaker while describing the speaker\'s own action.'],
    'humble-polite':[`私があとで${form}。`,'Politely lowers the speaker while describing the speaker\'s own action.'],
    'te-form':[`${form}、少し休みます。`,'Connects this action to another action.'],
    'potential':[`ここで${form}。`,'Says this can be done here.'],
    'potential-polite':[`ここで${form}。`,'Politely says this can be done here.'],
    'potential-negative':[`今は${form}。`,'Says this cannot be done now.'],
    'potential-polite-negative':[`今は${form}。`,'Politely says this cannot be done now.'],
    'potential-polite-past':[`昨日は${form}。`,'Politely says this could be done yesterday.'],
    'potential-polite-past-negative':[`昨日は${form}。`,'Politely says this could not be done yesterday.'],
    'potential-past':[`昨日は${form}。`,'Says this could be done yesterday.'],
    'potential-past-negative':[`昨日は${form}。`,'Says this could not be done yesterday.'],
    'potential-conditional-ba':[`${form}、手伝います。`,'If this can be done, someone helps or responds.'],
    'volitional':[`明日、${form}。`,"Let's do this tomorrow."],
    'conditional-tara':[`${form}、教えてください。`,'If or when this happens, please tell me.'],
    'negative-conditional-tara':[`${form}、教えてください。`,'If or when this does not happen, please tell me.'],
    'conditional-ba':[`${form}、上手になります。`,'If you do this, you improve.'],
    'negative-conditional-ba':[`${form}、別の方法にします。`,'If this does not happen, use another method.'],
    'potential-negative-conditional-ba':[`${form}、手伝ってください。`,'If this cannot be done, ask for help.'],
    'conditional-nara':[`${form}、今がいいです。`,'If doing this, now is good.'],
    'conjectural':[`たぶん${form}。`,'Probably does this.'],
    'imperative':[`今すぐ${form}。`,'Blunt command form.'],
    'command-nasai':[`今、${form}。`,'Firm instruction using なさい, often from a parent, teacher, sign, or test prompt.'],
    'passive':[`友だちに${form}。`,'Passive context with another person involved.'],
    'passive-polite':[`友だちに${form}。`,'Polite passive context with another person involved.'],
    'passive-negative':[`友だちに${form}。`,'Negative passive context.'],
    'passive-polite-negative':[`友だちに${form}。`,'Polite negative passive context.'],
    'passive-polite-past':[`昨日、友だちに${form}。`,'Polite past passive context with another person involved.'],
    'passive-polite-past-negative':[`昨日、友だちに${form}。`,'Polite past negative passive context.'],
    'passive-past':[`昨日、友だちに${form}。`,'Past passive context with another person involved.'],
    'passive-past-negative':[`昨日、友だちに${form}。`,'Past negative passive context.'],
    'passive-conditional-ba':[`友だちに${form}、うれしいです。`,'If this is done to someone, there is a result.'],
    'passive-negative-conditional-ba':[`友だちに${form}、安心です。`,'If this is not done to someone, there is relief.'],
    'causative':[`先生は学生に${form}。`,'Someone makes or lets a student do it.'],
    'causative-polite':[`先生は学生に${form}。`,'Politely says someone makes or lets a student do it.'],
    'causative-negative':[`先生は学生に${form}。`,'Someone does not make or let a student do it.'],
    'causative-polite-negative':[`先生は学生に${form}。`,'Politely says someone does not make or let a student do it.'],
    'causative-polite-past':[`昨日、先生は学生に${form}。`,'Politely says someone made or let a student do it yesterday.'],
    'causative-polite-past-negative':[`昨日、先生は学生に${form}。`,'Politely says someone did not make or let a student do it yesterday.'],
    'causative-past':[`昨日、先生は学生に${form}。`,'Someone made or let a student do it yesterday.'],
    'causative-past-negative':[`昨日、先生は学生に${form}。`,'Someone did not make or let a student do it yesterday.'],
    'causative-conditional-ba':[`先生が学生に${form}、練習になります。`,'If someone makes or lets a student do it, it becomes practice.'],
    'causative-negative-conditional-ba':[`先生が学生に${form}、学生は自分でします。`,'If someone does not make or let a student do it, the student does it alone.'],
    'short-causative':[`先生は学生に${form}。`,'Colloquial sentence where someone makes or lets a student do it.'],
    'short-causative-polite':[`先生は学生に${form}。`,'Colloquial polite sentence where someone makes or lets a student do it.'],
    'short-causative-negative':[`先生は学生に${form}。`,'Colloquial sentence where someone does not make or let a student do it.'],
    'short-causative-polite-negative':[`先生は学生に${form}。`,'Colloquial polite sentence where someone does not make or let a student do it.'],
    'short-causative-past':[`昨日、先生は学生に${form}。`,'Colloquial sentence where someone made or let a student do it yesterday.'],
    'short-causative-polite-past':[`昨日、先生は学生に${form}。`,'Colloquial polite sentence where someone made or let a student do it yesterday.'],
    'short-causative-past-negative':[`昨日、先生は学生に${form}。`,'Colloquial sentence where someone did not make or let a student do it yesterday.'],
    'short-causative-polite-past-negative':[`昨日、先生は学生に${form}。`,'Colloquial polite sentence where someone did not make or let a student do it yesterday.'],
    'short-causative-conditional-ba':[`先生が学生に${form}、練習になります。`,'Colloquial if-sentence for making or letting someone do it.'],
    'short-causative-negative-conditional-ba':[`先生が学生に${form}、学生は自分でします。`,'Colloquial if-sentence for not making or letting someone do it.'],
    'causative-passive':[`学生は先生に${form}。`,'A student is made to do it.'],
    'causative-passive-polite':[`学生は先生に${form}。`,'Politely says a student is made to do it.'],
    'causative-passive-polite-past':[`昨日、学生は先生に${form}。`,'Politely says a student was made to do it yesterday.'],
    'causative-passive-past':[`昨日、学生は先生に${form}。`,'A student was made to do it yesterday.'],
    'causative-passive-negative':[`学生は先生に${form}。`,'A student is not made to do it.'],
    'causative-passive-polite-negative':[`学生は先生に${form}。`,'Politely says a student is not made to do it.'],
    'causative-passive-polite-past-negative':[`昨日、学生は先生に${form}。`,'Politely says a student was not made to do it yesterday.'],
    'causative-passive-past-negative':[`昨日、学生は先生に${form}。`,'A student was not made to do it yesterday.'],
    'causative-passive-conditional-ba':[`学生が先生に${form}、大変です。`,'If a student is made to do it, it is difficult.'],
    'causative-passive-negative-conditional-ba':[`学生が先生に${form}、安心です。`,'If a student is not made to do it, there is relief.'],
    'short-causative-passive':[`学生は先生に${form}。`,'A student is made to do it, using the shorter spoken form.'],
    'short-causative-passive-polite':[`学生は先生に${form}。`,'Polite sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-polite-past':[`昨日、学生は先生に${form}。`,'Polite past sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-past':[`昨日、学生は先生に${form}。`,'Past sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-negative':[`学生は先生に${form}。`,'Negative sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-polite-negative':[`学生は先生に${form}。`,'Polite negative sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-polite-past-negative':[`昨日、学生は先生に${form}。`,'Polite past negative sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-past-negative':[`昨日、学生は先生に${form}。`,'Past negative sentence using the shorter spoken causative-passive form.'],
    'short-causative-passive-conditional-ba':[`学生が先生に${form}、大変です。`,'If a student is made to do it, using the shorter spoken form.'],
    'short-causative-passive-negative-conditional-ba':[`学生が先生に${form}、安心です。`,'If a student is not made to do it, using the shorter spoken form.'],
    'desiderative':[`今、${form}。`,'I want to do this now.'],
    'desiderative-polite':[`今、${form}。`,'Polite way to say I want to do this now.'],
    'desiderative-negative':[`今は${form}。`,'I do not want to do this now.'],
    'desiderative-polite-negative':[`内容は${form}。`,'Polite way to say I do not want to do this now.'],
    'desiderative-past':[`昨日、${form}。`,'I wanted to do this yesterday.'],
    'desiderative-polite-past':[`昨日、${form}。`,'Polite way to say I wanted to do this yesterday.'],
    'desiderative-past-negative':[`昨日は${form}。`,'I did not want to do this yesterday.'],
    'desiderative-polite-past-negative':[`昨日は${form}。`,'Polite way to say I did not want to do this yesterday.'],
    'progressive':[`今、${form}。`,'This is happening now.'],
    'progressive-polite':[`今、${form}。`,'Polite way to say this is happening now.'],
    'progressive-negative':[`まだ${form}。`,'This has not happened yet, or is not happening now.'],
    'progressive-polite-negative':[`まだ${form}。`,'Polite way to say this has not happened yet, or is not happening now.'],
    'progressive-past':[`昨日の夜、${form}。`,'This was happening at that time.'],
    'progressive-polite-past':[`昨日の夜、${form}。`,'Polite way to say this was happening at that time.'],
    'progressive-past-negative':[`その時、${form}。`,'This was not happening at that time.'],
    'progressive-polite-past-negative':[`その時、${form}。`,'Polite way to say this was not happening at that time.'],
    'negative-te':[`${form}、待ってください。`,'Please wait without doing this.'],
    'negative-te-connective':[`${form}、困っています。`,'Not doing this connects to the next result.'],
    'negative-zu':[`${form}、次に進みます。`,'Formal/written connector for not doing this before moving on.'],
    'negative-zuni':[`${form}、出かけました。`,'Formal/written way to say without doing this.'],
    'prohibition':[`ここで${form}。`,'Do not do this here.'],
    'request-kudasai':[`すみません、${form}。`,'Excuse me, please do this.'],
    'negative-request':[`ここで${form}。`,'Please do not do this here.'],
    'permission':[`ここで${form}。`,'It is okay to do this here.'],
    'obligation':[`明日までに${form}。`,'This must be done by tomorrow.']
  };
  const picked=M[type]||[`短い文で${form}を使います。`,`Short context using the ${label} form.`];
  return{ja:picked[0],en:picked[1],form,label};
}

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
