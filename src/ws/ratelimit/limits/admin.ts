import { RateLimit } from "../RateLimit";
import { RateLimitChain } from "../RateLimitChain";
import { type RateLimitConstructorList, config } from "../config";

export const adminLimits: RateLimitConstructorList = {
    normal: {
        a: () => new RateLimit(config.admin.normal.a),
        m: () => new RateLimit(config.admin.normal.m),
        ch: () => new RateLimit(config.admin.normal.ch),
        kickban: () => new RateLimit(config.admin.normal.kickban),
        unban: () => new RateLimit(config.admin.normal.unban),
        t: () => new RateLimit(config.admin.normal.t),
        "+ls": () => new RateLimit(config.admin.normal["+ls"]),
        "-ls": () => new RateLimit(config.admin.normal["-ls"]),
        chown: () => new RateLimit(config.admin.normal.chown),

        "+custom": () => new RateLimit(config.admin.normal["+custom"]),
        "-custom": () => new RateLimit(config.admin.normal["-custom"]),

        hi: () => new RateLimit(config.admin.normal.hi),
        bye: () => new RateLimit(config.admin.normal.bye),
        devices: () => new RateLimit(config.admin.normal.devices),
        "admin message": () =>
            new RateLimit(config.admin.normal["admin message"])
    },
    chains: {
        userset: () =>
            new RateLimitChain(
                config.admin.chains.userset.num,
                config.admin.chains.userset.interval
            ),
        chset: () =>
            new RateLimitChain(
                config.admin.chains.chset.num,
                config.admin.chains.chset.interval
            ),
        n: () =>
            new RateLimitChain(
                config.admin.chains.n.num,
                config.admin.chains.n.interval
            ),
        custom: () =>
            new RateLimitChain(
                config.admin.chains.custom.num,
                config.admin.chains.custom.interval
            )
    }
};
