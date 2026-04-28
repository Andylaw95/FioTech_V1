import * as Sentry from '@sentry/react';

// Primary: env var (for Vercel prod). Fallback: hardcoded DSN (Ming's project).
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined ||
  'https://3e66954b837313aeff86b73e0b177dd5@o4511295318261760.ingest.de.sentry.io/4511295320817744';

export function initSentry() {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string | undefined) || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/fiotech-app\.vercel\.app/,
      /^https:\/\/wjvbojulgpmpblmterfy\.supabase\.co/,
    ],
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
    beforeSend(event, hint) {
      const msg = (hint?.originalException as any)?.message || event.message || '';
      if (typeof msg === 'string' && msg.includes('PCFSoftShadowMap has been deprecated')) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
