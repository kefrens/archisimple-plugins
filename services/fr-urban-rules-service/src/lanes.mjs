/**
 * Lanes: first in, first out queues with a limit of jobs running at once EACH (Sprint 002.30, Addendum A).
 *
 * A local model server runs one page (or one reading) at a time, so a second would only wait inside the model and hold its
 * timeout; a cloud route can overlap a few. Each kind has its own lane, so a long local reading never holds a cloud one behind it.
 * `execute(job)` must not reject (the callers catch everything and end their job themselves).
 */
export function createLanes(limits, execute) {
  const lanes = new Map(Object.entries(limits).map(([kind, limit]) => [kind, { limit, running: new Set(), queue: [] }]));
  function pump(lane) {
    while (lane.running.size < lane.limit && lane.queue.length > 0) {
      const job = lane.queue.shift();
      lane.running.add(job);
      void execute(job).finally(() => {
        lane.running.delete(job);
        pump(lane);
      });
    }
  }
  return {
    push(job, kind) {
      const lane = lanes.get(kind);
      lane.queue.push(job);
      pump(lane);
    },
    /** Takes a job out of its queue; `true` when it was waiting (so it never ran). */
    remove(job) {
      for (const lane of lanes.values()) {
        const at = lane.queue.indexOf(job);
        if (at >= 0) {
          lane.queue.splice(at, 1);
          return true;
        }
      }
      return false;
    },
    queued: () => [...lanes.values()].reduce((n, lane) => n + lane.queue.length, 0),
    busy: () => [...lanes.values()].some((lane) => lane.running.size > 0 || lane.queue.length > 0)
  };
}
