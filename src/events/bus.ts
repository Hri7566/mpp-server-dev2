import EventEmitter from "events";
import { Logger } from "~/util/Logger";

class EventBus extends EventEmitter {
    public logger = new Logger("Event Bus");

    constructor() {
        super();
    }

    public override emit<K>(eventName: string | symbol, ...args: any[]) {
        super.emit("*", eventName, ...args);
        return super.emit(eventName, ...args);
    }
}

export const bus = new EventBus();
