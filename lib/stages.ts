export type Stage = 1 | 2 | 3;

export type Plan = {
  audience: string;
  smartGoal: string;
  metric1: string;
  metric2: string;
  timeframe: string;
  flexibility: string;
  managers: string;
  independence: string;
  savedAt?: string;
};

export type Formative = {
  route: 'short' | 'full';
  answers: Record<string, string>;
  savedAt?: string;
};

export type Summative = {
  achievement: string;
  turningPoint: string;
  nextYearChange: string;
  savedAt?: string;
};

export type MatiState = {
  plan: Plan;
  formative: Formative;
  summative: Summative;
  manualStage?: Stage;
};

export const emptyState: MatiState = {
  plan: {
    audience: '',
    smartGoal: '',
    metric1: '',
    metric2: '',
    timeframe: '',
    flexibility: '',
    managers: '',
    independence: '',
  },
  formative: { route: 'short', answers: {} },
  summative: { achievement: '', turningPoint: '', nextYearChange: '' },
};

export function stageFromDate(date = new Date()): Stage {
  const month = date.getMonth() + 1;
  if (month >= 5 && month <= 6) return 3;
  if (month === 12 || month === 1 || month === 2) return 2;
  return 1;
}

export function planReady(plan: Plan) {
  return Boolean(
    plan.audience.trim() &&
      plan.smartGoal.trim() &&
      plan.metric1.trim() &&
      plan.metric2.trim() &&
      plan.timeframe.trim()
  );
}

export function formativeStarted(formative: Formative) {
  return Object.values(formative.answers).some((value) => value.trim().length > 0);
}

export function canOpenStage(stage: Stage, state: MatiState) {
  if (stage === 1) return true;
  if (stage === 2) return planReady(state.plan);
  return planReady(state.plan) && formativeStarted(state.formative);
}

export function scoreDimensions(state: MatiState) {
  const { plan, formative } = state;
  const answers = Object.values(formative.answers).join(' ');
  return [
    {
      name: 'רפלקציה ולמידה',
      score: Math.min(5, 2 + Number(Boolean(plan.flexibility)) + Number(Boolean(formative.answers.q8)) + Number(Boolean(formative.answers.q5))),
      note: 'בקרה עצמית, גמישות ושינוי בעקבות תובנות',
    },
    {
      name: 'מדדים כמותניים',
      score: Math.min(5, 2 + Number(Boolean(plan.metric1)) + Number(Boolean(plan.metric2)) + Number(/%|אחוז|מספר|כמות/.test(answers))),
      note: 'הוכחת שיפור ואיכות המדדים',
    },
    {
      name: 'לוח זמנים ויישום',
      score: Math.min(5, 2 + Number(Boolean(plan.timeframe)) + Number(Boolean(formative.answers.q3)) + Number(Boolean(formative.answers.q1))),
      note: 'אחוז מימוש, גמישות וזיהוי חסמים',
    },
    {
      name: 'מערכת ואחריות',
      score: Math.min(5, 2 + Number(Boolean(plan.managers)) + Number(Boolean(formative.answers.q6)) + Number(/מנהל|צוות|משאב/.test(answers))),
      note: 'מנהלים, משאבים וחלוקת אחריות',
    },
    {
      name: 'אופרטיביות ועצמאות',
      score: Math.min(5, 2 + Number(Boolean(plan.independence)) + Number(Boolean(formative.answers.q2)) + Number(Boolean(formative.answers.q7))),
      note: 'שינוי עקבי שמתקיים גם בלי תלות במדריכה',
    },
  ];
}
