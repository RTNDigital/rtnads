import { EventEnvelope } from "@rtnads/contracts";

/**
 * In-memory, deterministic event bus over the durable EventEnvelope contract
 * (docs/08-event-flow.md). It is the offline / test substitute for the real
 * message queue and preserves the same observable guarantees so consumers written
 * against it behave identically in production:
 *
 *   • per-aggregate ordering — events are delivered strictly FIFO in publish order
 *     (a superset of the docs' per-account/campaign ordering, §9);
 *   • at-least-once + idempotent — a subscription that has already processed an
 *     `event_id` never sees it again, modelling idempotent consumers (§9);
 *   • dead-letter capture — a handler that keeps throwing is retried up to
 *     `maxRetries` and then parked in `deadLetters` instead of blocking the bus (§10).
 *
 * Determinism: there is no clock, no timer and no randomness here. `publish`
 * enqueues (and validates) an envelope; `drain` processes the queue to completion.
 * Handlers may publish further events — those are appended and drained in the same
 * pass, so a whole reaction chain settles synchronously and reproducibly.
 */

export type EventHandler = (event: EventEnvelope) => void | Promise<void>;

export interface Subscription {
  readonly name: string;
  readonly pattern: string;
}

export interface DeadLetter {
  readonly subscription: string;
  readonly event: EventEnvelope;
  readonly error: string;
  readonly attempts: number;
}

export interface EventBusOptions {
  /** Additional delivery attempts per (event, subscription) before dead-lettering. Default 3. */
  maxRetries?: number;
}

interface InternalSub {
  readonly name: string;
  readonly pattern: string;
  readonly handler: EventHandler;
  readonly seen: Set<string>;
}

/**
 * Match an event `type` against a subscription pattern. Supports an exact type,
 * a family wildcard (`"outcome.*"` matches `outcome` and `outcome.evaluated`), and
 * the catch-all `"*"`.
 */
export function typeMatches(pattern: string, type: string): boolean {
  if (pattern === "*" || pattern === type) return true;
  if (pattern.endsWith(".*")) {
    const base = pattern.slice(0, -2);
    return type === base || type.startsWith(base + ".");
  }
  return false;
}

export class InMemoryEventBus {
  private readonly subs: InternalSub[] = [];
  private readonly queue: EventEnvelope[] = [];
  private draining = false;
  private readonly maxRetries: number;

  /** Poison events, with the subscription that could not process them. */
  readonly deadLetters: DeadLetter[] = [];
  /** Every event that has been dequeued, in delivery order (observability/testing). */
  readonly delivered: EventEnvelope[] = [];

  constructor(opts: EventBusOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 3;
  }

  /** Register a handler for a type pattern. Duplicate names are allowed but discouraged. */
  subscribe(pattern: string, handler: EventHandler, name?: string): Subscription {
    const sub: InternalSub = {
      name: name ?? `sub${this.subs.length + 1}`,
      pattern,
      handler,
      seen: new Set<string>(),
    };
    this.subs.push(sub);
    return { name: sub.name, pattern: sub.pattern };
  }

  /** Validate and enqueue an event. Returns the parsed (defaulted) envelope. */
  publish(event: EventEnvelope): EventEnvelope {
    const parsed = EventEnvelope.parse(event);
    this.queue.push(parsed);
    return parsed;
  }

  /** Convenience: publish then drain to completion. */
  async emit(event: EventEnvelope): Promise<EventEnvelope> {
    const parsed = this.publish(event);
    await this.drain();
    return parsed;
  }

  /** Number of events waiting to be delivered. */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Process the queue to completion. FIFO; each matching subscription sees an
   * event at most once (idempotent dedupe). Re-entrant calls are a no-op — a
   * handler that publishes simply grows the queue the outer drain is already
   * working through.
   */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const event = this.queue.shift()!;
        this.delivered.push(event);
        for (const sub of this.subs) {
          if (!typeMatches(sub.pattern, event.type)) continue;
          if (sub.seen.has(event.event_id)) continue;
          await this.deliver(sub, event);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliver(sub: InternalSub, event: EventEnvelope): Promise<void> {
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        await sub.handler(event);
        sub.seen.add(event.event_id);
        return;
      } catch (e) {
        if (attempt > this.maxRetries) {
          // Mark as seen so a redelivery of the same event_id is not re-attempted;
          // the dead-letter record preserves it for inspection.
          sub.seen.add(event.event_id);
          this.deadLetters.push({
            subscription: sub.name,
            event,
            error: e instanceof Error ? e.message : String(e),
            attempts: attempt,
          });
          return;
        }
      }
    }
  }
}
