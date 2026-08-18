# System Coherence Auditor

## Why this exists

The Structural UX Auditor catches local flow problems such as duplicated semantic work, hidden validators and route drift. That is necessary but not sufficient.

MATI can still be locally correct and globally incoherent: code may implement one rule while documentation describes another; a privacy statement may conflict with a data path; a derived score may be displayed as if evidence exists; or a UX adapter may silently reuse reflection text for a second purpose.

The System Coherence Auditor therefore works one level above individual flows.

## Governing principle

> **Representation Serves Practice.**
>
> The instructor should do as little work as possible for the representation itself. MATI should do the integration, derivation and recall work where it can do so safely, while preserving the professional meaning and authority of the source.

## Two audit families

### 1. Representation integrity

The auditor asks:

- Are we asking again for a fact that already exists?
- If a fact is repeated, does the later occurrence have a distinct temporal/professional meaning?
- Is free reflection text being reused for a purpose the instructor did not supply it for?
- Does a derived representation return visible value?
- Is a derivation presented as a derivation rather than as a directly observed fact?

### 2. System coherence

The auditor asks:

- Do code, UI copy and documentation define the same gate?
- Does the same term keep the same meaning across stages?
- Does a statement about missing evidence agree with scoring/display behavior?
- Do privacy claims match the actual storage/export/transmission path?
- Are detection, interpretation, recommendation, authorization and execution kept separate?
- Is there exactly one declared source of truth for each protected professional rule?

## First recursive pass

The first run found three classes of system-level inconsistency:

1. **Documentation drift.** The README still described the retired SMART validator that required time and measurement inside the goal sentence, even though production had moved those requirements to the whole-plan gate.
2. **Purpose drift.** The context/interaction code was semantically reading reflection prose to infer overload, minimalism, tone and pace for UX adaptation. That reused professional reflection as a UX sensor. The adaptation path now relies on observable context such as device, session duration, calendar position and return gap. Response modality may be counted structurally without reading prose meaning.
3. **Protected scoring conflict.** The product says missing evidence is not invented, while the five-dimension scoring function floors scores at 2/5 even when a dimension has no evidence. This touches an approved professional scoring rule, so the auditor does not silently change it. The conflict is registered as `PENDING_HUMAN_AUTHORITY` and CI requires it to remain explicit until a domain decision resolves it.

## Authority model

A coherence finding can have one of three outcomes:

- **AUTO-FIXABLE** — documentation drift, dead UX inference, duplicated representation or another reversible implementation issue that does not change professional meaning.
- **PENDING_HUMAN_AUTHORITY** — the contradiction touches scoring, thresholds, professional questions, privacy authority or another protected domain rule.
- **FALSE_POSITIVE / AUDITOR_DEFECT** — the auditor's model is wrong. Fix the auditor before touching the product.

An auditor error is never sufficient authority to modify professional content.

## CI

Run:

```bash
npm run check:coherence
```

The check fails on unregistered contradictions. Protected professional conflicts may pass only when explicitly registered with status `PENDING_HUMAN_AUTHORITY`, a written conflict statement and named resolution authority.

The lower-level Structural UX Auditor still runs separately:

```bash
npm run check:semantic-ux
```

Together they form:

```text
Flow semantics
      ↓
Structural UX Auditor
      ↓
Representation integrity
      ↓
System Coherence Auditor
      ↓
Authority gate
      ↓
CI / merge
```
