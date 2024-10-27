import { ChannelList } from "~/channel/ChannelList";
import { bus } from "./bus";
import type { OutgoingSocketEvents, IncomingSocketEvents } from "~/util/types";
import { socketsByUUID, type Socket } from "~/ws/Socket";

export function loadBehaviors() {
    bus.on("hamburger", () => {
        for (const ch of ChannelList.getList()) {
            ch.sendChatAdmin("🍔");
        }
    });

    bus.on("ls", () => {});

    bus.on("custom", (msg: IncomingSocketEvents["custom"], sender: Socket) => {
        if (typeof msg !== "object") return;
        if (typeof msg.data === "undefined") return;
        if (typeof msg.target !== "object") return;
        if (typeof msg.target.mode !== "string") return;
        if (
            typeof msg.target.global !== "undefined" &&
            typeof msg.target.global !== "boolean"
        )
            return;

        for (const receiver of socketsByUUID.values()) {
            if (receiver.isDestroyed()) return;
            if (!receiver.isCustomSubbed()) return;

            if (sender.isDestroyed()) return;
            if (!sender.isCustomSubbed()) return;

            if (
                msg.target.global !== true ||
                typeof msg.target.global === "undefined"
            ) {
                const ch = sender.getCurrentChannel();
                if (!ch) return;

                const ch2 = receiver.getCurrentChannel();
                if (!ch2) return;

                if (ch.getID() !== ch2.getID()) return;
            }

            if (msg.target.mode === "id") {
                if (typeof msg.target.id !== "string") return;

                if (
                    receiver.getUserID() === msg.target.id ||
                    receiver.getParticipantID() === msg.target.id
                ) {
                    receiver.sendArray([
                        {
                            m: "custom",
                            data: msg.data,
                            p: sender.getUserID()
                        } as OutgoingSocketEvents["custom"]
                    ]);
                }
            } else if (msg.target.mode === "ids") {
                if (typeof msg.target.ids !== "object") return;
                if (!Array.isArray(msg.target.ids)) return;

                if (msg.target.ids.includes(receiver.getUserID())) {
                    receiver.sendArray([
                        {
                            m: "custom",
                            data: msg.data,
                            p: sender.getUserID()
                        } as OutgoingSocketEvents["custom"]
                    ]);
                }
            } else if (msg.target.mode === "subscribed") {
                receiver.sendArray([
                    {
                        m: "custom",
                        data: msg.data,
                        p: sender.getUserID()
                    } as OutgoingSocketEvents["custom"]
                ]);
            }
        }
    });

    bus.on("user data update", user => {
        for (const ch of ChannelList.getList()) {
            ch.emit("user data update", user);
        }
    });

    bus.emit("ready");
}
