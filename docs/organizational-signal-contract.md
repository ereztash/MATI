# MATI Organizational Signal Contract v0

## Purpose

This contract defines what MATI may learn from one instructor's local work, what must remain private, what may be transformed into a filtered pseudonymous organizational signal, and what authority the system has after a pattern is detected.

The contract is intentionally stricter than a future multi-user architecture. MATI currently stores each instructor's raw professional data locally in the browser. It can also export a filtered organizational signal pack and, in the separate local `/org` console, manually import multiple sanitized packs and aggregate them inside that browser. There is no backend, no automatic cross-device collection and no automatic transmission of raw reflection.

## Core rule

**Reflection belongs to the instructor. The organization may learn about the system, not inspect the instructor.**

The system therefore separates four layers:

1. **Private source** — free text, personal reflection, identifiable context.
2. **Structured local signal** — categorical or quantitative evidence extracted only from structured fields.
3. **Aggregate pattern** — a non-identifying pattern across enough contributors/contexts/time windows.
4. **Human-governed organizational action** — interpretation, policy and intervention remain human authority.

## Pseudonymity, not anonymity

A signal pack contains a stable random `contributorId`, a coded `contextId`, and a `periodId`. These fields intentionally support linking the same pseudonymous contributor/context across periods. They do not contain the instructor's name or framework name, but the pack is therefore **pseudonymous rather than anonymous**.

The privacy floor of five contributors reduces exposure before patterns are surfaced; it is not an anonymization guarantee. The local `/org` console must not describe contributors or packs as mathematically anonymous.

## Projection policy

| Data class | Instructor | Manager / supervisor, individual level | Aggregate use |
|---|---|---|---|
| Free-text reflection | allowed | denied | denied |
| Personal difficulty, mistake, frustration, turning point | allowed | denied | denied |
| Instructor / framework identifiers | allowed locally | denied by default | denied |
| Structured implementation measures | allowed | denied individually | allowed after privacy floor |
| Structured manager/resource measures | allowed | denied individually | allowed after privacy floor |
| Structured independence/sustainability measures | allowed | denied individually | allowed after privacy floor |
| Completion / checkpoint state | allowed | denied individually | aggregate only |

No exact free-text field is eligible for organizational aggregation in v0.

## Signal vocabulary v0

Signals are extracted only from structured fields already present in the approved professional instrument:

- `implementation_rate`
- `goal_attainment`
- `meeting_execution`
- `implementation_depth`
- `student_impact`
- `student_improvement_rate`
- `manager_meeting_rate`
- `manager_commitment`
- `resource_allocation`
- `resource_allocation_rate`
- `teacher_independence`
- `sustainability`
- `team_feedback_presence`

Each signal carries a stage, structured value, confidence and projection policy. It does **not** carry instructor name, framework name, exact reflection text, evidence text, notes, shortages, mistakes or emotional content.

## Privacy floor

The pilot default is `MIN_AGGREGATE_COHORT = 5` contributors before an aggregate may be surfaced. This is a technical privacy floor, not a professional threshold and not a claim of statistical anonymity. A future deployment may require a stricter threshold based on the real cohort structure.

## When a local signal becomes systemic

Systemicity is not inferred from one report or from prevalence alone. The v0 classifier uses four dimensions:

- recurrence — more than one contributor;
- spread — more than one context;
- persistence — more than one time window;
- operational impact — whether the signal can materially affect the ability to achieve the approved professional goals.

The classifier distinguishes:

- `local_observation`
- `local_cluster`
- `cross_context_pattern`
- `persistent_pattern`
- `systemic_candidate`

A `systemic_candidate` is still **not a causal diagnosis**. It means the organization has enough distributed evidence to justify human inquiry.

## Authority after detection

MATI may automatically:

- extract a structured signal;
- aggregate eligible signals after the privacy floor inside the local organizational console;
- detect recurrence, spread and persistence;
- surface a pattern;
- suggest a question for human review.

MATI may not automatically:

- expose an instructor's private reflection;
- identify an instructor as the source of an organizational problem;
- infer blame;
- assert causality from a pattern;
- set policy;
- direct an organizational intervention;
- execute an organizational change.

Policy and intervention require human authority.

## Architecture boundary

The intended flow is:

`private source -> structured signal -> projection gate -> aggregate pattern -> governance gate -> human decision`

The current MATI pilot implements the private source and structured projection locally, explicit export of sanitized pseudonymous signal packs, manual import of multiple packs into `/org`, local aggregation after the privacy floor, and the pattern classifier as deterministic code. It does **not** automatically collect across devices, synchronize instructors, transmit raw reflection, or provide a backend organizational database.

## Future backend requirement

Any future multi-user implementation must preserve this contract in the storage model itself, not only in UI copy. In particular:

- raw private reflections and organizational signal records must be separate data classes;
- individual raw reflections must not be readable by manager/supervisor roles by default;
- aggregate queries must enforce the privacy floor server-side;
- organizational actions must record the human authority that approved them;
- audit records must distinguish detection, recommendation, decision and action.
