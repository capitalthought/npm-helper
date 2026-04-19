# classifier fixtures

Real `npm` stderr samples captured from production failures. Each file
is the full stderr of a failed command — preserve the original text
when adding new ones so we catch wording drift.

## Contract

- Filename describes the failure: `<short-slug>.txt`
- File body is raw stderr, no JSON wrapper
- Every fixture has a corresponding assertion in `classify.test.ts` —
  add both together or don't add either

## Why fixtures over inline strings

npm error messages drift every few releases. When a fixture breaks,
we know the classifier regressed against a real-world input rather
than a hand-typed approximation.

Add a fixture every time a new failure mode shows up in the wild.
That's the entire feedback loop for keeping the classifier honest.
