import { test, expect } from "bun:test";
import { getMOTD } from "~/util/motd";

test("MOTD contains text", () => {
    expect(getMOTD()).toBeString();
});
