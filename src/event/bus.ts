import EventEmitter from "events";

class EventBus extends EventEmitter {
    constructor() {
        super();
    }
}

export const eventBus = new EventBus();
