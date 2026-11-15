import { ServerEventListener } from "~/util/types";

export const m: ServerEventListener<"m"> = {
    id: "m",
    callback: async (msg, socket) => {
        // Cursor movement
        const part = socket.participant;
        if (!part) return;

        if (!part.user.flags?.["no cursor rate limit"])
            if (!socket.rateLimits.normal.m.attempt()) return;

        if (typeof msg.x === "undefined" || typeof msg.y === "undefined")
            return;

        let x = msg.x;
        let y = msg.y;

        // Parse cursor position if it's strings
        if (typeof x == "string") {
            x = parseFloat(x);
        } else {
            socket.gateway.isCursorNotString = true;
        }

        if (typeof y == "string") {
            y = parseFloat(y);
        } else {
            socket.gateway.isCursorNotString = true;
        }

        if (typeof x !== "number" || typeof y !== "number") return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        // Relocate the laggy microscopic speck
        part.setCursorPos(x, y);
        socket.gateway.hasCursorMoved = true;
    }
};
