import { ServerEventListener } from "../../../../util/types";

export const minus_custom: ServerEventListener<"-ls"> = {
    id: "-ls",
    callback: async (msg, socket) => {
        // Unsubscribe from custom messages
        if (socket.rateLimits) {
            if (!socket.rateLimits.normal["-custom"].attempt()) return;
        }

        socket.gateway.hasSentCustomUnsub = true;

        socket.unsubscribeFromCustom();
    }
};
