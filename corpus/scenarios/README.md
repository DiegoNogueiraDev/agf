# Scenario corpus

Real-world scenario texts, in the phrasings people actually write, used to exercise
`nl-scenario-compiler` beyond hand-built fixtures.

A fixture proves the happy path you imagined; a corpus catches the sentence you did
not. The compiler is regex over prose, so its failure mode is silent: an
unrecognised line becomes an unresolved step (or worse, matches the wrong rule) and
the scenario still "runs" — proving less than the author believed.

Add a file here whenever you meet a phrasing the compiler should understand.
Every file is a scenario: one instruction or expectation per line.
