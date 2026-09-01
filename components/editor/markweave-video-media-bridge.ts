import type { WorkspaceMediaSourceResolver } from '@/components/editor/use-workspace-asset-uploader';
import { isWorkspaceAssetReference } from '@/components/workspace/workspace-local-assets';

type MarkweaveMediaResolveReason =
  | 'initial'
  | 'viewport'
  | 'retry'
  | 'image-error'
  | 'output';

type VideoMediaSourceResolver = (
  request: Parameters<WorkspaceMediaSourceResolver>[0] & {
    attempt: number;
    reason: MarkweaveMediaResolveReason;
  },
) => ReturnType<WorkspaceMediaSourceResolver>;

interface MarkweaveOutputEventDetail {
  readonly signal: AbortSignal;
  readonly waitUntil: (promise: PromiseLike<unknown>) => void;
}

interface VideoResolutionState {
  attempt: number;
  candidateSrc: string | null;
  controller: AbortController | null;
  cyclePriority: 'nearby' | 'visible';
  cycleReason: MarkweaveMediaResolveReason | null;
  cycleRetryIndex: number;
  cycleSignal: AbortSignal | null;
  detachCycleSignal: (() => void) | null;
  generation: number;
  lastFailure: 'missing' | 'unreadable' | null;
  loadTimer: number | null;
  onError: () => void;
  onLoadedMetadata: () => void;
  onResolveVisualResource: (event: Event) => void;
  pendingPromise: Promise<void> | null;
  resolvePending: (() => void) | null;
  resolveTimer: number | null;
  retryTimer: number | null;
  status: 'pending' | 'resolved' | 'missing' | 'unreadable';
  storageSrc: string;
}

const MARKWEAVE_PREPARE_OUTPUT_EVENT = 'markweave:prepare-output';
const MARKWEAVE_RESOLVE_VISUAL_RESOURCE_EVENT =
  'markweave:resolve-visual-resource';
const VIDEO_SELECTOR = 'video[data-markweave-video="true"]';
const RESOLVER_TIMEOUT_MS = 8_000;
const VIDEO_LOAD_TIMEOUT_MS = 12_000;
const RETRY_DELAYS_MS = [250, 1_000] as const;
const videoStorageSources = new WeakMap<HTMLVideoElement, string>();

function getOutputEventDetail(event: Event) {
  const detail = (event as CustomEvent<MarkweaveOutputEventDetail>).detail;

  if (
    !detail ||
    typeof detail.waitUntil !== 'function' ||
    typeof detail.signal?.aborted !== 'boolean' ||
    typeof detail.signal.addEventListener !== 'function' ||
    typeof detail.signal.removeEventListener !== 'function'
  ) {
    return null;
  }

  return detail;
}

/**
 * Markweave 0.10 resolves image NodeViews through the host resolver, while its
 * React video NodeView still renders the persisted source directly. This
 * bridge keeps the ProseMirror source untouched and projects a resolved URL
 * only onto local video DOM nodes.
 */
