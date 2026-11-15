import { ChannelList } from "~/channel/ChannelList";
import { bus } from "./bus";
import type { SocketEvents, SocketMessages } from "~/util/types";
import { Socket } from "~/ws/Socket";
import { Logger } from "~/util/Logger";

const logger = new Logger("Event Bus");

export function loadBehaviors() {
    bus.on("hamburger", () => {
        for (const ch of ChannelList.getList()) {
            ch.sendChatAdmin("🍔");
        }
    });

    bus.on("custom", (msg: SocketMessages["custom"], sender: Socket) => {
        if (typeof msg !== "object" || msg === null) return;
        if (typeof msg.data === "undefined") return;
        if (typeof msg.target !== "object" || msg.target === null) return;
        if (typeof msg.target.mode !== "string") return;
        if (
            typeof msg.target.global !== "undefined" &&
            typeof msg.target.global !== "boolean"
        )
            return;

        if (sender.isDestroyed() || !sender.isCustomSubbed()) return;

        const senderID = sender.getUserID();
        if (!senderID) return;

        const target = msg.target;
        const out = {
            m: "custom",
            data: msg.data,
            p: senderID
        } as SocketEvents["custom"];

        for (const receiver of Socket.sockets.values()) {
            if (receiver.isDestroyed()) continue;
            if (!receiver.isCustomSubbed()) continue;

            if (target.global !== true) {
                const ch = sender.getCurrentChannel();
                if (!ch || receiver.getCurrentChannel() !== ch) continue;
            }

            const receiverID = receiver.getUserID();

            if (target.mode === "id") {
                if (typeof target.id !== "string") return;
                if (
                    receiverID !== target.id &&
                    receiver.participant?.id !== target.id
                )
                    continue;
            } else if (target.mode === "ids") {
                if (!Array.isArray(target.ids)) return;
                if (!receiverID || !target.ids.includes(receiverID)) continue;
            } else if (target.mode !== "subscribed") {
                return;
            }

            receiver.sendArray([out]);
        }
    });

    bus.on("ban", ban => {
        try {
            for (const socket of [...Socket.sockets.values()]) {
                if (ban.banType === "user") {
                    if (socket.getUserID() !== ban._id) continue;
                } else if (ban.banType === "socket") {
                    if (socket.ip !== ban.ip) continue;
                } else {
                    continue;
                }

                socket.sendBanNotification(ban.duration, ban.reason);
                socket.destroy();
            }
        } catch (err) {
            logger.warn("Unhandled error in ban event:", err);
        }
    });

    bus.on("ping timeout", () => {
        let now = Date.now();

        for (const socket of Socket.sockets.values()) {
            if (now - 20000 > socket.gateway.lastPing) socket.destroy();
        }
    });

    bus.emit("ready");
}
