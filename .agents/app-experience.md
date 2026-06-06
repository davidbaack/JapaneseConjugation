# Practice-First App Experience

This document is the product experience source of truth for learner-facing work.
Agents must read it before changing Practice, Learn, Tools, Settings,
navigation, scheduling behavior, or learner progress language.

If a proposed change goes against this design, ask the user first. If the user
confirms the new direction, update this document in the same change.

## Product Shape

- Top-level sections are Practice, Stats, Learn, Tools, and Settings.
- Practice is the landing page and the main learner loop. It is built around
  short workouts, not a visible long-term SRS queue.
- Stats contains progress, recommendations, upcoming reviews, and readiness
  summaries that do not need to block the active workout.
- Learn teaches forms and verb/adjective groups from start to finish. It can
  recommend focused Practice, but it does not gate Practice.
- Tools contains lookup, check, word management, saved lists, custom words,
  Ending Lab, group drills, and speed games.
- Settings is for durable display, audio, sync, backup, and reset preferences.
  Controls that affect the active workout belong in Practice or Tools.

## Practice

- Practice opens directly into the default workout without requiring a Start
  action.
- The default workout target is 12 cards. Ready cards still matter, but the
  learner-facing framing is session progress, ready cards, recent misses,
  practice history, and next workout rather than SRS intervals.
- The active card shows session progress. Detailed form and subgroup weakness
  data lives in the Practice map and Stats.
- The persistent Practice map shows all form families, including disabled and
  untried families. Expanded families show exact-form toggles plus subgroup
  weakness rows once there is data.
- Form scope persists through `state.enabledTypes`. The default and reset scope
  is Core plus Everyday.
- The active card may remove the current word from automatic Practice with an
  undo affordance. It must not remove a whole form family from the active card.
- Sentence mode remains an active-card presentation toggle. It wraps a normal
  forward production card in a cued example sentence with a blank and grammar
  cue, and falls back to the normal prompt for reverse, listening, and
  minimal-pair cards.
- Session completion leads with "Map updated" and one next action.

## Weakness Steering

- Practice records a first-class weakness model keyed by form type plus
  subcategory.
- Initial subcategories include ichidan, godan, suru, kuru, i-adjective,
  na-adjective, iku exception, and godan te/ta sound-change buckets.
- Each answered card records correctness, response time, form type, word group,
  derived subcategory, and word key.
- Weakness steering affects workout selection only. It must not shorten SRS
  intervals in this version.
- Selection uses subcategory-first weighting. Exact missed cards receive some
  boost, but the broader weak lane receives the main boost.
- Missing godan te-form should boost related godan te-form cards, especially
  fresh or older words in that lane.
- A workout should avoid repeating the same verb unless there are no good
  alternatives. Repeat the category plus subcategory pattern more than the exact
  same word.

## Tools

- Word inclusion and exclusion management lives in Tools under Words.
- Form/category management lives in the Practice map, not Settings and not the
  Words tool.
- Lookup and Check can launch targeted Practice for a selected word or exact form.
- Ending Lab supports onbin and te/ta repair. Groups supports verb/adjective
  classification. Rush supports speed and recall.
- Tools can create visible recommended Practice sets. The learner starts the set
  explicitly; once practiced in Practice, it updates normal progress.
- Practice can also route a detected weakness into the matching Tool: godan
  sound-change misses to Ending Lab, verb-group confusion to Groups, and weak
  speed to Rush.

## Learning Defaults

- Hide English meaning until answer or reveal by default.
- Keep adaptive hints that respond to the answer typed so far.
- Keep live kana feedback with green/red behavior.
- Do not show a full count of empty kana slots before the learner has typed or
  requested a hint.
- Preserve inline AI continuation for hints, missed-answer explanations, and
  Learn.
