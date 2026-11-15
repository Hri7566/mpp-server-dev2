import { ServerEventListener } from "~/util/types";

export const ch: ServerEventListener<"ch"> = {
    id: "ch",
    callback: async (msg, socket) => {
        // Switch channel
        // Token auth and the browser challenge happen in "hi"
        if (!socket.gateway.hasProcessedHi) return;
        if (!socket.rateLimits.normal.ch.attempt()) return;
        if (typeof msg._id !== "string") return;
        if (msg._id.length > 512) return;

        // So technical and convoluted...
        if (typeof msg.set !== "undefined" && typeof msg.set !== "object")
            return;

        await socket.setChannel(msg._id, msg.set ?? undefined);
    }
};
