import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import './context.css';
import './experience.css';
import './organizational-signals.css';
import ContextLayer from './context-layer';
import SessionStageReset from './session-stage-reset';
import ExperienceShell from './experience-shell';
import WorkSessionLayer from './work-session-layer';
import OrganizationalSignalLayer from './organizational-signal-layer';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'מתי המתי״א | מתי״א רג״ב',
  description: 'יישומון רפלקטיבי־מערכתי לתכנון, הערכה מעצבת והערכה מסכמת למדריכות מתי״א רג״ב.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body>
        <SessionStageReset />
        <ExperienceShell>
          <ContextLayer />
          <WorkSessionLayer />
          {children}
        </ExperienceShell>
        <OrganizationalSignalLayer />
      </body>
    </html>
  );
}
