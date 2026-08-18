# Structural UX Auditor

## Purpose

Catch UX friction that exists in the product structure before a user has to reveal it through frustration, abandonment, or repeated input.

The first regression this auditor protects is the Stage 1 SMART-goal bug: MATI collected success measures and timeframe in dedicated fields, while the goal validator also required the same facts inside the goal sentence. The software was internally consistent, but the user had to do the same semantic work twice.

## Model

The auditor treats every flow as a small knowledge contract:

- **field** — where the user supplies information;
- **fact** — the semantic atom supplied by that field;
- **validatorRequires** — facts that a field-level validator is allowed to demand;
- **gate** — the minimum set of facts required for the flow to advance.

A field validator should normally validate only facts that the field itself owns. Cross-field facts belong to the flow gate, where they can be satisfied by the fields that already collect them.

Example for Stage 1:

```text
audience   -> target_audience
smartGoal  -> desired_change
metric1    -> success_measure
metric2    -> success_measure
timeframe   -> timeframe

plan-ready gate =
  1 target_audience
  1 desired_change
  2 success_measure
  1 timeframe
```

The goal sentence therefore does not need to repeat the two measures and timeframe. The **plan as a whole** supplies the SMART structure.

## Failure classes

The CI audit currently detects:

- `CROSS_FIELD_VALIDATOR_DUPLICATION` — a field validator demands a fact already collected by a sibling field;
- `HIDDEN_VALIDATOR_REQUIREMENT` — a validator demands a fact that no field declares it owns;
- `UNSATISFIABLE_GATE` — the required fields cannot supply enough of a fact to satisfy the gate;
- `OVER_COLLECTION` — required fields collect more copies of a fact than the gate needs;
- `REQUIRED_FIELD_WITHOUT_GATE_PURPOSE` — a field is mandatory but contributes nothing to the gate;
- `SOURCE_DRIFT` / `UX_COPY_DRIFT` — implementation or user-facing guidance has drifted away from the declared semantic contract.

## Authority boundary

This tool audits product structure. It does **not** change professional content, scores, thresholds, stage policy, privacy policy, or professional meaning.

It can say:

> “The same semantic fact is required twice.”

It cannot say:

> “This professional fact is no longer needed.”

Removing a professional requirement still requires an explicit product/domain decision. The current Stage 1 fix does not remove SMART requirements; it locates measurement and timeframe in the dedicated fields that already collect them.

## Extending the auditor

Add another flow to `lib/ux-structural-contract.json` and describe its fields, facts, validators, and gate. Prefer stable semantic atoms over UI labels so the contract survives copy and visual redesigns.

Run:

```bash
npm run check:semantic-ux
```

The CI job must stay green before merge.
