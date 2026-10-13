/**
 * The session card stores word identity and selected optional display metadata.
 * Other lexicon fields never become part of the session snapshot. Metadata is
 * opaque here because its interpretation belongs to the lexicon/display code.
 * @typedef {{ dict: string, reading: string, meaning: string, group: string,
 *   jlpt?: unknown, lesson?: unknown, lessons?: unknown, minnaLesson?: unknown,
 *   minnaLessons?: unknown, pitchAccent?: unknown }} StudyWordSnapshot
 */

/** @param {StudyWordSnapshot} word @returns {StudyWordSnapshot} */
export function snapshotStudyWord(word) {
  return {
    dict: word.dict,
    reading: word.reading,
    meaning: word.meaning,
    group: word.group,
    ...(word.jlpt ? { jlpt: word.jlpt } : {}),
    ...(word.lesson ? { lesson: word.lesson } : {}),
    ...(word.lessons ? { lessons: word.lessons } : {}),
    ...(word.minnaLesson ? { minnaLesson: word.minnaLesson } : {}),
    ...(word.minnaLessons ? { minnaLessons: word.minnaLessons } : {}),
    ...(word.pitchAccent ? { pitchAccent: word.pitchAccent } : {}),
  };
}
