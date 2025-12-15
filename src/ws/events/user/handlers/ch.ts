import { ServerEventListener } from "~/util/types";

export const ch: ServerEventListener<"ch"> = {
    id: "ch",
    callback: async (msg, socket) => {
        // Switch channel
        if (!socket.rateLimits?.normal.ch.attempt()) return;
        if (typeof msg._id !== "string") return;
        if (msg._id.length > 512) return;

        // So technical and convoluted...
        socket.setChannel(msg._id, msg.set);
    }
};
