/**
 * Local Trajectory Cache & Fast Replay Engine
 * Caches validated multi-step action sequences locally and replays them on recurring tasks without invoking AI.
 */

export class TrajectoryCache {
  static getStorageKey(domain, task) {
    const normDomain = (domain || 'global').replace(/^https?:\/\//, '').split('/')[0];
    const normTask = (task || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    return `traj_${normDomain}_${normTask}`;
  }

  static async saveTrajectory(domain, task, actionHistory) {
    if (!actionHistory || actionHistory.length === 0) return;

    const key = this.getStorageKey(domain, task);
    const validSteps = actionHistory.map((step) => ({
      action: step.action,
      targetRef: step.targetRef,
      selector: step.selector,
      value: step.value,
      direction: step.direction
    }));

    const cachePayload = {
      domain,
      task,
      steps: validSteps,
      savedAt: new Date().toISOString()
    };

    await chrome.storage.local.set({ [key]: cachePayload });
    console.log(`[Trajectory Cache] Successfully cached ${validSteps.length} steps under key "${key}"`);
  }

  static async getCachedTrajectory(domain, task) {
    const key = this.getStorageKey(domain, task);
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  }

  static async clearAll() {
    const allStorage = await chrome.storage.local.get(null);
    const trajKeys = Object.keys(allStorage).filter((k) => k.startsWith('traj_'));
    if (trajKeys.length > 0) {
      await chrome.storage.local.remove(trajKeys);
    }
  }
}
