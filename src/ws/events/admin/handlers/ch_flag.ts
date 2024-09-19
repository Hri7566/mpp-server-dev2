import { ChannelList } from "../../../../channel/ChannelList";
import { ServerEventListener, TChannelFlags } from "../../../../util/types";

export const ch_flag: ServerEventListener<"ch_flag"> = {
    id: "ch_flag",
    callback: async (msg, socket) => {
        // Edit channel flag
        let chid = msg._id;

        if (typeof chid !== "string") {
            const ch = socket.getCurrentChannel();
            if (!ch) return;

            chid = ch.getID();
        }

        if (typeof msg.key !== "string") return;
        if (typeof msg.value === "undefined") return;

        const ch = ChannelList.getList().find(c => c.getID() == chid);
        if (!ch) return;

        ch.setFlag(
            msg.key as keyof TChannelFlags,
            msg.value as TChannelFlags[keyof TChannelFlags]
        );
    }
};
