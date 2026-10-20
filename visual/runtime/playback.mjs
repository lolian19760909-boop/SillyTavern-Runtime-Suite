// Preserve explicit pause while visibility and motion preference suspend rendering.
export function createPlayback({ target, handle, autoplay = true, settings = () => ({}) }) {
  const doc = target.ownerDocument, view = doc.defaultView;
  const media = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let wanted = autoplay, visible = true, disposed = false, applied = null, queue = Promise.resolve();
  const blocked = () => doc.hidden || !visible || settings().reducedMotion === true || media?.matches;
  function sync() {
    const play = wanted && !blocked();
    queue = queue.catch(() => {}).then(async () => {
      if (disposed || applied === play) return;
      await (play ? handle.play() : handle.pause()); applied = play;
    });
    return queue;
  }
  const refresh = () => { void sync().catch(() => {}); };
  const observer = view.IntersectionObserver ? new view.IntersectionObserver(entries => { visible = entries.at(-1)?.isIntersecting !== false; refresh(); }) : null;
  observer?.observe(target);
  doc.addEventListener('visibilitychange', refresh);
  media?.addEventListener('change', refresh);
  refresh();
  return {
    play() { wanted = true; return sync(); },
    pause() { wanted = false; return sync(); },
    refresh: sync,
    diagnostics: () => ({ wanted, visible, suspended: !!blocked(), playing: applied === true }),
    async dispose() { disposed = true; observer?.disconnect(); doc.removeEventListener('visibilitychange', refresh); media?.removeEventListener('change', refresh); await queue.catch(() => {}); },
  };
}
