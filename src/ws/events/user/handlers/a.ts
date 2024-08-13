import { Socket } from "../../../Socket";
import { ServerEventListener, ServerEvents } from "../../../../util/types";

// https://stackoverflow.com/questions/64509631/is-there-a-regex-to-match-all-unicode-emojis
const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;

function populateSocketChatGatewayFlags(msg: ServerEvents["a"], socket: Socket) {
    socket.gateway.hasSentChatMessage = true;

    if (msg.message.toUpperCase() == msg.message) {
        socket.gateway.hasSentChatMessageWithCapitalLettersOnly = true;
    }

    if (msg.message.includes("\u034f") || msg.message.includes("\u200b")) {
        socket.gateway.hasSentChatMessageWithInvisibleCharacters = true;
    }

    if (msg.message.match(/[^\x00-\x7f]/gm)) {
        socket.gateway.hasSentChatMessageWithInvisibleCharacters = true;
    }

    if (msg.message.match(emojiRegex)) {
        socket.gateway.hasSentChatMessageWithEmoji = true;
    }
}

export const a: ServerEventListener<"a"> = {
    id: "a",
    callback: async (msg, socket) => {
        // Chat message
        const flags = socket.getUserFlags();
        if (!flags) return;

        if (typeof msg.message !== "string") return;

        // Why did I write this statement so weird
        if (!flags["no chat rate limit"] || flags["no chat rate limit"] == 0)
            if (!socket.rateLimits?.normal.a.attempt()) return;

        populateSocketChatGatewayFlags(msg, socket);

        const ch = socket.getCurrentChannel();
        if (!ch) return;

        // msg.m
        // Permission denied: msg.m
        // sudo msg.m
        ch.emit("a", msg, socket);
    }
};
