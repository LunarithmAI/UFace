export type LimitReservation =
  | { allowed: true; release: () => void }
  | { allowed: false; reason: "daily" | "busy"; retryAfter: number };

export function configuredDailyLimit(value: string | undefined): number | null {
  if (value === undefined) return 50;
  if (!/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
}

/** Synchronous reservation is atomic within the supported single Node process. */
export class AnalysisLimiter {
  private day = "";
  private attempts = 0;
  private inFlight = 0;

  acquire(dailyLimit: number, now = new Date()): LimitReservation {
    if (!Number.isSafeInteger(dailyLimit) || dailyLimit <= 0)
      throw new RangeError("Invalid daily limit");
    const day = now.toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.attempts = 0;
    }
    if (this.attempts >= dailyLimit) {
      const midnight = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      return {
        allowed: false,
        reason: "daily",
        retryAfter: Math.max(1, Math.ceil((midnight - now.getTime()) / 1000)),
      };
    }
    if (this.inFlight >= 2)
      return { allowed: false, reason: "busy", retryAfter: 30 };
    this.attempts += 1;
    this.inFlight += 1;
    let released = false;
    return {
      allowed: true,
      release: () => {
        if (released) return;
        released = true;
        this.inFlight -= 1;
      },
    };
  }
}

export const analysisLimiter = new AnalysisLimiter();
