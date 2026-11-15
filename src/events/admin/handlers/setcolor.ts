import type { SocketMessages, ServerEventListener } from "~/util/types";

export const setcolor: ServerEventListener<"setcolor"> = {
    id: "setcolor",
    callback: async (msg, socket) => {
        // color alias
        (msg as unknown as SocketMessages["color"]).m = "color";
        socket.admin.emit("color", msg, socket);
    }
};
