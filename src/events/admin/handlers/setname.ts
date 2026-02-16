import { ServerEventListener } from "~/util/types";

export const setname: ServerEventListener<"setname"> = {
    id: "setname",
    callback: async (msg, socket) => {
        // name alias
        socket.admin.emit("name", msg, socket);
    }
};
