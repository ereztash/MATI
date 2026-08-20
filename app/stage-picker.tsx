'use client';

import { canOpenStage, MatiState, Stage, stageNames, stageWindowLabel } from '../lib/stages';

/**
 * The calendar-gap question, in one place.
 *
 * It used to exist twice — byte-identical markup in app/page.tsx's gapShell and
 * again in app/experience-shell.tsx's home view — with one difference that was
 * invisible in the copy: page.tsx routed the click through a `canOpenStage`
 * check and the home view wrote `manualStage` straight to storage. Same three
 * buttons, same Hebrew, opposite rules, depending on which nav tab she happened
 * to be on. The labels also restated `stageFromDate`'s month windows as free
 * text in both copies, so moving a pilot window meant three coordinated edits.
 *
 * Both are structural now: the gate belongs to the one handler each caller
 * passes in, and the sub-labels are read from `stageWindowLabel`.
 */
/**
 * The question itself, not just the buttons. Both callers frame it in their own
 * container — a centred card in the work view, the home hero in the shell — so
 * the wording lives here while the layout stays with each of them. Without this
 * the heading and its paragraph were still duplicated verbatim in two files,
 * which is what this component's own doc comment claimed to have fixed.
 */
export const GAP_QUESTION = 'באיזה שלב בלוח השנה את נמצאת?';
export const GAP_EXPLANATION = 'התאריך הנוכחי נמצא בין חלונות הגאנט שהוגדרו. כדי לא להמציא שלב, בחרי את נקודת העבודה המתאימה.';

export default function StagePicker({ state, notice = '', onChoose }: {
  state: MatiState;
  /** Refusals from `onChoose`. Omitted where the caller already renders one. */
  notice?: string;
  onChoose: (stage: Stage) => void;
}) {
  return (
    <div className="gapOptions">
      {([1, 2, 3] as Stage[]).map((stage) => (
        <button
          key={stage}
          onClick={() => onChoose(stage)}
          aria-disabled={!canOpenStage(stage, state)}
        >
          <b>{stageNames[stage]}</b>
          <span>{stageWindowLabel(stage)}</span>
        </button>
      ))}
      {notice && <p className="gapNotice" role="status">{notice}</p>}
    </div>
  );
}
