import { notificationConfig as config } from "~/util/notificationConfig";
import { ChannelList } from "~/channel/ChannelList";
import { ServerEventListener } from "~/util/types";
import { socketsByUUID } from "~/ws/Socket";

export const notification: ServerEventListener<"notification"> = {
    id: "notification",
    callback: async (msg, socket) => {
        // Send notification to user/channel
        if (
            typeof msg.targetChannel == "undefined" &&
            typeof msg.targetUser == "undefined"
        )
            return;

        if (msg.duration) {
            if (typeof msg.duration === "string") {
                try {
                    msg.duration = parseFloat(msg.duration);
                } catch (err) {
                    return;
                }
            }

            if (msg.duration > config.maxDuration)
                msg.duration = config.maxDuration;
        } else {
            msg.duration = config.defaultDuration;
        }

        if (typeof msg.targetChannel !== "undefined") {
            for (const ch of ChannelList.getList().values()) {
                if (
                    ch.getID() == msg.targetChannel ||
                    msg.targetChannel == config.allTarget
                ) {
                    ch.sendNotification(msg);
                }
            }
        }

        if (typeof msg.targetUser !== "undefined") {
            for (const socket of socketsByUUID.values()) {
                if (socket.getUserID() == msg.targetUser) {
                    socket.sendNotification(msg);
                }
            }
        }
    }
};
