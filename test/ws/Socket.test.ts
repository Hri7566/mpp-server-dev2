import { describe, expect, test } from "bun:test";
import { ChannelList } from "~/channel/ChannelList";
import { config as channelConfig } from "~/channel/config";
import { bus } from "~/events/bus";
import { Socket } from "~/ws/Socket";
import { handleMessage } from "~/ws/message";
import { NoteQuota } from "~/ws/ratelimit/NoteQuota";
import {
    catchUnhandled,
    makeSocket,
    recordSent,
    tick,
    uniqueName
} from "../helpers";

describe("handler safety", () => {
    test("handlers that throw or reject don't escape", async () => {
        const guard = (
            Socket as unknown as {
                guardHandler: (
                    id: string,
                    cb: (...args: unknown[]) => unknown
                ) => (...args: unknown[]) => void;
            }
        ).guardHandler;

        const errors = await catchUnhandled(() => {
            guard("sync", () => {
                throw new Error("sync boom");
            })();

            guard("async", async () => {
                throw new Error("async boom");
            })();
        });

        expect(errors).toHaveLength(0);
    });

    test("userset before the user has loaded doesn't crash", async () => {
        // This exact frame used to kill the server with an unhandled rejection
        const errors = await catchUnhandled(async () => {
            const socket = new Socket();
            socket.gateway.hasProcessedHi = true;

            handleMessage(
                socket,
                JSON.stringify([
                    { m: "ch", _id: uniqueName() },
                    { m: "userset", set: { name: "early" } }
                ])
            );
        }, 300);

        expect(errors).toHaveLength(0);
    });

    test("an unknown or 'error' event from a client is harmless", async () => {
        const errors = await catchUnhandled(() => {
            const socket = new Socket();
            handleMessage(socket, JSON.stringify([{ m: "error" }]));
            handleMessage(socket, JSON.stringify([{ m: "nonsense" }]));
        });

        expect(errors).toHaveLength(0);
    });
});

describe("hi gating", () => {
    test("ch is ignored until hi has been processed", async () => {
        const socket = new Socket();

        handleMessage(socket, JSON.stringify([{ m: "ch", _id: uniqueName() }]));
        await tick(50);

        expect(socket.participant).toBeUndefined();
        expect(socket.getCurrentChannel()).toBeUndefined();
    });

    test("ch works after hi", async () => {
        const name = uniqueName();
        const socket = makeSocket();

        handleMessage(socket, JSON.stringify([{ m: "ch", _id: name }]));
        await tick(50);

        expect(socket.getCurrentChannel()?.getID()).toBe(name);
    });
});

describe("custom messages", () => {
    test("custom messages need a subscription", () => {
        const socket = makeSocket();
        let received = 0;
        const listener = () => received++;
        bus.on("custom", listener);

        handleMessage(
            socket,
            JSON.stringify([{ m: "custom", data: 1, target: { mode: "subscribed" } }])
        );

        bus.off("custom", listener);
        expect(received).toBe(0);
    });

    test("custom messages are rate limited", () => {
        const socket = makeSocket();
        socket.subscribeToCustom();

        let received = 0;
        const listener = () => received++;
        bus.on("custom", listener);

        const flood = Array.from({ length: 5000 }, () => ({
            m: "custom",
            data: 1,
            target: { mode: "subscribed" }
        }));
        handleMessage(socket, JSON.stringify(flood));

        bus.off("custom", listener);
        expect(received).toBeGreaterThan(0);
        expect(received).toBeLessThan(flood.length);
    });
});

