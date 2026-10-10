import * as React from 'react';
import { toast } from 'sonner';

import { setAppUiScale } from './workspace-api';

export function useUiScale(scale: number, desktop: boolean) {
  const [appliedScale, setAppliedScale] = React.useState(100);
  const queue = React.useRef(Promise.resolve());

  React.useEffect(() => {
    let cancelled = false;
    queue.current = queue.current.then(async () => {
      if (cancelled) return;
      try {
        if (desktop) await setAppUiScale(scale);
        else document.documentElement.style.zoom = String(scale / 100);
        if (!cancelled) {
          document.documentElement.style.setProperty('--app-ui-scale', String(scale / 100));
          setAppliedScale(scale);
          window.dispatchEvent(new Event('resize'));
        }
      } catch {
        if (!cancelled) toast.error('无法应用界面缩放，请重新选择后重试');
      }
    });
    return () => { cancelled = true; };
  }, [scale, desktop]);

  React.useEffect(() => () => {
    document.documentElement.style.removeProperty('zoom');
    document.documentElement.style.removeProperty('--app-ui-scale');
  }, []);

  return appliedScale;
}
