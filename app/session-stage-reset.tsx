'use client';

import Script from 'next/script';

export default function SessionStageReset() {
  return (
    <Script id="mati-session-stage-reset" strategy="beforeInteractive">
      {`try {
        var raw = localStorage.getItem('mati-v2');
        if (raw) {
          var state = JSON.parse(raw);
          if (state && Object.prototype.hasOwnProperty.call(state, 'manualStage')) {
            delete state.manualStage;
            localStorage.setItem('mati-v2', JSON.stringify(state));
          }
        }
      } catch (_) {}`}
    </Script>
  );
}
