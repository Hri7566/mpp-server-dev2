import type { ServerEventListener } from "~/util/types";

export const custom: ServerEventListener<"custom"> = {
    id: "custom",
    callback: async (msg, socket) => {
        // Custom message
        if (!socket.isCustomSubbed()) return;
    }
};
