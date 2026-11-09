// Keyboard shortcuts saved per account: save_keybindings -> settings (whole room) or settings_error.
import { check, eq, section, mkUser, connect, init, until, q1 } from "../lib/harness.mjs";
import { DEFAULT_BINDINGS, normalizeBindings, keyCodeFor, keyLabel } from "../../server/keybindings.js";

export async function run() {
    section("keybindings: shared rules");
    {
        eq("defaults are valid", normalizeBindings(DEFAULT_BINDINGS), DEFAULT_BINDINGS);
        eq("missing actions take their default", normalizeBindings({ quickLog: "KeyQ" })?.quickLog, "KeyQ");
        eq("a key used twice is refused", normalizeBindings({ ...DEFAULT_BINDINGS, tasks: "KeyL" }), null);
        for (const bad of ["Escape", "Tab", "Enter", "ArrowUp", "F5", "ShiftLeft", "", 7, null]) check(`"${bad}" can't be bound`, normalizeBindings({ ...DEFAULT_BINDINGS, help: bad }) === null);
        eq("not an object", [normalizeBindings(null), normalizeBindings([]), normalizeBindings("x")], [null, null, null]);
        eq("key codes for Phaser", [keyCodeFor("KeyW"), keyCodeFor("Digit3"), keyCodeFor("Slash"), keyCodeFor("Escape")], [87, 51, 191, null]);
        eq("labels", [keyLabel("KeyL"), keyLabel("Slash"), keyLabel("Numpad4")], ["L", "/", "Num 4"]);
    }

    section("keybindings: saved per account");
    {
        const u = await mkUser("keys");
        const other = await mkUser("keysother");
        const s = await connect(u);
        const first = await init(s);
        eq("init_state starts with the defaults", first.settings?.keybindings, DEFAULT_BINDINGS);

        const tab2 = await connect(u);
        await init(tab2);
        const mine = { ...DEFAULT_BINDINGS, quickLog: "KeyQ", moveUp: "KeyI" };
        const echoed = until(tab2, "settings", "noop_never_sent", undefined, 3000).catch(() => null);
        const saved = await until(s, "settings", "save_keybindings", { keybindings: mine });
        eq("saved set is sent back", saved?.keybindings, mine);
        eq("other tabs of the account get it too", (await echoed)?.keybindings, mine);
        const stored = (await q1("SELECT settings FROM users WHERE id = $1", [u.id])).settings.keybindings;
        check("stored on the user", Object.keys(mine).every((k) => stored[k] === mine[k]) && Object.keys(stored).length === Object.keys(mine).length, stored);
        eq("and comes back on the next load", (await init(await connect(u))).settings?.keybindings, mine);
        eq("other users keep the defaults", (await init(await connect(other))).settings?.keybindings, DEFAULT_BINDINGS);

        for (const [label, payload] of [
            ["duplicate key", { keybindings: { ...mine, tasks: "KeyQ" } }],
            ["reserved key", { keybindings: { ...mine, help: "Escape" } }],
            ["no payload", undefined],
            ["array", { keybindings: ["KeyQ"] }],
        ]) {
            const err = await until(s, "settings_error", "save_keybindings", payload, 2000).catch(() => null);
            check(`${label}: refused with settings_error`, typeof err === "string", err);
        }
        await until(s, "settings", "save_keybindings", { keybindings: JSON.parse('{"__proto__":{"polluted":1},"quickLog":"KeyQ"}') });
        check("prototype keys are ignored", ({}).polluted === undefined && !Object.hasOwn((await q1("SELECT settings FROM users WHERE id = $1", [u.id])).settings.keybindings || {}, "__proto__"));
        eq("a refused save leaves the stored set alone", (await q1("SELECT settings FROM users WHERE id = $1", [u.id])).settings.keybindings.quickLog, "KeyQ");
    }
}
