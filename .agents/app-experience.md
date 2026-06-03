# Reviews-First App Experience

This document is the product experience source of truth for learner-facing work.
Agents must read it before changing Reviews, Library, Lessons, Practice Lab,
Settings, navigation, SRS behavior, or learner progress language.

If a proposed change goes against this design, ask the user first. If the user
confirms the new direction, update this document in the same change.

## Product Shape

- Top-level sections are Reviews, Lessons, Library, Practice Lab, and Settings.
- Reviews is the landing page, the main daily goal, and the source of SRS
  progress.
- Library is the source of truth for included and excluded words and form
  families.
- Lessons teach forms and verb/adjective groups from start to finish. They can
  recommend practice, but they do not gate Reviews.
- Practice Lab holds special-purpose tools such as Conjugation Check, Ending
  Lab, classification drills, and educational games. Lab work is separate from
  the main Reviews progress, but it can recommend focused Review sets.
- Settings is for global preferences. Controls that affect an active workflow
  belong on the page where they matter.

## Reviews

- Reviews opens to a dashboard instead of auto-starting a card.
- The dashboard shows due count, Start/Continue Reviews, session progress,
  upcoming review timing, and strong/weak form-family signals.
- The dashboard is the single Reviews surface. A brand-new learner sees only a
  short intro plus one Start action; returning-user signals (stat tiles, streak,
  upcoming-review forecast, form-family strength, Retest misses) are
  progressively disclosed once there is real history. Do not stack separate
  queue, progress, or staged "core path" panels above it, and once a card is
  active the card takes focus rather than sitting below status panels.
- Removing the current word or form family is a deliberate, secondary action
  (kept out of the way of Skip) and is reversible from Library.
- The main review stream mixes due cards, weak cards, and a small auto-trickle
  of new word-form cards.
- Form-family strength expands into a recognition/production/speed readiness
  breakdown (showing only dimensions with reps, so default typed practice never
  renders an empty recognition cell). Each family offers a one-tap drill that
  scopes Reviews to that family in the weak dimension's answer mode, and the
  single weakest skill surfaces as a dashboard nudge.
- If no cards are due, Reviews should still offer a useful core warmup.
- Required due Reviews complete the progress bar. Bonus Reviews can continue
  after completion and still update SRS.
- New content follows a word-first ladder: words are introduced by the earliest
  Genki or Minna lesson metadata, then enabled forms are introduced as
  word-form SRS cards.
- A brand-new Core Warmup starts with a short regular-first ladder: the opening
  fresh cards use regular ichidan and simple godan examples before irregulars,
  godan る traps, or special exceptions.
- The default scope is verb-first plus common textbook adjectives. Textbook Core
  forms are enabled from the start; rare stacked, short, or edge variants are
  opt-in.
- Nouns conjugate only through the copula, so they are excluded from the default
  automatic scope. Learners opt back in by enabling the noun group in Settings,
  and explicit lists, Library Lookup, and focused practice still reach nouns.
- A compact command bar is always visible for focused word or form-family
  practice.
- Sentence mode is an opt-in, off-by-default presentation toggle in the active
  card (sticky until turned off). It wraps a normal forward production card in a
  cued example sentence with a blank and a grammar cue; the word and target form
  stay visible, so it is contextualized production with a fixed frame, not
  inferential comprehension. It falls back to the normal prompt for reverse,
  listening, and minimal-pair cards.
- Explicit focused practice re-enables excluded content and counts through SRS.

## Inclusion And Exclusion

- Reviews can immediately remove the current word or current form family, with
  an undo affordance.
- Removing a word or form family updates the same durable Library inclusion
  state. It is not a temporary card skip.
- Excluded content is suspended from automatic Reviews, but SRS history and
  scheduling are preserved.
- Library can restore excluded words and form families.
- Learner-facing form controls operate at the form-family level, backed by exact
  type IDs internally.

## Library

- Library defaults to inventory controls for Words and Forms.
- Lookup/Check remains available through Library and uses the reverse
  conjugation engine for real-world conjugated forms.
- Lists and custom words remain management tools under Library.

## Practice Lab

- Practice Lab preserves valuable specialized practice without turning it into
  the main Reviews loop.
- Conjugation Check is available in Practice Lab and Library Lookup.
- Ending Lab is available in Practice Lab and can support onbin/te/ta repair.
- Classification drills and educational games may remain if they directly train
  review-relevant conjugation skills.
- Lab tools can create visible recommended Review sets. The learner starts the
  set explicitly; once practiced in Reviews, it updates normal SRS.
- The routing also runs the other way: when Reviews diagnoses a weakness that a
  Lab tool trains, the dashboard's drill for that skill opens the matching Lab
  tool directly, so specialized practice is summoned at the moment of need
  rather than only found by browsing the Lab. Current routes: godan sound-change
  misses -> Ending Lab, verb-group confusion -> Groups, and a weak speed
  dimension -> Rush. A single prioritized nudge picks the most foundational gap
  (groups first), and each form family's drill routes by its own weakest skill.
- Lab attempts do not silently change word-form SRS scheduling unless they are
  completed as full Reviews.

## Learning Defaults

- Hide English meaning until answer or reveal by default.
- Keep adaptive hints that respond to the answer typed so far.
- Keep live kana feedback with green/red behavior.
- Do not show a full count of empty kana slots before the learner has typed or
  requested a hint.
- Preserve inline AI continuation for hints, missed-answer explanations, and
  Lessons.
