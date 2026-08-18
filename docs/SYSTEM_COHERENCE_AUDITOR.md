# System Coherence Auditor

## Why this exists

The Structural UX Auditor catches local flow problems such as duplicated semantic work, hidden validators and route drift. That is necessary but not sufficient.

MATI can still be locally correct and globally incoherent: code may implement one rule while documentation describes another; a privacy statement may conflict with a data path; a derived score may be displayed as if evidence exists; an unresolved state may be silently given a default; or two layers may interpret the same persisted snapshot differently.

The System Coherence Auditor therefore works one level above individual flows.

## Governing principle

> **Representation Serves Practice.**
>
> The instructor should do as little work as possible for the representation itself. MATI should do the integration, derivation and recall work where it can do so safely, while preserving the professional meaning and authority of the source.

This applies not only to form fields. It also applies to telemetry, derived state, caches, organizational projections and documentation. A representation that has no current consumer or decision is a cost to the system even if the instructor never sees it.

## Audit families

### 1. Representation integrity

The auditor asks:

- Are we asking again for a fact that already exists?
- If a fact is repeated, does the later occurrence have a distinct temporal/professional meaning?
- Is free reflection text being reused for a purpose the instructor did not supply it for?
- Does a derived representation return visible value?
- Is a derivation presented as a derivation rather than as a directly observed fact?
- Are we collecting telemetry that no current decision consumes?
- Are we persisting or carrying derived state that has no current consumer?

### 2. System coherence

The auditor asks:

- Do code, UI copy and documentation define the same gate?
- Does the same term keep the same meaning across stages?
- Does a statement about missing evidence agree with scoring/display behavior?
- Do privacy claims match the actual storage/export/transmission and identity path?
- Are detection, interpretation, recommendation, authorization and execution kept separate?
- Does an unresolved professional state remain unresolved in every support layer?
- Does the same persisted snapshot hydrate to the same semantic state everywhere?
- Is there exactly one declared source of truth for each protected professional rule?

## Recursive findings

The recursive implementation pass found and handled the following classes of inconsistency:

1. **SMART documentation drift — AUTO-FIXABLE.** README still described the retired validator that required time and measurement inside the goal sentence. The source of truth is now the whole-plan gate: target audience, desired change, two measures and timeframe.
2. **Reflection-purpose drift — AUTO-FIXABLE.** Context/interaction code semantically read reflection prose to infer overload, minimalism, tone and pace for UX adaptation. That reused professional reflection as a UX sensor. The context governor now relies on observable low-risk context such as device, session duration, calendar position and return gap. Formative response modality may be described structurally from which answer types were used, without reading prose meaning.
3. **Identity/metadata contamination — AUTO-FIXABLE.** The response-modality classifier initially counted names, framework metadata, planning fields and other unrelated state. It is now scoped only to the formative answer surface.
4. **Unused UX telemetry — AUTO-FIXABLE.** `visitCount`, `interactionCount`, touch capability and persisted width were collected or modeled without driving a current decision. They were removed. Only last visit is persisted; session start and device class are session-local because current UX decisions consume them.
5. **Unused derived organizational snapshot — AUTO-FIXABLE.** A local sanitized signal snapshot was persisted although no consumer read it. The live path is now private state → sanitized extractor → visible preview → explicit pack export, with no dead cache.
6. **Unused context state — AUTO-FIXABLE.** Context snapshots carried process history, response profile and other derived fields not consumed by the governor. They were removed so future secondary use cannot happen accidentally.
7. **Silent calendar classification — AUTO-FIXABLE.** The professional page explicitly preserved gap months as unresolved, while ExperienceShell, ContextLayer and WorkSession silently defaulted `null` to Stage 1. All support layers now preserve the unresolved state until the instructor chooses a stage.
8. **Divergent state hydration — AUTO-FIXABLE.** Several support layers independently parsed `mati-v2` with different merge depth from the professional page. A canonical `lib/state-hydration.ts` now defines the persisted-state interpretation and legacy migration for support layers; CI also checks that the professional page's legacy mapping has not drifted from it.
9. **Organizational aggregation documentation drift — AUTO-FIXABLE.** The contract said the pilot did not aggregate across instructors, while `/org` already supported manual import of multiple sanitized packs and local aggregation. The contract now describes the actual path: no backend or automatic collection, but explicit pack export plus manual local multi-pack aggregation.
10. **Anonymity overclaim — AUTO-FIXABLE.** Organizational packs were described as anonymous although stable `contributorId`, coded `contextId` and period enable linkage across time. They are now described accurately as filtered and pseudonymous. The privacy floor is explicitly not an anonymization guarantee.
11. **Auditor defect — FIX AUDITOR, NOT PRODUCT.** The old organizational-signal CI check required the dead local signal snapshot. When the snapshot was correctly removed, CI failed. The audit was updated to validate the live sanitized extraction/preview/export path instead of forcing obsolete state back into the product.
12. **Dimension score without evidence — PENDING_HUMAN_AUTHORITY.** The five-dimension scoring function floors each dimension at 2/5 even when its evidence array is empty. That internal score can also influence strongest/weakest ordering and downstream recommendations, while product copy says missing evidence is not invented. Because this touches approved professional scoring, it is not silently changed. It remains explicitly registered as `PENDING_HUMAN_AUTHORITY` until a domain decision chooses whether to suppress unevidenced dimensions from ranking/display or change the scoring rule.

## Authority model

A coherence finding can have one of three outcomes:

- **AUTO-FIXABLE** — documentation drift, dead telemetry/state, duplicated representation, stale parser, silent implementation fallback or another reversible issue that does not change professional meaning.
- **PENDING_HUMAN_AUTHORITY** — the contradiction touches scoring, thresholds, professional questions, privacy authority or another protected domain rule.
- **FALSE_POSITIVE / AUDITOR_DEFECT** — the auditor's model is wrong. Fix the auditor before touching the product.

An auditor error is never sufficient authority to modify professional content.

## What CI now protects

`npm run check:coherence` currently protects:

- whole-plan Stage 1 gate alignment across rule, save behavior and Home guidance;
- optional Stage 1 fields staying optional;
- reviewed cross-stage semantic repetitions having distinct temporal meaning;
- inquiry heuristics remaining inquiry-only and non-causal;
- free reflection prose not being mined for UX state;
- response-modality sensing staying scoped to formative answers;
- UX telemetry and derived-state minimization;
- gap months never silently becoming Stage 1;
- canonical persisted-state interpretation across support layers;
- privacy claims matching actual network, export, aggregation and pseudonymous-identity paths;
- documentation not reintroducing retired SMART/adaptation claims;
- protected professional conflicts remaining explicit rather than being silently rewritten.

The lower-level Structural UX Auditor still runs separately:

```bash
npm run check:semantic-ux
```

The full governance path is:

```text
Observed product / stored state / documentation
                ↓
        Structural UX Auditor
                ↓
       Representation integrity
                ↓
        System Coherence Auditor
                ↓
            Authority gate
        ↙          ↓           ↘
 AUTO-FIXABLE   PENDING     AUDITOR DEFECT
      ↓           ↓              ↓
    fix       contain       fix auditor
        \          |           /
                 CI
                 ↓
           merge / deploy
```

## Convergence criterion

The recursive pass is considered converged when:

1. all automated contracts and production build are green;
2. a new audit pass finds no uncontained implementation/documentation contradiction;
3. every remaining contradiction touches protected authority and is explicitly registered with owner and containment;
4. no fix is made solely to satisfy a faulty auditor;
5. no new telemetry, derived state or user work exists without a current declared consumer.
