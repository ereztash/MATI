'use client';

import { usePathname } from 'next/navigation';
import ContextLayer from './context-layer';
import ExperienceShell from './experience-shell';
import OrganizationalSignalLayer from './organizational-signal-layer';
import SessionStageReset from './session-stage-reset';
import WorkSessionLayer from './work-session-layer';

export default function ShellRouter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOrganizationalSurface = pathname === '/org' || pathname.startsWith('/org/');

  if (isOrganizationalSurface) return <>{children}</>;

  return (
    <>
      <SessionStageReset />
      <ExperienceShell>
        <ContextLayer />
        <WorkSessionLayer />
        {children}
      </ExperienceShell>
      <OrganizationalSignalLayer />
    </>
  );
}
