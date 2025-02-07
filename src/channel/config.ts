import { ConfigManager } from "~/util/config";
import { IChannelSettings } from "~/util/types";

interface ChannelConfig {
    forceLoad: string[];
    lobbySettings: Partial<IChannelSettings>;
    defaultSettings: Partial<IChannelSettings>;
    lobbyRegexes: string[];
    lobbyBackdoor: string;
    fullChannel: string;
    sendLimit: boolean;
    chownOnRejoin: boolean;
    channelDestroyTimeout: number;
    maxBanMinutes: number;
    disableCrown: boolean;
    enableChatCommands: boolean;
    chatFade: boolean;
}

export const config = ConfigManager.loadConfig<ChannelConfig>(
    "config/channels.yml",
    {
        forceLoad: ["lobby", "test/awkward"],
        lobbySettings: {
            lobby: true,
            chat: true,
            crownsolo: false,
            visible: true,
            color: "#73b3cc",
            color2: "#273546"
        },
        defaultSettings: {
            chat: true,
            crownsolo: false,
            color: "#3b5054",
            color2: "#001014",
            visible: true
        },
        // Here's a terrifying fact: Brandon used parseInt to check lobby names
        lobbyRegexes: [
            "^lobby[0-9][0-9]$",
            "^lobby[0-9]$",
            "^lobby$",
            "^lobbyNaN$",
            "^test/.+$"
        ],
        lobbyBackdoor: "lolwutsecretlobbybackdoor",
        fullChannel: "test/awkward",
        sendLimit: false,
        chownOnRejoin: true,
        channelDestroyTimeout: 1000,
        maxBanMinutes: 60,
        disableCrown: false,
        enableChatCommands: false,
        chatFade: false
    }
);
