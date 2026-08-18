'use client';

import Script from 'next/script';
import { STORAGE_KEY } from '../lib/state-storage';

export default function SessionStageReset() {
  return (
    <Script id="mati-session-stage-reset" strategy="beforeInteractive">
      {`try {
        var raw = localStorage.getItem('${STORAGE_KEY}');
        if (raw) {
          var state = JSON.parse(raw);
          if (state && Object.prototype.hasOwnProperty.call(state, 'manualStage')) {
            delete state.manualStage;
            localStorage.setItem('${STORAGE_KEY}', JSON.stringify(state));
          }
        }
      } catch (_) {}`}
    </Script>
  );
}
