# מתי המתי״א — MATI

**מתי המתי״א** הוא יישומון אימון רפלקטיבי־מערכתי למדריכות חינוכיות במתי״א רג״ב.

המוצר מממש תהליך עבודה שנתי בשלושה שלבים: תכנון, הערכה מעצבת והערכה מסכמת. הליבה המקצועית נשענת על מסמך העבודה והשאלון שגובשו עם הנהלת מתי״א רג״ב והפיקוח; שכבת ה־UX נועדה להפוך את אותו תוכן לכלי עבודה נוח, מדיד ורפלקטיבי — בלי לשנות את סמכות המסמך.

## מה ממומש

- שלושה חלונות גאנט: תכנון (יולי–ספטמבר), הערכה מעצבת (דצמבר–פברואר), הערכה מסכמת (מאי–יוני).
- חודשים שבין החלונות אינם מנוחשים — המערכת מבקשת לבחור שלב.
- מעבר לשלב 2 מחייב **תוכנית עבודה שמורה** עם קהל יעד, מטרת SMART, שני מדדים ומסגרת זמן.
- מעבר לשלב 3 מחייב לפחות התחלה של ההערכה המעצבת.
- שדה המטרה נבדק על תוכן בלבד. המדידוּת ומסגרת הזמן נאספות בשדות ייעודיים נפרדים, כדי לא לדרוש מהמדריכה לחזור על אותו מידע פעמיים בתוך משפט אחד.
- מסלול ממוקד: סעיפים 1, 2, 5, 8, 9. מסלול מלא: כל תשעת הסעיפים.
- כל תתי־המדדים של השאלון נשמרים כשדות נפרדים: דירוגי 1–5 ו־1–10, אחוזים, מפגשים, תצפיות, תלמידים, שעות שטח, מנהלים, משאבים, תרבות, עצמאות ועוד.
- חישובי אחוזים מתוך הנתונים: תלמידי מוקד שהשתפרו, מימוש שעות שטח, פגישות מנהלים וממוצע אפקטיביות.
- חמשת ממדי המראה המקצועית נשענים על נתונים וראיות ולא רק על עצם קיום טקסט.
- ניתוח formative כולל מגדלור חיובי, הזדמנות קריטית, סטטוס מדדים והמלצות קונקרטיות.
- היסטוריה מקומית של checkpoints מאפשרת לסגור לולאה מול הערכה קודמת.
- שלב 3 כולל הישג + מדד, נקודת מפנה, שינוי לשנה הבאה ו־rubric מותאם לפערים שנמדדו.
- שכבת התאמה דטרמיניסטית ראשונה לקצב וסגנון מענה: תמציתי/עמוק, אנליטי/אינטואיטיבי/מעורב, מינימליזם ועומס.
- RTL מלא, Heebo, mobile responsive, labels גלויים, focus states ואזורי לחיצה נוחים.
- מסלול ארגוני נפרד ב־`/org`: ייצוא חבילת signal מובנית מצד המדריכה, וקונסולה מקומית שמצרפת חבילות ומציגה דפוס רק מעל רצפת פרטיות של 5 משתתפות.

## עקרונות מוצר

1. **המסמך המקצועי הוא מקור האמת.** UX יכול לשנות דרך הצגה, לא משמעות מקצועית.
2. **ראיה לפני פרשנות.** ציון, אחוז או המלצה צריכים להיות ניתנים לעקיבה אל נתון שהמשתמשת הזינה.
3. **לא להמציא במקומות חסרים.** אם אין מספר או ראיה, מוצג "לא נמדד".
4. **כישלון = חומר ללמידה.** פער בין יעד לתוצאה מוצג כהזדמנות לשינוי מנגנון, לא כביקורת אישית.
5. **בעלות ועצמאות.** המערכת בודקת מה נשאר בשטח גם ללא תלות גבוהה במדריכה.
6. **התוכן מקצועי, לא טיפולי.** מתי המתי״א אינו כלי לזיהוי או מענה למצוקה אישית, ואינו מציע הפניה לגורם תומך. הניסוח הרך שמופיע כשמזוהה עומס בתשובות (`profile.overload` ב־`lib/stages.ts`) נוגע לקצב וסדר עדיפויות בעבודת הרפלקציה בלבד — לא לאבחון או להכלה של משבר אישי.

## פרטיות

בגרסת הפיילוט אין backend למסד נתונים ואין שליחת תוכן רפלקטיבי למודל AI חיצוני. המידע נשמר ב־`localStorage` בדפדפן המקומי, וניתן למחיקה מהממשק. לכן אין סנכרון בין מכשירים ומחיקת נתוני האתר תמחק גם את היסטוריית העבודה המקומית.

## ארכיטקטורה

```text
app/
├── layout.tsx                     # RTL, metadata, Heebo, stylesheet order
├── shell-router.tsx               # keeps /org clear of every private-state component
├── page.tsx                       # the three stages: forms, gates and professional analysis
├── experience-shell.tsx           # top navigation and the home / insight / journey shells
├── context-layer.tsx              # the contextual ribbon: calendar, device, pace, contradictions
├── work-session-layer.tsx         # one section at a time inside a stage
├── session-stage-reset.tsx        # drops a manually chosen stage at the start of a session
├── organizational-signal-layer.tsx  # derives structured signals, no free text
├── organizational-signal-preview.tsx # the boundary card and the signal export
├── org/                           # the organizational console, isolated from private state
└── *.css                          # globals, context, experience, organizational, design-saturation

lib/
├── stages.ts                      # schema, stage gates, calculations and scoring
├── state-storage.ts               # the single reader/migrator for the saved state
├── context-engine.ts              # calendar windows, context signals and coaching strategy
├── organizational-signals.ts      # signal extraction, privacy floor, systemic classification
├── organizational-pack.ts         # strict pack schema, validation and aggregation
├── download-json.ts               # browser download helper
└── ux-structural-contract.json    # the flow contract the semantic audit checks against

scripts/                           # three contract checks, all wired into CI
```

## Stack

- Next.js 16
- React 19
- TypeScript
- Next Font / Heebo
- Vercel
- localStorage לפיילוט

## פיתוח

```bash
npm ci                    # התקנה נעולה לפי package-lock.json
npm run dev
npm run build

npm run check:signals     # גבול המידע הארגוני: אין טקסט חופשי במסלול ה־signal
npm run check:design      # RTL, focus, reduced-motion, שטחי מגע
npm run check:semantic-ux # חוזה הזרימה: שערים, מסלולים ויחידות UI
```

שלוש הבדיקות רצות ב־CI לפני הבנייה.

Production pilot: `https://mati-alpha.vercel.app`

## מה עדיין אינו ממומש במלואו

שכבת שיחה גנרטיבית מלאה — שאלות המשך חופשיות, פירוש עשיר של שפה טבעית והתאמת ניסוח בזמן אמת באמצעות LLM — אינה מופעלת עדיין. ההתאמה הנוכחית מבוססת כללים ונתונים בלבד, כדי לשמור על פרטיות ועל עקיבות לפני חיבור מודל חיצוני.
