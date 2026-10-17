# Teaching repair and editorial closure — October 17, 2026

The remaining known teaching findings were addressed across the built-in lexicon,
conjugation engine, explanations, sentence profiles, readings, and shared content
admission. Unresolved sentence contexts are withheld rather than silently called
correct. This is exhaustive AI review with source-bound evidence, not native-speaker
signoff or a guarantee about arbitrary custom words and future provider output.

## Sentence accounting

All 23,075 original published pairs have a preserved original row digest, prior
review decision and rationale, current disposition, and exact target fingerprint.

| Outcome | Pairs |
|---|---:|
| Unchanged prior accepted content | 21,055 |
| Changed lexical, reading, sentence, or sense content | 1,899 |
| Previously flagged content accepted unchanged after fresh review | 70 |
| Withheld contexts | 51 |
| Current available pairs | 23,024 |

All 126 grammar forms retain reviewed examples. The implementation ledger groups
the 1,899 changed pairs and 70 renewed editorial decisions under its `repaired`
disposition; that count does not mean 1,969 mistranslations. Optional polish and
defensible colloquial/alternative forms were not automatically classified as errors.

The two independent target reviewers read every one of the first 1,931 changed or
flagged candidates. A later qualified やる definition required 93 exact target
rechecks; only matching fingerprints retained earlier approvals. The final 2,020
explicit decisions contain 1,969 accepts and 51 withholds. The other 21,055 pairs
remain exactly bound to their earlier exhaustive AI accepts.

The current corpus revision is
`83a0c24ae6acd306ab0f968ec68f06474f42e4e0b95f3f1d22de08134de83e15`.
The machine-readable summary and complete ledger are
`2026-10-17-teaching-repair.json` and `2026-10-17-teaching-repair.jsonl.gz`.

## Lexical and runtime closure

All 2,162 original loaded lexical identities were individually inspected. The
source artifact applies 81 exact source repairs, excludes 63 unsupported imported
senses, and merges eight duplicate identities while retaining canonical metadata.
The current loaded inventory contains 2,091 words: 1,354 verbs and 737 adjectives.

The lexical resolution ledger accounts for 734 retained original identities,
1,365 repaired or restricted identities, and 63 excluded imports. Every current word
has a source-bound resolution, and no mandatory flag from this review remains
unresolved. These counts differ from raw source edits because merges and shared
engine corrections are accounted for per original loaded word.

The final register review covers all 1,354 current verbs and all 5,416 automatic
honorific/humble slots. Only 27 explicitly reviewed lexical identities offer those
transforms, yielding 100 available targets. Other automatic transforms are withheld
until their lexical sense and social context are reviewed. This includes existing
honorific/humble words and homophones that previously received an unrelated special
form. It does not declare every withheld expression ungrammatical: conventional
doubled honorifics exist. Ordinary conjugations remain available. All 165,188
non-register outputs matched the preceding repair commit exactly.

Repairs include piano ひく, ordinary existence and elapsed-time meanings, wrong
verb groups, malformed kana and okurigana, transitive glosses, honorific stems,
問う sound changes, lexical ない/良い exceptions, conventional noun modifiers,
and unsupported derived targets. The builder now matches dictionary readings and
applicable senses instead of borrowing a conjugation group from another sense.
Exact source guards preserve valid custom homographs and calibrated variants.

The lexical evidence is `2026-10-17-lexical-repair.json` and its compressed ledger.
Dictionary evidence is pinned to [JMdict Simplified 3.6.2+20261012204142](https://github.com/scriptin/jmdict-simplified/releases/tag/3.6.2%2B20261012204142),
archive SHA-256 `4e742f7d5b0c59e6818c545b73ed3ca71618878de11f54876d3aa43a5f0cafa9`.
Dictionary POS compatibility alone is not semantic approval of every context.

## Retired approvals and publication safety

The shared canonical hash namespace is `sentence-review-v2`. Metadata version 1
is retained for database RLS compatibility. Old bundled, cached, and database
hashes fail current admission even if their text is unchanged. No content-hash denylist
or weakened content hash was introduced.

Publication preparation reads only the exact 23,075 original sentence identities.
It binds current source signatures and reconstructs all targets from the checked
ledger and corpus. Fifty-one rows receive quarantined metadata without deletion.
Two live rows still match the older honorific rendering in the digest-verified
October 7 publication archive; those exact complete historical signatures are
explicit alternate baselines. A later edit or quarantine is rejected. Publication
uses the existing atomic CAS RPC and rereads every resulting target.

No historical editorial package, learner data, or unrelated workspace setting was
changed. A fresh lexical identity does not automatically gain a new sentence
profile; repaired identities without individual context review remain pending.

## Validation

- `npm run ci:fast`: formatting, lint, all type checks, 105 files / 1,343 tests passed.
- `npm run ci` outside the Windows sandbox: 1,343 unit tests and 100 browser tests
  passed across Chromium, Firefox, and WebKit; 20 configured skips remain skips.
  The new served regression launches piano causative Practice and accepts ひかせる.
- Production build and unchanged bundle caps passed: eager 159.7/160 KB,
  precache 374.0/415 KB, total JS/CSS 321.5/330 KB.
- The narrow derived-form dispatch simplification preserves 1,071,504 compared
  answer/surface outputs across 4,252 original/current words and all 126 types.
- Production Tailwind sources cover application code and exclude tests, mocks,
  type-check fixtures, and the DEV-only History panel. Development still includes
  History styles. Existing bundle caps were not increased.
- Both full editorial-ledger checks and the 23,024-row mechanical corpus check
  passed. Independent final review found no blocking issue in the reviewed scope.
- The production lexicon loader, bundled admission, and prompt builder accepted
  every current 23,024-row prompt and rejected all 51 withheld contexts.

Live coaching, authenticated accounts, and normal-profile restore were not part
of this teaching repair. Future custom/provider content and every conceivable
word/context combination are not certified by these checks.

Primary grammar calibration: [Japan Foundation appearance-sou](https://www.kyozai.jpf.go.jp/kyozai/material/BTS00094/ja/render.do),
[spoken short causatives](https://www.kyozai.jpf.go.jp/kyozai/material/BMA00075/ja/render.do),
[standard causative-passives](https://www.kyozai.jpf.go.jp/kyozai/material/BMA00076/ja/render.do),
and [NINJAL piano reading](https://mmsrv.ninjal.ac.jp/kamus/data/item1266.html).
Register calibration also uses the [Cultural Agency's 敬語の指針](https://www.bunka.go.jp/seisaku/bunkashingikai/kokugo/hokoku/pdf/93927001_09.pdf),
including its discussion of conventional doubled forms on printed page 30.
