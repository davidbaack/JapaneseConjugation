# Practice-First App Experience

This document is the product experience source of truth for learner-facing work.
Agents must read it before changing Practice, Guide, Learn, Drills, Tools, Settings,
navigation, scheduling behavior, or learner progress language.

If a proposed change goes against this design, ask the user first. If the user
confirms the new direction, update this document in the same change.

## Product Shape

- Top-level sections are Practice, Guide, Stats, Learn, Drills, Tools, and Settings.
- Practice is the landing page and the main learner loop. It is built around
  continuous practice, not bounded workouts or a visible long-term SRS queue.
- Guide is a scaffolded practice mode for recovering the base form, identifying
  the word group, and producing the target conjugation before one final submit.
  It can count as Practice progress after the full guided card is submitted, and
  it records step-level diagnostics separately.
- Stats contains progress, recommendations, upcoming reviews, and readiness
  summaries that do not need to block active Practice.
- Learn teaches forms and verb/adjective groups from start to finish. It can
  recommend focused Practice, but it does not gate Practice.
- Drills contains Ending Lab, group drills, and speed games.
- Tools contains lookup, check, word management, saved lists, and custom words.
- Settings is for durable display, audio, sync, backup, and reset preferences.
  Controls that affect active Practice belong in Practice, Drills, or Tools.

## Practice

- Practice opens directly into the next continuous card without requiring a
  Start action.
- Default Practice has no 12-card target, daily-goal stop, or completion
  summary. The learner-facing framing is continuous cards practiced, recent
  misses, category progress, practice history, and upcoming reviews.
- The active card shows a compact continuous Practice coach strip: current-run
  cards, missed count, streak, and why the current card appeared. Detailed form
  and subgroup weakness data lives in the Practice map and Stats, with coach
  strip details limited to the selection reason, top session miss pattern, and
  recent answer trail.
- The persistent Practice map shows all form families, including disabled and
  untried families, in Focus-map-style category cards. The map uses global
  Plain, Polite, Affirmative, Negative, Past, and Non-past toggles for active
  Practice scope; those toggles apply across every form family. Family cards
  can also be toggled on or off as categories, and expanded families expose
  exact form toggles for learner-controlled exceptions. Each family card shows
  active-form counts, lifetime right/wrong counts, this-session right/wrong
  balance, and an overall skill visualization. Expanded families also show
  subgroup weakness rows once there is data.
- Form scope persists through `state.enabledTypes`. The default and reset scope
  is Everyday.
- The active card may remove the current word from automatic Practice with an
  undo affordance. It must not remove a whole form family from the active card.
- Main Practice prompts from the dictionary form only for forward production
  cards. Form-to-form transformations belong in Drills, not the main Practice
  loop.
- Sentence mode remains an active-card presentation toggle. It uses bundled
  sentence chunks first when available or cached, then the shared Supabase
  sentence table, then deterministic local templates for custom, missing, or
  cold-offline rows. Forward production cards show a cued cloze with a blank,
  reverse cards show the source form in a sentence context while the learner
  recovers the dictionary form, and listening Sentence cards play the filled
  sentence as a recognition prompt with text hidden until the learner reveals
  it. Minimal-pair cards keep their normal prompt.
- A targeted "Practice this" launch (a word from Check/Library, a reference
  drill, or a form family) routes straight into the focused cards. It never
  shows the completion summary on arrival, leads with a prominent title banner
  naming what is being studied, and locks Practice to that item until the
  learner exits through the banner.

## Weakness Steering

- Practice records a first-class weakness model keyed by form type plus
  subcategory.
- Initial subcategories include ichidan, godan, suru, kuru, i-adjective,
  na-adjective, iku exception, and godan te/ta sound-change buckets.
- Each answered card records correctness, response time, form type, word group,
  derived subcategory, and word key.
- Weakness steering affects Practice selection only. It must not shorten SRS
  intervals in this version.
- Selection uses the lowest-skill enabled family after delayed retry handling.
  Exact missed cards reappear roughly five cards later when alternatives exist,
  and family skill blends lifetime correctness, recent misses, readiness data,
  and response speed. Untested and barely tested families display as neutral,
  not weak.
- Per-card weakness is recency-weighted: misses fade over roughly two weeks
  and with consecutive correct answers, so cards missed long ago but reliable
  now stop counting as weak. Card and lane weakness can boost a card within
  steady-state selection by a bounded amount, without overriding lowest-skill
  family steering, boosting untested families, or shortening SRS intervals.
- Missing godan te-form should boost related godan te-form cards, especially
  fresh or older words in that lane.
- Default Practice does not prioritize due cards. SRS data may remain stored,
  but it should not drive the default queue.
- Practice should avoid repeating the same family or verb unless there are no
  good alternatives. Repeat the category plus subcategory pattern more than the
  exact same word. Exception: when a family's best candidate is severely
  weaker (a full skill band, 15+ points) than every alternative, it may repeat
  for up to three consecutive cards while still rotating words.

## Tools

- Word inclusion and exclusion management lives in Tools under Words.
- Form/category management lives in the Practice map, not Settings and not the
  Words tool.
- Lookup and Check can launch targeted Practice for a selected word or exact form.

## Drills

- Ending Lab supports onbin and te/ta repair. Transform supports practice
  between non-dictionary source and target forms. Groups supports verb/adjective
  classification. Rush supports speed and recall.
- Drills can create visible recommended Practice sets. The learner starts the set
  explicitly; once practiced in Practice, it updates normal progress.
- Practice can also route a detected weakness into the matching Drill: godan
  sound-change misses to Ending Lab, verb-group confusion to Groups, and weak
  speed to Rush.

## Learning Defaults

- Hide English meaning until answer or reveal by default.
- Keep adaptive hints that respond to the answer typed so far.
- Keep live kana feedback with green/red behavior.
- Practice answer and review cards should not show inline pitch-accent diagrams.
  Pitch data may remain available for non-Practice pronunciation or reference
  surfaces.
- Do not show a full count of empty kana slots before the learner has typed or
  requested a hint.
- Preserve inline AI continuation for hints, missed-answer explanations, and
  Learn.
