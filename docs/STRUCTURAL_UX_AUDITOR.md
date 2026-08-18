# Structural UX Auditor

## Purpose

Catch UX friction that exists in the product structure before a user has to reveal it through frustration, abandonment, or repeated input.

The first regression this auditor protected was the Stage 1 SMART-goal bug: MATI collected success measures and timeframe in dedicated fields, while the goal validator also required the same facts inside the goal sentence. The software was internally consistent, but the user had to do the same semantic work twice.

Version 2 expands the same idea across the full instructor journey: Stage 1 planning, Stage 2 formative reflection, and Stage 3 summative reflection.

## Model

The auditor treats every flow as a small knowledge contract:

- **field** — where the user supplies information;
- **fact** — the semantic atom supplied by that field;
- **validatorRequires** — facts that a field-level validator is allowed to demand;
- **gate** — the minimum set of facts required for the flow to advance;
- **gate mode** — `all` when every required fact must exist, or `any` when partial input is professionally valid;
- **route** — the set of semantic sections shown in a short/full path;
- **UI unit** — one professional question or work unit, even when it contains more than one technical field.

A field validator should normally validate only facts that the field itself owns. Cross-field facts belong to the flow gate, where they can be satisfied by the fields that already collect them.

Example for Stage 1:

```text
audience   -> target_audience
smartGoal  -> desired_change
metric1    -> success_measure
metric2    -> success_measure
timeframe  -> timeframe

plan-ready gate =
  1 target_audience
  1 desired_change
  2 success_measure
  1 timeframe
```

The goal sentence therefore does not need to repeat the two measures and timeframe. The **plan as a whole** supplies the SMART structure.

Stage 2 is intentionally different:

```text
q1..q9 -> formative_observation
formative-save gate = any 1 formative_observation
```

That preserves the approved rule that partial formative input is useful and valid rather than accidentally turning the short route into a hidden mandatory questionnaire.

Stage 3 also separates semantic questions from technical fields:

```text
Question 1 = achievement + achievementMetric
Question 2 = turningPoint
Question 3 = nextYearChange
```

The Work Session must therefore expose three work parts, not four.

## Failure classes

The CI audit currently detects:

- `CROSS_FIELD_VALIDATOR_DUPLICATION` — a field validator demands a fact already collected by a sibling field;
- `HIDDEN_VALIDATOR_REQUIREMENT` — a validator adds a condition not authorized by the professional gate;
- `UNSATISFIABLE_GATE` — eligible fields cannot supply enough of a fact to satisfy the gate;
- `OVER_COLLECTION` — mandatory fields collect more copies of a fact than an `all` gate needs;
- `REQUIRED_FIELD_WITHOUT_GATE_PURPOSE` — a mandatory field contributes nothing to the gate;
- `UNKNOWN_ROUTE_FIELD` / `DUPLICATE_ROUTE_FIELD` / `INCOMPLETE_ROUTE` — route definitions drift from their semantic sections;
- `UI_UNIT_COUNT_MISMATCH` / `FIELD_IN_MULTIPLE_UI_UNITS` / `UNMAPPED_REQUIRED_UI_FIELD` — technical UI parts drift from professional question units;
- `ROUTE_SOURCE_DRIFT` / `UI_UNIT_SOURCE_DRIFT` — the implementation drifts from the declared route or UI-unit contract;
- `PARTIAL_GATE_DRIFT` — Stage 2 stops honoring partial input;
- `SOURCE_DRIFT` / `UX_COPY_DRIFT` — implementation or user-facing guidance drifts from the semantic contract.

## What v2 found

The first full-flow run found two real structural issues and one auditor defect:

1. Stage 1 still had a hidden length/word-count requirement after the original SMART duplication fix. It was not part of the approved professional gate, so it was removed.
2. Stage 3 Work Session counted four DOM fields as four work parts even though the professional structure contains three questions. Achievement and its metric are now treated as one semantic work unit.
3. The first route-source parser produced false positives on the Stage 2 short/full arrays. The auditor itself was corrected before any product change was made from those findings.

That third case is intentional evidence for the governance rule: an auditor does not gain authority merely because it emitted an error. Tool failures must be separable from product failures.

## Authority boundary

This tool audits product structure. It does **not** change professional content, scores, thresholds, stage policy, privacy policy, or professional meaning.

It can say:

> “The same semantic fact is required twice.”

or:

> “The UI split one professional question into two work units.”

It cannot say:

> “This professional fact is no longer needed.”

Removing a professional requirement still requires an explicit product/domain decision. Structural corrections may only relocate, group, or stop duplicating already-approved information.

## Extending the auditor

Add another flow to `lib/ux-structural-contract.json` and describe its fields, facts, validators, gate, routes, and UI units where relevant. Prefer stable semantic atoms over UI labels so the contract survives copy and visual redesigns.

Run:

```bash
npm run check:semantic-ux
```

The CI job must stay green before merge.