export function installMarkweaveVideoMediaBridge(
  root: HTMLElement,
  resolver: VideoMediaSourceResolver,
) {
  const ownerWindow = root.ownerDocument.defaultView;

  if (!ownerWindow) {
    return () => {};
  }

  const editorWindow: Window = ownerWindow;
  const states = new Map<HTMLVideoElement, VideoResolutionState>();
  const IntersectionObserverCtor =
    ownerWindow.IntersectionObserver ?? globalThis.IntersectionObserver;
  const MutationObserverCtor =
    ownerWindow.MutationObserver ?? globalThis.MutationObserver;
  let destroyed = false;

  const clearTimer = (timer: number | null) => {
    if (timer !== null) {
      ownerWindow.clearTimeout(timer);
    }
  };

  const reloadVideo = (video: HTMLVideoElement, src?: string) => {
    if (src) {
      if (video.getAttribute('src') !== src) {
        video.setAttribute('src', src);
      }
    } else {
      video.removeAttribute('src');
    }

    try {
      video.load();
    } catch {
      // Some test DOMs and older embedded engines do not implement load().
    }
  };

  const setState = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
    status: VideoResolutionState['status'],
  ) => {
    state.status = status;
    video.dataset.mediaState = status;
  };

  const clearAttempt = (state: VideoResolutionState) => {
    state.generation += 1;
    state.controller?.abort();
    state.controller = null;
    clearTimer(state.resolveTimer);
    clearTimer(state.loadTimer);
    state.resolveTimer = null;
    state.loadTimer = null;
  };

  const clearRetry = (state: VideoResolutionState) => {
    clearTimer(state.retryTimer);
    state.retryTimer = null;
  };

  const detachCycleSignal = (state: VideoResolutionState) => {
    state.detachCycleSignal?.();
    state.detachCycleSignal = null;
    state.cycleSignal = null;
  };

  const settleCycle = (state: VideoResolutionState) => {
    detachCycleSignal(state);
    state.resolvePending?.();
    state.pendingPromise = null;
    state.resolvePending = null;
    state.cycleReason = null;
    state.cycleRetryIndex = 0;
  };

  const cancelCycle = (state: VideoResolutionState) => {
    clearAttempt(state);
    clearRetry(state);
    settleCycle(state);
  };

  const finishTerminalFailure = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
    status: 'missing' | 'unreadable',
  ) => {
    clearAttempt(state);
    clearRetry(state);
    state.candidateSrc = null;
    state.lastFailure = status;
    reloadVideo(video);
    setState(video, state, status);
    settleCycle(state);
  };

  const abortOutputCycle = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
  ) => {
    if (states.get(video) !== state || state.cycleReason !== 'output') {
      return;
    }

    finishTerminalFailure(
      video,
      state,
      state.lastFailure ?? 'unreadable',
    );
  };

  const finishResolved = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
  ) => {
    clearAttempt(state);
    clearRetry(state);
    state.lastFailure = null;
    setState(video, state, 'resolved');
    settleCycle(state);
  };

  function finishAttemptFailure(
    video: HTMLVideoElement,
    state: VideoResolutionState,
    status: 'missing' | 'unreadable',
  ) {
    clearAttempt(state);
    scheduleRetry(video, state, status);
  }

  const startAttempt = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
  ) => {
    if (
      destroyed ||
      !root.contains(video) ||
      !state.pendingPromise ||
      !state.cycleReason
    ) {
      return;
    }

    clearAttempt(state);
    clearRetry(state);
    state.attempt += 1;
    state.candidateSrc = null;
    const generation = state.generation;
    const controller = new AbortController();
    state.controller = controller;
    setState(video, state, 'pending');
    reloadVideo(video);

    const reason =
      state.cycleReason === 'output'
        ? 'output'
        : state.cycleRetryIndex > 0
          ? 'retry'
          : state.cycleReason;
    const priority =
      state.cycleReason === 'output'
        ? 'visible'
        : state.cycleRetryIndex > 0
          ? 'nearby'
          : state.cyclePriority;

    state.resolveTimer = ownerWindow.setTimeout(() => {
      if (
        states.get(video) !== state ||
        state.generation !== generation ||
        state.controller !== controller
      ) {
        return;
      }

      controller.abort();
      finishAttemptFailure(video, state, 'unreadable');
    }, RESOLVER_TIMEOUT_MS);

    void Promise.resolve()
      .then(() =>
        resolver({
          attempt: state.attempt,
          kind: 'video',
          priority,
          reason,
          signal: controller.signal,
          src: state.storageSrc,
        }),
      )
      .then(
        (result) => {
          if (
            destroyed ||
            controller.signal.aborted ||
            states.get(video) !== state ||
            state.generation !== generation ||
            state.controller !== controller
          ) {
            return;
          }

          clearTimer(state.resolveTimer);
          state.resolveTimer = null;
          const candidateSrc = result?.src.trim();

          if (!candidateSrc) {
            finishAttemptFailure(video, state, 'missing');
            return;
          }

          state.candidateSrc = candidateSrc;
          reloadVideo(video, candidateSrc);
          state.loadTimer = ownerWindow.setTimeout(() => {
            if (
              states.get(video) === state &&
              state.generation === generation &&
              state.status === 'pending'
            ) {
              finishAttemptFailure(video, state, 'unreadable');
            }
          }, VIDEO_LOAD_TIMEOUT_MS);
        },
        () => {
          if (
            !destroyed &&
            !controller.signal.aborted &&
            states.get(video) === state &&
            state.generation === generation &&
            state.controller === controller
          ) {
            finishAttemptFailure(video, state, 'unreadable');
          }
        },
      );
  };

  function scheduleRetry(
    video: HTMLVideoElement,
    state: VideoResolutionState,
    status: 'missing' | 'unreadable',
  ) {
    const delay = RETRY_DELAYS_MS[state.cycleRetryIndex];

    if (
      delay === undefined ||
      destroyed ||
      !root.contains(video) ||
      !state.pendingPromise
    ) {
      finishTerminalFailure(video, state, status);
      return;
    }

    state.lastFailure = status;
    state.candidateSrc = null;
    reloadVideo(video);
    setState(video, state, 'pending');
    clearRetry(state);
    state.retryTimer = editorWindow.setTimeout(() => {
      state.retryTimer = null;
      state.cycleRetryIndex += 1;
      startAttempt(video, state);
    }, delay);
  }

  const startCycle = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
    reason: MarkweaveMediaResolveReason,
    priority: 'nearby' | 'visible',
    signal?: AbortSignal,
  ) => {
    cancelCycle(state);
    state.cycleReason = reason;
    state.cyclePriority = priority;
    state.cycleRetryIndex = 0;
    state.lastFailure = null;
    state.pendingPromise = new Promise<void>((resolve) => {
      state.resolvePending = resolve;
    });
    const pending = state.pendingPromise;

    if (signal) {
      const abort = () => abortOutputCycle(video, state);
      state.cycleSignal = signal;
      state.detachCycleSignal = () =>
        signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });

      if (signal.aborted) {
        abort();
        return pending;
      }
    }

    startAttempt(video, state);
    return pending;
  };

  const handleLoadedMetadata = (video: HTMLVideoElement) => {
    const state = states.get(video);
    if (
      !state ||
      state.status !== 'pending' ||
      !state.candidateSrc ||
      video.getAttribute('src') !== state.candidateSrc
    ) {
      return;
    }

    finishResolved(video, state);
  };

  const handleVideoError = (video: HTMLVideoElement) => {
    const state = states.get(video);
    if (
      !state ||
      !state.candidateSrc ||
      video.getAttribute('src') !== state.candidateSrc
    ) {
      return;
    }

    if (state.status === 'pending' && state.pendingPromise) {
      finishAttemptFailure(video, state, 'unreadable');
      return;
    }

    if (state.status === 'resolved') {
      void startCycle(video, state, 'retry', 'visible');
    }
  };

  function ensureResolved(
    video: HTMLVideoElement,
    reason: MarkweaveMediaResolveReason,
    priority: 'nearby' | 'visible',
    signal?: AbortSignal,
  ) {
    const state = states.get(video) ?? registerVideo(video);

    if (!state || signal?.aborted) {
      return Promise.resolve();
    }

    if (state.status === 'resolved' && state.candidateSrc) {
      if (video.getAttribute('src') !== state.candidateSrc) {
        reloadVideo(video, state.candidateSrc);
      }
      return Promise.resolve();
    }

    if (reason === 'output') {
      if (
        state.pendingPromise &&
        state.cycleReason === 'output' &&
        state.cycleSignal === signal
      ) {
        return state.pendingPromise;
      }

      return startCycle(video, state, 'output', 'visible', signal);
    }

    if (state.pendingPromise) {
      return state.pendingPromise;
    }

    return startCycle(video, state, reason, priority);
  }

  const handleResolveVisualResource = (
    video: HTMLVideoElement,
    event: Event,
  ) => {
    const detail = getOutputEventDetail(event);
    if (!detail) {
      return;
    }

    detail.waitUntil(ensureResolved(video, 'output', 'visible', detail.signal));
  };

  function registerVideo(video: HTMLVideoElement) {
    const currentSrc = video.getAttribute('src')?.trim() ?? '';
    const rememberedSrc = videoStorageSources.get(video) ?? '';
    const storageSrc = isWorkspaceAssetReference(currentSrc)
      ? currentSrc
      : !currentSrc && isWorkspaceAssetReference(rememberedSrc)
        ? rememberedSrc
        : '';

    if (!storageSrc) {
      return null;
    }

    const state: VideoResolutionState = {
      attempt: 0,
      candidateSrc: null,
      controller: null,
      cyclePriority: 'nearby',
      cycleReason: null,
      cycleRetryIndex: 0,
      cycleSignal: null,
      detachCycleSignal: null,
      generation: 0,
      lastFailure: null,
      loadTimer: null,
      onError: () => handleVideoError(video),
      onLoadedMetadata: () => handleLoadedMetadata(video),
      onResolveVisualResource: (event) =>
        handleResolveVisualResource(video, event),
      pendingPromise: null,
      resolvePending: null,
      resolveTimer: null,
      retryTimer: null,
      status: 'pending',
      storageSrc,
    };
    states.set(video, state);
    videoStorageSources.set(video, storageSrc);
    setState(video, state, 'pending');
    reloadVideo(video);
    video.addEventListener('loadedmetadata', state.onLoadedMetadata);
    video.addEventListener('error', state.onError);
    video.addEventListener(
      MARKWEAVE_RESOLVE_VISUAL_RESOURCE_EVENT,
      state.onResolveVisualResource,
    );

    if (intersectionObserver) {
      intersectionObserver.observe(video);
    } else {
      void ensureResolved(video, 'initial', 'visible');
    }

    return state;
  }

  const destroyVideo = (
    video: HTMLVideoElement,
    state: VideoResolutionState,
    preserveStorageSource: boolean,
  ) => {
    cancelCycle(state);
    intersectionObserver?.unobserve(video);
    video.removeEventListener('loadedmetadata', state.onLoadedMetadata);
    video.removeEventListener('error', state.onError);
    video.removeEventListener(
      MARKWEAVE_RESOLVE_VISUAL_RESOURCE_EVENT,
      state.onResolveVisualResource,
    );
    states.delete(video);
    delete video.dataset.mediaState;

    if (preserveStorageSource) {
      videoStorageSources.set(video, state.storageSrc);
      reloadVideo(video);
    } else {
      videoStorageSources.delete(video);
    }
  };

  const inspectVideo = (video: HTMLVideoElement) => {
    const currentSrc = video.getAttribute('src')?.trim() ?? '';
    const state = states.get(video);

    if (!state) {
      registerVideo(video);
      return;
    }

    if (!currentSrc || currentSrc === state.candidateSrc) {
      return;
    }

    if (currentSrc === state.storageSrc) {
      if (state.status === 'resolved' && state.candidateSrc) {
        reloadVideo(video, state.candidateSrc);
      } else {
        reloadVideo(video);
      }
      return;
    }

    destroyVideo(video, state, false);
    registerVideo(video);
  };

  const scan = () => {
    if (destroyed) {
      return;
    }

    root.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR).forEach(inspectVideo);
    for (const [video, state] of states) {
      if (!root.contains(video)) {
        destroyVideo(video, state, true);
      }
    }
  };

  const inspectAddedNode = (node: Node) => {
    if (!(node instanceof Element)) {
      return;
    }

    if (node.matches(VIDEO_SELECTOR)) {
      inspectVideo(node as HTMLVideoElement);
    }
    node.querySelectorAll<HTMLVideoElement>(VIDEO_SELECTOR).forEach(inspectVideo);
  };

  const handleMutations = (records: MutationRecord[]) => {
    let mayHaveRemovedVideo = false;

    for (const record of records) {
      if (
        record.type === 'attributes' &&
        record.target instanceof HTMLVideoElement &&
        record.target.matches(VIDEO_SELECTOR)
      ) {
        inspectVideo(record.target);
        continue;
      }

      if (record.type === 'childList') {
        record.addedNodes.forEach(inspectAddedNode);
        mayHaveRemovedVideo ||= record.removedNodes.length > 0;
      }
    }

    if (mayHaveRemovedVideo) {
      for (const [video, state] of states) {
        if (!root.contains(video)) {
          destroyVideo(video, state, true);
        }
      }
    }
  };

  const mutationObserver = MutationObserverCtor
    ? new MutationObserverCtor(handleMutations)
    : null;
  mutationObserver?.observe(root, {
    attributeFilter: ['src'],
    attributes: true,
    childList: true,
    subtree: true,
  });

  const handlePrepareOutput = (event: Event) => {
    const detail = getOutputEventDetail(event);
    if (!detail) {
      return;
    }

    scan();
    const pending = Array.from(states.keys(), (video) =>
      ensureResolved(video, 'output', 'visible', detail.signal),
    );
    detail.waitUntil(Promise.allSettled(pending));
  };

  const handleActivation = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const videoNode = target.closest<HTMLElement>(
      '[data-markweave-video-node], .markweave-video-node',
    );
    const video = videoNode?.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
    if (video) {
      void ensureResolved(video, 'viewport', 'visible');
    }
  };

  const intersectionObserver = IntersectionObserverCtor
    ? new IntersectionObserverCtor(
        (entries) => {
          for (const entry of entries) {
            if (
              !entry.isIntersecting ||
              !(entry.target instanceof HTMLVideoElement)
            ) {
              continue;
            }

            const rect = entry.boundingClientRect;
            const viewportHeight = ownerWindow.innerHeight;
            const priority =
              rect.bottom >= 0 && rect.top <= viewportHeight
                ? 'visible'
                : 'nearby';
            void ensureResolved(entry.target, 'viewport', priority);
          }
        },
        { rootMargin: '300% 0px' },
      )
    : null;

  root.addEventListener(MARKWEAVE_PREPARE_OUTPUT_EVENT, handlePrepareOutput);
  root.addEventListener('focusin', handleActivation);
  root.addEventListener('pointerdown', handleActivation);
  scan();

  return () => {
    destroyed = true;
    mutationObserver?.disconnect();
    intersectionObserver?.disconnect();
    root.removeEventListener(MARKWEAVE_PREPARE_OUTPUT_EVENT, handlePrepareOutput);
    root.removeEventListener('focusin', handleActivation);
    root.removeEventListener('pointerdown', handleActivation);
    for (const [video, state] of states) {
      destroyVideo(video, state, true);
    }
  };
}
