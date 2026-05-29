// Explanation, hint, and diagnosis logic for conjugation forms.
// These functions build on the conjugation engine but are kept separate
// so the engine itself (conjugator.js) stays focused on producing forms.
import { toHiragana } from './romaji.js';
import { CONJ_TYPES, ADJ_TYPES, TYPE_LABEL, getTypeInfo } from '../data/conjugationTypes.js';
import {
  isAdjective,
  conjugate,
  conjugateAdjective,
  conjugateItem,
  getConjugationParts,
  adjectiveStem,
  A_ROW, I_ROW, E_ROW, O_ROW, PAST_END, TE_END,
} from './conjugator.js';

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

// Deterministic, offline hint shown when the student clicks "Hint" while
// answering. It states how the (possibly multi-step) form is built and where
// the student currently is, without revealing any kana they haven't typed yet.
//
// Irregular forms (する, 来る, よい-based adjectives…) have no derivable rule —
// their "rule" text spells out the answer. To keep the first hint spoiler-free,
// such text is replaced with a nudge unless `reveal` is true (a second Hint
// click). Returns { text, masked }, where `masked` means more can be revealed.
export function stepCoachHint(item,type,typed,reveal=false){
  const expected=conjugateItem(item,type);
  const exp=explainItem(item,type);
  let recipe=[exp.rule,exp.note].filter(Boolean).join(' ').trim();
  // Only a genuine transformation can spoil — the unchanged dictionary form can't.
  const wouldReveal=!!expected&&expected!==item.reading&&recipe.includes(expected);
  let masked=false;
  if(wouldReveal&&!reveal){
    recipe=`This is an irregular form, so it doesn't follow the usual pattern — try to recall its special conjugation. Tap Hint again or use "Discuss further" to reveal the steps.`;
    masked=true;
  }
  const got=toHiragana(typed||'')||(typed||'');
  let correct=0;
  while(correct<got.length&&correct<expected.length&&got[correct]===expected[correct])correct++;
  let status;
  if(!got){
    status=`You haven't typed anything yet — start from the dictionary form ${item.reading}, then work through the steps above.`;
  }else if(correct===0){
    status=`The very beginning doesn't match yet — re-check the first step above.`;
  }else if(correct<got.length){
    status=`Your first ${correct} kana (「${got.slice(0,correct)}」) are on track, but kana ${correct+1} goes off course — re-check the next step above.`;
  }else if(correct>=expected.length){
    status=`That's the full length — press Enter to check it.`;
  }else{
    const remaining=expected.length-correct;
    status=`「${got}」 is correct so far — ${remaining} more kana to go. Apply the next step above.`;
  }
  return{text:recipe?`${recipe}\n\n${status}`:status,masked};
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
