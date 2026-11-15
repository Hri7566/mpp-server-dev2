import { ChannelList } from "~/channel/ChannelList";
import { ServerEventListener } from "~/util/types";

export const rename_channel: ServerEventListener<"rename_channel"> = {
    id: "rename_channel",
    callback: async (msg, socket) => {
        // Rename a channel by changing its ID
        if (typeof msg._id !== "string") return;

        const ch = socket.getCurrentChannel();
        if (!ch) return;
        if (ch.getID() === msg._id) return;

        const sockets = ch
            .getParticipantListUnsanitized()
            .flatMap(p => [...p.sockets]);

        if (!ChannelList.getChannel(msg._id)) {
            // Not taken, so just change the ID
            ch.setID(msg._id);
            return;
        }

        // Taken, merge by moving everyone into the existing channel
        for (const sock of sockets)
            await sock.setChannel(msg._id, undefined, true);
        ch.destroy();
    }
};
