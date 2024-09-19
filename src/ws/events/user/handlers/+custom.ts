import { ServerEventListener } from "../../../../util/types";

export const plus_custom: ServerEventListener<"+custom"> = {
    id: "+custom",
    callback: async (msg, socket) => {
        // Custom message subscribe
        if (socket.rateLimits) {
            if (!socket.rateLimits.normal["+custom"].attempt()) return;
        }

        socket.gateway.hasSentCustomSub = true;

        socket.subscribeToCustom();
    }
};
