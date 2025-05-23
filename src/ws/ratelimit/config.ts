import { ConfigManager } from "~/util/config";
import type { RateLimit } from "./RateLimit";
import type { RateLimitChain } from "./RateLimitChain";

export interface RateLimitConfigList<
    RL = number,
    RLC = { num: number; interval: number }
> {
    normal: {
        a: RL;
        m: RL;
        ch: RL;
        kickban: RL;
        unban: RL;
        t: RL;
        "+ls": RL;
        "-ls": RL;
        chown: RL;

        "+custom": RL;
        "-custom": RL;

        // weird limits
        hi: RL;
        bye: RL;
        devices: RL;
        "admin message": RL;
    };

    chains: {
        userset: RLC;
        chset: RLC;
        n: RLC; // not to be confused with NoteQuota
        custom: RLC;
    };
}

export type RateLimitConstructorList = RateLimitConfigList<
    () => RateLimit,
    () => RateLimitChain
>;

export type RateLimitList = RateLimitConfigList<RateLimit, RateLimitChain>;

export interface RateLimitsConfig {
    user: RateLimitConfigList;
    crown: RateLimitConfigList;
    admin: RateLimitConfigList;
}

// ms / num
// where num times in ms before limit
export const config = ConfigManager.loadConfig<RateLimitsConfig>(
    "config/ratelimits.yml",
    {
        user: {
            normal: {
                a: 6000 / 4,
                m: 1000 / 20,
                ch: 1000 / 8,
                kickban: 1000 / 16,
                unban: 1000 / 16,
                t: 1000 / 128,
                "+ls": 1000 / 60,
                "-ls": 1000 / 60,
                chown: 2000,

                "+custom": 1000 / 60,
                "-custom": 1000 / 60,

                hi: 1000 / 20,
                bye: 1000 / 20,
                devices: 1000 / 20,
                "admin message": 1000 / 20
            },
            chains: {
                userset: {
                    interval: 1000 * 60 * 30,
                    num: 1000
                },
                chset: {
                    interval: 1000 * 60 * 30,
                    num: 1024
                },
                n: {
                    interval: 2000,
                    num: 1200
                },
                custom: {
                    interval: 1000,
                    num: 512
                }
            }
        },
        crown: {
            normal: {
                a: 6000 / 10,
                m: 1000 / 20,
                ch: 1000 / 8,
                kickban: 1000 / 16,
                unban: 1000 / 16,
                t: 1000 / 128,
                "+ls": 1000 / 60,
                "-ls": 1000 / 60,
                chown: 2000,

                "+custom": 1000 / 60,
                "-custom": 1000 / 60,

                hi: 1000 / 20,
                bye: 1000 / 20,
                devices: 1000 / 20,
                "admin message": 1000 / 20
            },
            chains: {
                userset: {
                    interval: 1000 * 60 * 30,
                    num: 1000
                },
                chset: {
                    interval: 1000 * 60 * 30,
                    num: 1024
                },
                n: {
                    interval: 2000,
                    num: 1800
                },
                custom: {
                    interval: 1000,
                    num: 512
                }
            }
        },
        admin: {
            normal: {
                a: 6000 / 50,
                m: 1000 / 60,
                ch: 1000 / 10,
                kickban: 1000 / 60,
                unban: 1000 / 8,
                t: 1000 / 256,
                "+ls": 1000 / 60,
                "-ls": 1000 / 60,
                chown: 500,

                "+custom": 1000 / 120,
                "-custom": 1000 / 120,

                hi: 1000 / 20,
                bye: 1000 / 20,
                devices: 1000 / 20,
                "admin message": 1000 / 60
            },
            chains: {
                userset: {
                    interval: 500,
                    num: 1000
                },
                chset: {
                    interval: 1000 * 60 * 30,
                    num: 1024
                },
                n: {
                    interval: 50,
                    num: 24000
                },
                custom: {
                    interval: 1000 * 60,
                    num: 20000
                }
            }
        }
    }
);
