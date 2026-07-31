'use client';

import * as React from 'react';

import { getMacosTitlebarMetrics } from './workspace-api';

const MAC_CHROME_CONTROLS_HEIGHT = 32;
const INITIAL_MEASUREMENT_RETRY_MS = 250;

export const MAC_CHROME_CONTROLS_FALLBACK_TOP = 14;

export function useMacosChromeControlsTop(enabled: boolean) {
  const [measuredTop, setMeasuredTop] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let measurementVersion = 0;

    const measure = async (version: number) => {
      try {
        const metrics = await getMacosTitlebarMetrics();
        if (!disposed && version === measurementVersion && metrics) {
          setMeasuredTop(
            Math.max(
              0,
              metrics.trafficLightCenterY - MAC_CHROME_CONTROLS_HEIGHT / 2,
            ),
          );
        }
      } catch {
        // Keep the last valid measurement or the safe startup fallback.
      }
    };

    const scheduleMeasurement = () => {
      measurementVersion += 1;
      const version = measurementVersion;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        void measure(version);
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleMeasurement();
      }
    };

    scheduleMeasurement();
    const retryTimer = window.setTimeout(
      scheduleMeasurement,
      INITIAL_MEASUREMENT_RETRY_MS,
    );
    window.addEventListener('focus', scheduleMeasurement);
    window.addEventListener('resize', scheduleMeasurement);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('focus', scheduleMeasurement);
      window.removeEventListener('resize', scheduleMeasurement);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);

  return enabled
    ? (measuredTop ?? MAC_CHROME_CONTROLS_FALLBACK_TOP)
    : MAC_CHROME_CONTROLS_FALLBACK_TOP;
}
