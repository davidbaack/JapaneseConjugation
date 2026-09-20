# Selection-First Practice Experience

This document is the product experience source of truth for learner-facing work.
Agents must read it before changing Practice, Guide, Learn, Drills, Tools, Settings,
navigation, scheduling behavior, or learner progress language.

If a proposed change goes against this design, ask the user first. If the user
confirms the new direction, update this document in the same change.

## Product Shape

- Top-level sections are Practice, Guide, Stats, Learn, Drills, Tools, and Settings.
- On narrow screens those seven sections stay in one horizontally scrollable tab
  row rather than wrapping into a second navigation row. Boundary-aware edge
  fades show when more destinations are available, and the active destination
  is always scrolled fully into view. The same pattern applies to nested Tools
  and Drills tab rows.
- Practice is the landing page and the main learner loop. It is built around
  continuous practice, not bounded workouts or a visible long-term SRS queue.
- Guide is a scaffolded practice mode for recovering the base form, identifying
  the word group, and producing the target conjugation through three gated steps.
  It checks each first response immediately, keeps completed-step summaries
  available for review, and requires a missed step to be corrected before the
  learner can continue. The original miss remains the recorded result.
  It can count as Practice progress once after the final step is resolved, and it
  records step-level diagnostics separately.
- Stats is the home for lifetime attempts, dated improvement trends, recent
  misses, answer-mode comparisons, topic strength, and one primary
  recommendation. It does not frame progress around daily goals, scheduled
  reviews, or completed sessions. Accuracy always appears with its attempt
  count, and one or two attempts are explicitly labeled as an early estimate.
- Learn teaches forms and verb/adjective groups from start to finish through
  three collapsed tracks and one searchable lesson index. Practice topics and
  Learn lessons use the same exact-form taxonomy. Semantically related lessons
  may remain adjacent in a teaching track, but mechanically distinct forms such
  as Volitional and Wanting, or Honorific and Humble, remain separate lessons.
  A Learn practice action replaces the current Practice selection with the
  lesson's forms; it does not create a bounded or temporary session.
- Drills contains Ending Lab, group drills, and speed games.
- Tools contains lookup, check, word management, saved lists, and custom words.
- Settings is for durable display, audio, sync, backup, and reset preferences.
  Controls that affect active Practice belong in Practice, Drills, or Tools.

## Practice

- Practice opens directly into the next continuous card without requiring a
  Start action.
- Practice has no run, workout, daily-goal, completion, or temporary-focus
  framing. The learner chooses what they want to practice and answers
  continuously.
- Practice leads with a compact selection surface: Mixed practice, quick topic
  picks, the selected custom mix, and a Browse all disclosure. Topics are
  positive selections rather than exclusions. Exact forms are optional
  refinements inside a selected topic.
- Mixed practice is a reversible override. Turning it on uses the broad mixed
  pool while retaining the learner's custom topics and exact-form refinements.
  Turning it off restores that custom mix. Choosing a topic while Mixed is on
  exits Mixed and starts with that topic.
- Practice restores the last selected custom mix across launches. Multiple
  topics are balanced by topic rather than by raw exact-form count, so a large
  topic cannot drown out a small one.
- A manual topic or exact-form change keeps the active card if it is still
  eligible. If the card becomes ineligible it is replaced immediately, the
  unfinished answer is cleared, and no skip, miss, retry, or progress event is
  recorded.
- Practice settings control answer style, kana help, sentence context, and
  other presentation choices without creating a session. The answer field and
  primary action remain reachable above the soft keyboard; Hint, Reveal, and
  Skip stay adjacent as secondary actions. Next card is likewise sticky during
  review.
- Practice selection persists through `state.practiceSelection`; `enabledTypes`
  is a derived compatibility input for the card-selection engine.
- The active card may remove the current word from automatic Practice with an
  undo affordance. It must not remove a whole form family from the active card.
- Main Practice prompts from the dictionary form only for forward production
  cards. Form-to-form transformations belong in Drills, not the main Practice
  loop.
- Exercise surfaces use one concise, deterministic exercise meaning. Curated
  starter meanings take priority and imported words fall back to their first
  sense. Lookup retains the complete dictionary meaning and alternate senses.
- Sentence mode remains an active-card presentation toggle. It uses bundled
  sentence chunks first when available or cached, then the shared Supabase
  sentence table, then deterministic local templates for custom, missing, or
  cold-offline rows. Forward production cards show a cued cloze with a blank,
  reverse cards show the source form in a sentence context while the learner
  recovers the dictionary form, and listening Sentence cards play the filled
  sentence as a recognition prompt with text hidden until the learner reveals
  it. Minimal-pair cards keep their normal prompt.
- A word-level "Practice this" launch from Check or Lookup may lock Practice to
  that word until the learner exits. A form, lesson, track, recommendation, or
  Stats launch updates the persistent Practice selection directly; it does not
  create a temporary focus or completion target.

## Weakness Steering

- Practice records a first-class weakness model keyed by form type plus
  subcategory.
- Initial subcategories include ichidan, godan, suru, kuru, i-adjective,
  na-adjective, iku exception, and godan te/ta sound-change buckets.
- Each answered card records correctness, response time, form type, word group,
  derived subcategory, and word key.
- Weakness steering affects Practice selection only. It must not shorten SRS
  intervals in this version.
- Selection uses the lowest-skill enabled topic after delayed retry handling.
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
- Practice does not expose or prioritize a due queue. SRS data may remain stored
  as an internal aid, but it does not frame the learner experience.
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
- Lookup starts with search, recent items, and suggestions; it does not render a
  dictionary entry or inventory until the learner enters or chooses a word. Full
  conjugation tables are disclosed on demand. Ambiguous exact forms require an
  explicit learner choice; chooser cards avoid repeated rules, the chosen rule
  appears once in the detail panel, and other dictionary matches remain in a
  separate collapsed disclosure while exact results exist.
- Words and list word pickers render 30 results at a time. Lists lead with My
  lists, disclose built-in packs and the AI builder, and show an editor only for
  the selected list. Custom Words leads with learner-added entries and discloses
  starter vocabulary separately.

## Drills

- Ending Lab supports onbin and te/ta repair. Transform supports practice
  between non-dictionary source and target forms by recovering the same
  dictionary word and rebuilding the named target. Grammar from the starting
  form does not carry over unless the target names it. Groups supports verb/adjective
  classification. Rush supports speed and recall.
- Every drill starts with its exercise. Recommendations and detailed metrics
  follow the task. Transform reuses Practice grading in a compact presentation
  without the Practice coach strip, continuous framing, or Practice map. It
  labels Starting form and Target form explicitly, and word JLPT metadata is
  labeled as a word level rather than grammar difficulty.
- Drills can recommend a Practice selection. Accepting it changes the same
  persistent topic/form selection used everywhere else; it does not create a
  set with a target length.
- Practice can also route a detected weakness into the matching Drill: godan
  sound-change misses to Ending Lab, verb-group confusion to Groups, and weak
  speed to Rush.

## Settings

- Display and audio controls remain immediately available. Backup, restore,
  cleanup, and reset controls are grouped under the view-local Data & account
  disclosure; destructive actions retain an additional explicit confirmation.

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
- Answer review leads with outcome, correct answer, learner answer, one concise
- Answer review includes a small progress block after every graded conjugation:
  the exact form first, then its learner-facing Practice topic. Recognition and
  production evidence remain distinguishable, and sparse evidence is labeled
  First attempt or Early estimate rather than implying a reliable trend.
