/**
 * I made this thing to keep track of what sockets
 * have and haven't done yet so we know if they
 * should be doing certain things.
 *
 * For instance, being logged in in the first place,
 * or if they're on shitty McDonalds WiFi and they
 * lost connection for over a minute, or if they
 * decided that they're going to put their browser
 * in a chokehold and force it to load weird shit...
 * or, you know, maybe I could log their user agent
 * and IP address instead sometime in the future.
 */

import { Logger } from "~/util/Logger";

const logger = new Logger("Socket Gateway");

export class Gateway {
    // Whether we have correctly processed this socket's hi message
    public hasProcessedHi = false; // implemented

    // Whether they have sent the MIDI devices message
    public hasSentDevices = false; // implemented

    // Whether they have sent a token
    public hasSentToken = false; // implemented

    // Whether their token is valid
    public isTokenValid = false; // implemented

    // Their user agent, if sent
    public userAgent = ""; // partially implemented

    // Whether they have moved their cursor
    public hasCursorMoved = false; // implemented

    // Whether they sent a cursor message that contained numbers instead of stringified numbers
    public isCursorNotString = false; // implemented

    // The last time they sent a ping message
    public lastPing = Date.now(); // implemented

    // Whether they have joined any channel
    public hasJoinedAnyChannel = false; // implemented

    // Whether they have joined a lobby
    public hasJoinedLobby = false; // implemented

    // Whether they have made a regular non-websocket request to the HTTP server
    // probably useful for checking if they are actually on the site
    // Maybe not useful if cloudflare is being used
    // In that scenario, templating wouldn't work, either
    public hasConnectedToHTTPServer = false; // implemented

    // Various chat message flags
    public hasSentChatMessage = false; // implemented
    public hasSentChatMessageWithCapitalLettersOnly = false; // implemented
    public hasSentChatMessageWithInvisibleCharacters = false; // implemented
    public hasSentChatMessageWithEmoji = false; // implemented

    // Whehter or not the user has played the piano in this session
    public hasPlayedPianoBefore = false; // implemented

    // Whether the user has sent a channel list subscription request, a.k.a. opened the channel list
    public hasOpenedChannelList = false; // implemented

    // Whether the user has sent a custom message subscription request (+custom)
    public hasSentCustomSub = false; // implemented

    // Whether the user has sent a custom message unsubscription request (-custom)
    public hasSentCustomUnsub = false; // implemented

    // Whether the user has changed their name/color this session (not just changed from default)
    public hasChangedName = false; // implemented
    public hasChangedColor = false; // implemented

    // Whether they sent an admin message that was invalid (wrong password, etc)
    public hasSentInvalidAdminMessage = false; // implemented

    // Whether or not they have passed the b message
    public hasCompletedBrowserChallenge = false; // implemented

    public dump() {
        return JSON.stringify(this, undefined, 4);
    }
}
