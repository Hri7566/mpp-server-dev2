import type Channel from "./Channel";
import { Participant } from "~/participant";

export class ChannelList {
    private static list = new Array<Channel>();
    public static subscribers = new Array<string>();

    /**
     * Add a channel to the list
     * @param channel Channel to add
     */
    public static add(channel: Channel) {
        this.list.push(channel);
    }

    /**
     * Remove a channel from the list
     * @param channel Channel to remove
     */
    public static remove(channel: Channel) {
        this.list.splice(this.list.indexOf(channel), 1);
    }

    /**
     * Get the channel list as an array
     * @returns List of channels
     */
    public static getList() {
        return this.list;
    }

    /**
     * Get a channel in the list by its ID
     * @param _id Channel ID
     * @returns Channel
     */
    public static getChannel(_id: string) {
        return this.list.find(ch => ch.getID() === _id);
    }

    /**
     * Find a channel by a fuzzy string
     * @param text Fuzzy string to match against
     * @returns Channel (if found)
     */
    public static findChannelFuzzy(text: string) {
        return this.list.find(
            ch => ch.getID().toLowerCase() == text.toLowerCase()
        );
    }

    /**
     * Get a list of public channels
     * @returns List of channels not including private ones
     */
    public static getPublicList() {
        return this.list.filter(ch => ch.getSetting("visible") == true);
    }

    /**
     * Add a participant to the list of subscribers to send channel list events to
     * @param partId Participant ID
     */
    public static subscribe(partId: Participant["id"]) {
        if (partId) this.subscribers.push(partId);
    }

    /**
     * Remove a participant from the list of subscribers, preventing them from receiving channel list events
     * @param partId Participant ID
     */
    public static unsubscribe(partId: Participant["id"]) {
        if (partId)
            this.subscribers.splice(this.subscribers.indexOf(partId), 1);
    }
}
