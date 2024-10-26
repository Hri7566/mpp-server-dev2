import { ServerEventListener } from "~/util/types";

export const m: ServerEventListener<"m"> = {
    id: "m",
    callback: async (msg, socket) => {
        // Cursor movement
        if (socket.rateLimits) {
            if (!socket.rateLimits.normal.m.attempt()) return;
        }

        if (!msg.x || !msg.y) return;

        let x = msg.x;
        let y = msg.y;

        // Parse cursor position if it's strings
        if (typeof msg.x == "string") {
            x = parseFloat(msg.x);
        } else {
            socket.gateway.isCursorNotString = true;
        }

        if (typeof msg.y == "string") {
            y = parseFloat(msg.y);
        } else {
            socket.gateway.isCursorNotString = true;
        }

        // Relocate the laggy microscopic speck
        socket.setCursorPos(x, y);
        socket.gateway.hasCursorMoved = true;
    }
};
