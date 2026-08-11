/**
 * Deterministic virtual clock + timer wheel. Time advances only when the caller
 * says so (`advanceTo` / `advanceBy`), and due timers fire in (fireAt, insertion)
 * order — so ingestion cadence and outcome windows are fully reproducible in tests
 * and CI, with no wall-clock, no `setTimeout`, no randomness.
 *
 * The pending schedule is inspectable and serializable (`pending()`), which is how
 * the docs' "outcome-window timers survive restarts (persisted schedule)" property
 * (docs/08 §10) is realized: the due times can be persisted and rehydrated.
 */

export interface PendingTimer {
  readonly id: string;
  /** Epoch milliseconds at which the timer fires. */
  readonly fireAt: number;
}

interface Timer {
  readonly id: string;
  readonly fireAt: number;
  readonly order: number;
  readonly fn: () => void;
}

export class VirtualClock {
  private ms: number;
  private seq = 0;
  private timers: Timer[] = [];

  constructor(startIso: string) {
    this.ms = Date.parse(startIso);
    if (Number.isNaN(this.ms)) throw new Error(`invalid start time: ${startIso}`);
  }

  now(): string {
    return new Date(this.ms).toISOString();
  }

  nowMs(): number {
    return this.ms;
  }

  /** Schedule `fn` to fire at an absolute time. Returns a cancellable timer id. */
  schedule(fireAtIso: string, fn: () => void): string {
    const fireAt = Date.parse(fireAtIso);
    if (Number.isNaN(fireAt)) throw new Error(`invalid fire time: ${fireAtIso}`);
    const id = `t${(this.seq += 1)}`;
    this.timers.push({ id, fireAt, order: this.seq, fn });
    return id;
  }

  cancel(id: string): boolean {
    const i = this.timers.findIndex((t) => t.id === id);
    if (i === -1) return false;
    this.timers.splice(i, 1);
    return true;
  }

  /** The still-pending timers, sorted by fire time (safe to persist). */
  pending(): PendingTimer[] {
    return this.timers
      .map((t) => ({ id: t.id, fireAt: t.fireAt }))
      .sort((a, b) => a.fireAt - b.fireAt);
  }

  /**
   * Advance to an absolute time, firing every timer due at or before it in
   * (fireAt, insertion) order. A firing timer may schedule further timers (e.g. a
   * recurring sync re-arming itself); those are picked up in the same advance if
   * they are also due. During each callback `now()` reflects that timer's fire time.
   */
  advanceTo(targetIso: string): void {
    const target = Date.parse(targetIso);
    if (Number.isNaN(target)) throw new Error(`invalid target time: ${targetIso}`);
    if (target < this.ms) throw new Error("cannot move the clock backwards");
    for (;;) {
      const due = this.timers
        .filter((t) => t.fireAt <= target)
        .sort((a, b) => a.fireAt - b.fireAt || a.order - b.order);
      const next = due[0];
      if (!next) break;
      this.timers = this.timers.filter((t) => t.id !== next.id);
      this.ms = next.fireAt;
      next.fn();
    }
    this.ms = target;
  }

  advanceBy(ms: number): void {
    if (ms < 0) throw new Error("cannot advance by a negative duration");
    this.advanceTo(new Date(this.ms + ms).toISOString());
  }
}
