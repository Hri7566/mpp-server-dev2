import { ServerEventListener } from "~/util/types";
import { Socket } from "~/ws/Socket";

export const move: ServerEventListener<"move"> = {
    id: "move",
    callback: async (msg, socket) => {
        // Forcefully move user to another channel
        const id = msg._id ?? socket.getUserID();
        if (typeof id !== "string") return;

        const ch = msg.ch;
        const set = msg.set;

        if (typeof ch !== "string") return;
        if (typeof set !== "object" && typeof set !== "undefined") return;

        for (const sock of Socket.findSocketsByUserID(id)) {
            await sock.setChannel(ch, set, true);
        }
    }
};
