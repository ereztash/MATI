# MATI Organizational Signal Contract v0

## Purpose

This contract defines what MATI may learn from one instructor's local work, what must remain private, what may be transformed into an anonymous organizational signal, and what authority the system has after a pattern is detected.

The contract is intentionally stricter than the current technical architecture. MATI currently stores data locally in the browser and does not aggregate across instructors. This document prepares the boundary before any backend or managerial view exists.

## Core rule

**Reflection belongs to the instructor. The organization may learn about the system, not inspect the instructor.**

The system therefore separates four layers:

1. **Private source** — free text, personal reflection, identifiable context.
2. **Structured local signal** — categorical or quantitative evidence extracted only from structured fields.
3. **Aggregate pattern** — a non-identifying pattern across enough contributors/contexts/time windows.
4. **Human-governed organizational action** — interpretation, policy and intervention remain human authority.

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

The pilot default is `MIN_AGGREGATE_COHORT = 3` contributors before an aggregate may be surfaced. This is a technical privacy floor, not a professional threshold and not a claim of statistical anonymity.

**Lowered from 5 to 3 on 2026-08-18 by an explicit decision.** The מתי״א manager asked for sensitivity at 2–3 repetitions inside a single framework (`docs/manager-decisions.md`, Q12). With a pilot cohort of 10–30 מדריכות spread across many frameworks, a floor of 5 could plausibly surface nothing for an entire year — a privacy guarantee that prevents an organization from ever learning anything is not a neutral default, it is a decision made by omission.

The cost is carried explicitly rather than hidden. Below 5 contributors a reader who knows the cohort may be able to infer individuals, so every `SystemicPatternDecision` reports `identifiabilityRisk: 'low' | 'elevated'`, the contract check fails if that field disappears, and any surface presenting a small aggregate is expected to show the risk rather than imply anonymity. If the pilot shows that individuals are identifiable in practice, the floor should be raised again — this is the one threshold in the system whose relaxation increases risk rather than reducing it.

## When a local signal becomes systemic

Systemicity is not inferred from one report or from prevalence alone. The v0 classifier uses four dimensions:

- recurrence — more than one contributor;
- spread — more than one context;
- persistence — more than one time window;
- operational impact — whether the signal can materially affect the ability to achieve the approved professional goals.

The classifier distinguishes:

- `local_observation`
- `local_cluster` — surfaced for inquiry **only when it carries operational impact** (Q12 asks for local sensitivity; Q11 refuses recurrence alone as a systemic signal)
- `cross_context_pattern`
- `persistent_pattern`
- `systemic_candidate`

A `systemic_candidate` is still **not a causal diagnosis**. It means the organization has enough distributed evidence to justify human inquiry. The same holds, more strongly, for a surfaced `local_cluster`: it is a question to take to the field (Q22), not a finding.

## Authority after detection

MATI may automatically:

- extract a structured signal;
- aggregate eligible signals after the privacy floor;
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

The current MATI pilot implements only the first three as local deterministic code plus the pattern classifier as a pure function. It does not yet send or aggregate signals across devices.

## Future backend requirement

Any future multi-user implementation must preserve this contract in the storage model itself, not only in UI copy. In particular:

- raw private reflections and organizational signal records must be separate data classes;
- individual raw reflections must not be readable by manager/supervisor roles by default;
- aggregate queries must enforce the privacy floor server-side;
- organizational actions must record the human authority that approved them;
- audit records must distinguish detection, recommendation, decision and action.
