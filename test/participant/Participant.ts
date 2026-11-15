import { expect, test } from "bun:test";
import { Participant } from "~/participant";

test("Participants work without sockets", () => {
    const p = new Participant();

    p.once("load", () => {});
});
