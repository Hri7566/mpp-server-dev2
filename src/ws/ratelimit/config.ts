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
                a: 250,
                m: 40,
                ch: 100,
                kickban: 50,
                unban: 50,
                t: 10,
                "+ls": 15,
                "-ls": 15,
                chown: 500,

                "+custom": 10,
                "-custom": 10,

                hi: 100,
                bye: 100,
                devices: 100,
                "admin message": 10
            },
            chains: {
                userset: {
                    interval: 1000 * 60,
                    num: 1000
                },
                chset: {
                    interval: 1000 * 60,
                    num: 1024
                },
                n: {
                    interval: 1000,
                    num: 2000
                },
                custom: {
                    interval: 1000,
                    num: 1024
                }
            }
        },
        crown: {
            normal: {
                a: 50,
                m: 40,
                ch: 100,
                kickban: 50,
                unban: 50,
                t: 10,
                "+ls": 15,
                "-ls": 15,
                chown: 500,

                "+custom": 10,
                "-custom": 10,

                hi: 100,
                bye: 100,
                devices: 100,
                "admin message": 10
            },
            chains: {
                userset: {
                    interval: 1000 * 60,
                    num: 1000
                },
                chset: {
                    interval: 1000 * 60,
                    num: 1024
                },
                n: {
                    interval: 1000,
                    num: 2000
                },
                custom: {
                    interval: 1000,
                    num: 1024
                }
            }
        },
        admin: {
            normal: {
                a: 10,
                m: 10,
                ch: 10,
                kickban: 10,
                unban: 10,
                t: 10,
                "+ls": 10,
                "-ls": 10,
                chown: 10,

                "+custom": 10,
                "-custom": 10,

                hi: 10,
                bye: 10,
                devices: 10,
                "admin message": 10
            },
            chains: {
                userset: {
                    interval: 500,
                    num: 100000
                },
                chset: {
                    interval: 1000 * 60,
                    num: 1024
                },
                n: {
                    interval: 50,
                    num: 2400000
                },
                custom: {
                    interval: 1000 * 60,
                    num: 2000000
                }
            }
        }
    }
);
