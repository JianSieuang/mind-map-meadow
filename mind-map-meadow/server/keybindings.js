// Keyboard shortcuts, shared by the server (validation) and the client (game + settings).
// Plain data, no imports. Keys are KeyboardEvent.code values ("KeyL"), so they follow the
// key's position, not the letter a keyboard layout prints on it.
export const KEY_ACTIONS = [
    { id: "moveUp", label: "Walk up", group: "Move", default: "KeyW" },
    { id: "moveLeft", label: "Walk left", group: "Move", default: "KeyA" },
    { id: "moveDown", label: "Walk down", group: "Move", default: "KeyS" },
    { id: "moveRight", label: "Walk right", group: "Move", default: "KeyD" },
    { id: "quickLog", label: "Quick log", group: "Open", default: "KeyL" },
    { id: "tasks", label: "Tasks", group: "Open", default: "KeyT" },
    { id: "map", label: "Map", group: "Open", default: "KeyM" },
    { id: "buildings", label: "Buildings", group: "Open", default: "KeyB" },
    { id: "collect", label: "Collect all", group: "Do", default: "KeyC" },
    { id: "help", label: "This list", group: "Do", default: "Slash" },
];

export const DEFAULT_BINDINGS = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.default]));

// Letters, digits and punctuation only. Esc, Tab, Enter, arrows, modifiers and F-keys stay
// fixed so you can always back out, type, move and use the browser.
const PUNCTUATION = { Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Minus: "-", Equal: "=", Backquote: "`", Space: "Space" };
const PUNCTUATION_KEYCODE = { Slash: 191, Backslash: 220, BracketLeft: 219, BracketRight: 221, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Minus: 189, Equal: 187, Backquote: 192, Space: 32 };

export function isBindable(code) {
    return typeof code === "string" && (/^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || /^Numpad[0-9]$/.test(code) || Object.hasOwn(PUNCTUATION, code));
}

// What to print on the key cap.
export function keyLabel(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
    return PUNCTUATION[code] || code;
}

// The legacy keyCode Phaser matches on.
export function keyCodeFor(code) {
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
    if (/^Digit[0-9]$/.test(code)) return 48 + Number(code[5]);
    if (/^Numpad[0-9]$/.test(code)) return 96 + Number(code[6]);
    return PUNCTUATION_KEYCODE[code] ?? null;
}

// A full, valid set or null: every action present once, each on a bindable key, no key twice.
// Missing actions take their default (so adding an action later doesn't break saved sets).
export function normalizeBindings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const out = {};
    for (const action of KEY_ACTIONS) {
        const code = Object.hasOwn(input, action.id) ? input[action.id] : action.default;
        if (!isBindable(code)) return null;
        out[action.id] = code;
    }
    if (new Set(Object.values(out)).size !== KEY_ACTIONS.length) return null;
    return out;
}

// Saved settings can predate a new action or a changed default; fall back rather than fail.
export function bindingsFrom(settings) {
    return normalizeBindings(settings?.keybindings || {}) || { ...DEFAULT_BINDINGS };
}
