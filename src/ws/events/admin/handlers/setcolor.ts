import { IncomingSocketEvents, ServerEventListener } from "~/util/types";

export const setcolor: ServerEventListener<"setcolor"> = {
    id: "setcolor",
    callback: async (msg, socket) => {
        // color alias
        (msg as unknown as IncomingSocketEvents["color"]).m = "color";
        socket.admin.emit("color", msg, socket);
    }
};
