import { Logger } from "~/util/Logger";
import { ChannelList } from "~/channel/ChannelList";
import { ServerEventListener, TChannelFlags } from "~/util/types";

const logger = new Logger("Channel flag input");

export const ch_flag: ServerEventListener<"ch_flag"> = {
    id: "ch_flag",
    callback: async (msg, socket) => {
        // Edit channel flag
        if (typeof msg.key !== "string") return;

        const ch =
            typeof msg._id === "string"
                ? ChannelList.getChannel(msg._id)
                : socket.getCurrentChannel();
        if (!ch) return;

        if (msg.remove === true) {
            const flags = ch.getFlags();
            delete (flags as Record<string, unknown>)[msg.key];
            ch.setFlags(flags);
        } else {
            if (typeof msg.value === "undefined") return;

            ch.setFlag(
                msg.key as keyof TChannelFlags,
                msg.value as TChannelFlags[keyof TChannelFlags]
            );
        }
    }
};
