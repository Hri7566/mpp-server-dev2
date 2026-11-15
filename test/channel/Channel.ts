import { expect, test } from "bun:test";
import { Channel } from "~/channel";

test("Channels can exist", () => {
    const ch = new Channel("potato");
});