describe("setChannel", () => {
    test("joining creates the channel and takes the crown", async () => {
        const name = uniqueName();
        const socket = makeSocket("creator");

        await socket.setChannel(name);

        expect(socket.getCurrentChannel()?.getID()).toBe(name);
        expect(socket.isOwner()).toBeTrue();
    });

    test("switching channels leaves the old one", async () => {
        const first = uniqueName();
        const second = uniqueName();
        const socket = makeSocket("mover");
        const stayer = makeSocket("stayer");

        await socket.setChannel(first);
        await stayer.setChannel(first);
        await socket.setChannel(second);

        expect(ChannelList.getChannel(first)?.hasUser("mover")).toBeFalse();
        expect(ChannelList.getChannel(second)?.hasUser("mover")).toBeTrue();
    });

    test("a second tab shares the same participant", async () => {
        const name = uniqueName();
        const tab1 = makeSocket("same-user");
        const tab2 = makeSocket("same-user");

        await tab1.setChannel(name);
        await tab2.setChannel(name);

        expect(tab2.participant).toBe(tab1.participant!);
        expect(
            ChannelList.getChannel(name)?.getParticipantList()
        ).toHaveLength(1);
    });

    test("one tab leaving doesn't remove the other", async () => {
        const name = uniqueName();
        const tab1 = makeSocket("two-tabs");
        const tab2 = makeSocket("two-tabs");

        await tab1.setChannel(name);
        await tab2.setChannel(name);
        tab1.destroy();

        expect(ChannelList.getChannel(name)?.hasUser("two-tabs")).toBeTrue();
    });

    test("one tab moving away leaves the other tab behind", async () => {
        const first = uniqueName();
        const second = uniqueName();
        const tab1 = makeSocket("split");
        const tab2 = makeSocket("split");

        await tab1.setChannel(first);
        await tab2.setChannel(first);
        await tab2.setChannel(second);

        expect(tab1.getCurrentChannel()?.getID()).toBe(first);
        expect(tab2.getCurrentChannel()?.getID()).toBe(second);
        expect(tab1.participant).not.toBe(tab2.participant!);
    });

    test("the lobby backdoor joins the lobby", async () => {
        const socket = makeSocket();
        await socket.setChannel(channelConfig.lobbyBackdoor);
        expect(socket.getCurrentChannel()?.getID()).toBe("lobby");
    });
});

describe("channel limits", () => {
    async function fullChannel(limit: number) {
        const name = uniqueName();
        const owner = makeSocket("limit-owner");
        await owner.setChannel(name);

        const ch = ChannelList.getChannel(name)!;
        ch.changeSettings({ limit });

        return { name, ch, owner };
    }

    test("people over the limit are sent to the overflow channel", async () => {
        const { name } = await fullChannel(2);

        const a = makeSocket();
        const b = makeSocket();
        const sentB = recordSent(b);
        await a.setChannel(name);
        await b.setChannel(name);

        expect(a.getCurrentChannel()?.getID()).toBe(name);
        expect(b.getCurrentChannel()?.getID()).toBe(channelConfig.fullChannel);
        expect(
            sentB.some(
                m => m.m === "notification" && String(m.text).includes("full")
            )
        ).toBeTrue();
    });

    test("admins can join a full channel", async () => {
        const { name } = await fullChannel(1);

        const admin = makeSocket(undefined, { admin: 1 });
        await admin.setChannel(name);

        expect(admin.getCurrentChannel()?.getID()).toBe(name);
    });

    test("the crown holder can come back to a full channel", async () => {
        const { name, owner } = await fullChannel(2);
        await makeSocket().setChannel(name);

        owner.destroy();
        await makeSocket().setChannel(name);

        const returning = makeSocket("limit-owner");
        await returning.setChannel(name);

        expect(returning.getCurrentChannel()?.getID()).toBe(name);
    });

    test("another tab of someone inside doesn't count", async () => {
        const { name } = await fullChannel(2);

        const tab1 = makeSocket("inside");
        await tab1.setChannel(name);
        const tab2 = makeSocket("inside");
        await tab2.setChannel(name);

        expect(tab2.getCurrentChannel()?.getID()).toBe(name);
    });

    test("the admin limit flag is enforced", async () => {
        const { name, ch } = await fullChannel(0);
        ch.setFlag("limit", 1);

        const late = makeSocket();
        await late.setChannel(name);

        expect(late.getCurrentChannel()?.getID()).toBe(
            channelConfig.fullChannel
        );
    });
});

describe("rate limit tiers", () => {
    test("admins get the admin note quota", () => {
        const admin = makeSocket(undefined, { admin: 1 });
        admin.resetRateLimits();
        expect(admin.noteQuota.max).toBe(NoteQuota.PARAMS_OFFLINE.max);
    });

    test("the crown holder gets the crown quota", async () => {
        const socket = makeSocket();
        await socket.setChannel(uniqueName());

        expect(socket.isOwner()).toBeTrue();
        expect(socket.noteQuota.max).toBe(NoteQuota.PARAMS_RIDICULOUS.max);
    });
});

describe("destroy", () => {
    test("a destroyed socket is forgotten and ignores messages", async () => {
        const name = uniqueName();
        const socket = makeSocket("leaver");
        await socket.setChannel(name);

        socket.destroy();

        expect(Socket.sockets.has(socket.uuid)).toBeFalse();
        expect(socket.participant).toBeUndefined();
        expect(ChannelList.getChannel(name)?.hasUser("leaver")).toBeFalsy();

        handleMessage(socket, JSON.stringify([{ m: "ch", _id: uniqueName() }]));
        await tick(20);
        expect(socket.getCurrentChannel()).toBeUndefined();
    });
});
