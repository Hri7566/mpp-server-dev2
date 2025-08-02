import EventEmitter from "events";

class EventBus extends EventEmitter {
    constructor() {
        super();
    }

    public override emit<K>(eventName: string | symbol, ...args: any[]) {
        super.emit("*", eventName, ...args);
        return super.emit(eventName, ...args);
    }
}

export const bus = new EventBus();
