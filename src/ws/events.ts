import type { ServerEventListener, ServerEvents } from "../util/types";

export class EventGroup {
    public eventList = new Array<ServerEventListener<keyof ServerEvents>>();
    constructor(public id: string) {}

    public add(listener: ServerEventListener<keyof ServerEvents>) {
        this.eventList.push(listener);
    }

    public addMany(...listeners: ServerEventListener<keyof ServerEvents>[]) {
        for (const l of listeners) this.add(l);
    }

    public remove(listener: ServerEventListener<keyof ServerEvents>) {
        this.eventList.splice(this.eventList.indexOf(listener), 1);
    }
}

export const eventGroups = new Array<EventGroup>();

require("./events.inc");
