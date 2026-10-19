export function createModuleSwitch(start) {
  let wanted = false, instance = null, queue = Promise.resolve(), disposed = false, error = '';
  async function reconcile() {
    if (!wanted && instance) {
      const previous = instance; instance = null;
      await previous.dispose();
    }
    if (wanted && !instance && !disposed) {
      try {
        const next = await start();
        if (!wanted || disposed) await next.dispose();
        else instance = next;
        error = '';
      } catch (failure) { error = failure.message; throw failure; }
    }
  }
  const set = enabled => {
    if (disposed) return Promise.reject(new Error('模块管理器已关闭。'));
    wanted = enabled === true;
    const result = queue.catch(() => {}).then(reconcile);
    queue = result.catch(() => {});
    return result;
  };
  return {
    set, current: () => instance,
    status: () => ({ wanted, active: !!instance, error }),
    async dispose() { disposed = true; wanted = false; await queue; await reconcile(); },
  };
}
