# Feature4: Reference-to-Practice Launchers

## Summary

Make every reference table row actionable. A learner who looks up a rule should be able to immediately drill that rule, compare it with a nearby rule, or add it to their weak-form practice set.

## User Problem

Reference pages are useful but passive. Learners often look up a rule, understand it briefly, and then leave without practicing enough to retain it.

## Experience

Each rule row includes compact actions:

```text
Godan te-form: mu/bu/nu -> nde
[Drill this] [Compare] [Add to weak forms]
```

Selecting "Drill this" starts a focused practice session using verbs that match the row. Selecting "Compare" launches a minimal-pair drill against similar rules.

## Functional Requirements

- Add practice actions to reference rules and form tables.
- Map each reference row to a drill filter.
- Allow users to add a rule to a weak-form list.
- Preserve the current fast reference browsing experience.

## Acceptance Criteria

- A user can launch a focused drill from a reference row in one interaction.
- The launched drill only includes items relevant to that rule.
- The app can return to the original reference context after practice.
- Reference actions do not clutter the table on small screens.

## Out of Scope

- Rebuilding the full reference layout.
- Long lessons attached to every rule.
- Public sharing of reference annotations.
