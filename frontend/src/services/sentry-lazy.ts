const errorQueue: Error[] = [];
let sentryLoaded = false;

export function queueError(error: Error): void {
  if (sentryLoaded) {
    import('./sentry').then(mod => mod.captureException(error));
  } else {
    errorQueue.push(error);
  }
}

export function initSentryLazy(): void {
  const load = () => {
    import('./sentry').then((mod) => {
      mod.initSentry();
      sentryLoaded = true;
      for (const error of errorQueue) {
        mod.captureException(error);
      }
      errorQueue.length = 0;
    }).catch(() => {
      // Sentry failed to load — non-critical, continue without it
    });
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(load, { timeout: 3000 });
  } else {
    setTimeout(load, 3000);
  }
}
