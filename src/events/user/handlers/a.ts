import type { Socket } from "~/ws/Socket";
import type { ServerEventListener, SocketMessages } from "~/util/types";

// https://stackoverflow.com/questions/64509631/is-there-a-regex-to-match-all-unicode-emojis
const emojiRegex =
    /(©|®|[ -㌀]|\ud83c[퀀-\udfff]|\ud83d[퀀-\udfff]|\ud83e[퀀-\udfff])/g;

function populateSocketChatGatewayFlags(
    msg: SocketMessages["a"],
    socket: Socket
) {
    socket.gateway.hasSentChatMessage = true;

    if (msg.message.toUpperCase() == msg.message) {
        socket.gateway.hasSentChatMessageWithCapitalLettersOnly = true;
    }

    if (msg.message.includes("͏") || msg.message.includes("​")) {
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
        const part = socket.participant;
        if (!part) return;

        if (typeof msg.message !== "string") return;

        const flags = part.user.flags ?? {};

        if (!flags["no chat rate limit"])
            if (!socket.rateLimits.normal.a.attempt()) return;

        populateSocketChatGatewayFlags(msg, socket);

        // msg.m
        // Permission denied: msg.m
        // sudo msg.m
        part.chat(msg);
    }
};
