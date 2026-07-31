import * as React from 'react';

import { formatDailyMonth } from './daily-notes';
import { listDailyNotesForMonth } from './workspace-api';
import type { DailyNoteEntry } from './workspace-types';

interface UseDailyNotesOptions {
  rootPath: string | null;
}

export function useDailyNotes({ rootPath }: UseDailyNotesOptions) {
  const [state, setState] = React.useState<{
    entries: DailyNoteEntry[];
    error: string | null;
    isLoading: boolean;
    rootPath: string | null;
  }>({ entries: [], error: null, isLoading: false, rootPath });
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    requestIdRef.current += 1;
  }, [rootPath]);

  const loadMonth = React.useCallback(
    async (month: Date) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!rootPath) {
        setState({ entries: [], error: null, isLoading: false, rootPath: null });
        return;
      }

      setState((current) => ({
        entries: current.rootPath === rootPath ? current.entries : [],
        error: null,
        isLoading: true,
        rootPath,
      }));

      try {
        const result = await listDailyNotesForMonth(
          rootPath,
          formatDailyMonth(month),
        );

        if (requestIdRef.current === requestId) {
          setState({
            entries: result.entries,
            error: null,
            isLoading: false,
            rootPath,
          });
        }
      } catch (loadError) {
        if (requestIdRef.current === requestId) {
          setState((current) => ({
            entries: current.rootPath === rootPath ? current.entries : [],
            error: formatDailyNotesError(loadError),
            isLoading: false,
            rootPath,
          }));
        }
      }
    },
    [rootPath],
  );

  const visibleState = state.rootPath === rootPath
    ? state
    : { entries: [], error: null, isLoading: false };

  return {
    entries: visibleState.entries,
    error: visibleState.error,
    isLoading: visibleState.isLoading,
    loadMonth,
  };
}

function formatDailyNotesError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
