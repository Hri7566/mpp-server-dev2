import type { ServerEventListener } from "~/util/types";
import { config } from "~/ws/usersConfig";

export const userset: ServerEventListener<"userset"> = {
	id: "userset",
	callback: async (msg, socket) => {
		// Change username/color
		if (!socket.rateLimits?.chains.userset.attempt()) return;
		if (msg.set.name !== "undefined" && typeof msg.set.name !== "string") return;
		if (msg.set.color !== "undefined" && typeof msg.set.color !== "string") return;

		const user = socket.getUser();
		if (!user) return;

		if (typeof msg.set.name === "string" && msg.set.name !== user.name) {
			socket.gateway.hasChangedName = true;
		}

		if (
			typeof msg.set.color === "string" &&
			msg.set.color !== user.color &&
			config.enableColorChanging
		) {
			socket.gateway.hasChangedColor = true;
		}

		socket.userset(msg.set.name, msg.set.color);
	},
};
