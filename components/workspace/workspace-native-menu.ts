export const OPEN_SETTINGS_EVENT = 'markune-open-settings';
export const CHECK_UPDATE_EVENT = 'markune-check-update';

type NativeEventListener = (
  event: string,
  handler: () => void,
) => Promise<() => void>;

export function subscribeToNativeSettingsOpen(
  listen: NativeEventListener,
  onOpenSettings: () => void,
  onError: (error: unknown) => void,
) {
  return subscribeToNativeMenuEvent(
    listen,
    OPEN_SETTINGS_EVENT,
    onOpenSettings,
    onError,
  );
}

export function subscribeToNativeUpdateCheck(
  listen: NativeEventListener,
  onCheckUpdate: () => void,
  onError: (error: unknown) => void,
) {
  return subscribeToNativeMenuEvent(
    listen,
    CHECK_UPDATE_EVENT,
    onCheckUpdate,
    onError,
  );
}

function subscribeToNativeMenuEvent(
  listen: NativeEventListener,
  event: string,
  handler: () => void,
  onError: (error: unknown) => void,
) {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  void listen(event, handler)
    .then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    })
    .catch(onError);

  return () => {
    disposed = true;
    unlisten?.();
  };
}
