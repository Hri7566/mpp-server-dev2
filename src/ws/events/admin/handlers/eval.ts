import { ServerEventListener } from "~/util/types";
import { config } from "~/ws/usersConfig";

export const eval_msg: ServerEventListener<"eval"> = {
    id: "eval",
    callback: async (msg, socket) => {
        // Evaluate a JavaScript expression
        if (!config.enableAdminEval) return;
        if (typeof msg.str !== "string") return;
        socket.eval(msg.str);
    }
};
