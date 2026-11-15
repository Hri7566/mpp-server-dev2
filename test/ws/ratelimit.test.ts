import { describe, expect, test } from "bun:test";
import { RateLimit } from "~/ws/ratelimit/RateLimit";
import { RateLimitChain } from "~/ws/ratelimit/RateLimitChain";
import { NoteQuota } from "~/ws/ratelimit/NoteQuota";

describe("RateLimit", () => {
    test("allows one attempt per interval", () => {
        const limit = new RateLimit(100);

        expect(limit.attempt(1000)).toBeTrue();
        expect(limit.attempt(1050)).toBeFalse();
        expect(limit.attempt(1100)).toBeTrue();
    });
});

describe("RateLimitChain", () => {
    test("allows num attempts per interval, then blocks", () => {
        const chain = new RateLimitChain(3, 1000);

        expect(chain.attempt(0)).toBeTrue();
        expect(chain.attempt(0)).toBeTrue();
        expect(chain.attempt(0)).toBeTrue();
        expect(chain.attempt(0)).toBeFalse();
        expect(chain.attempt(999)).toBeFalse();
    });

    test("frees up again after the interval", () => {
        const chain = new RateLimitChain(2, 1000);

        chain.attempt(0);
        chain.attempt(0);
        expect(chain.attempt(500)).toBeFalse();
        expect(chain.attempt(1000)).toBeTrue();
    });

    test("an empty chain blocks everything", () => {
        expect(new RateLimitChain(0, 1000).attempt(0)).toBeFalse();
    });
});

describe("NoteQuota", () => {
    test("spending more notes than allowed is refused", () => {
        const quota = new NoteQuota();
        quota.setParams(NoteQuota.PARAMS_NORMAL);

        let spent = 0;
        while (quota.spend(1) && spent < 1_000_000) spent++;

        expect(spent).toBeGreaterThan(0);
        expect(spent).toBeLessThan(1_000_000);
        expect(quota.spend(1)).toBeFalse();
    });
});
