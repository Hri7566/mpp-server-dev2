import { expect, test } from "bun:test";
import { validateChannelSettings } from "~/channel/settings";

test("valid settings pass", () => {
    expect(
        validateChannelSettings({
            color: "#abcdef",
            color2: "#000000",
            chat: true,
            crownsolo: false,
            visible: true,
            limit: 10
        })
    ).toEqual({
        color: true,
        color2: true,
        chat: true,
        crownsolo: true,
        visible: true,
        limit: true
    });
});

test("wrong types and formats fail", () => {
    const result = validateChannelSettings({
        color: "red",
        color2: "#12345",
        chat: "yes",
        limit: 100
    } as never);

    expect(result.color).toBeFalse();
    expect(result.color2).toBeFalse();
    expect(result.chat).toBeFalse();
    expect(result.limit).toBeFalse();
});

test("limit must be between 0 and 99", () => {
    expect(validateChannelSettings({ limit: -1 }).limit).toBeFalse();
    expect(validateChannelSettings({ limit: 0 }).limit).toBeTrue();
    expect(validateChannelSettings({ limit: 99 }).limit).toBeTrue();
    expect(validateChannelSettings({ limit: 100 }).limit).toBeFalse();
});

test("unknown keys are skipped", () => {
    const result = validateChannelSettings({ potato: 1 } as never);
    expect(result).toEqual({});
});

test("admin-only keys need admin", () => {
    expect(validateChannelSettings({ owner_id: "x", lobby: true })).toEqual(
        {}
    );
    expect(
        validateChannelSettings({ owner_id: "x", lobby: true }, true)
    ).toEqual({ owner_id: true, lobby: true });
});
