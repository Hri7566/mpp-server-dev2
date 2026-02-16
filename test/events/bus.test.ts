import { test, expect } from "bun:test";
import { bus } from "~/events/bus";

test("Event bus", () => {
    let hasReceivedEvent = false;

    bus.on("event", () => {
        hasReceivedEvent = true;
    });

    bus.emit("event");
    expect(hasReceivedEvent).toBeTrue();
});
