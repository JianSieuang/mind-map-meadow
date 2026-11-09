import { pool } from "./db.js";
import { normalizeBindings } from "./keybindings.js";

// Per-account settings. save_keybindings takes a full set; anything invalid (unknown key,
// a key used twice, a reserved key) is refused whole, so a saved set always works.
export function registerSettingsEvents(io, socket) {
    const userId = socket.data.userId;

    socket.on("save_keybindings", async (payload) => {
        const bindings = normalizeBindings(payload?.keybindings);
        if (!bindings) return socket.emit("settings_error", "Those shortcuts can't be saved: each key can only be used once.");
        try {
            await pool.query(`UPDATE users SET settings = jsonb_set(settings, '{keybindings}', $1::jsonb) WHERE id = $2`, [JSON.stringify(bindings), userId]);
            // Every tab and device signed in to this account switches over.
            io.to(`user:${userId}`).emit("settings", { keybindings: bindings });
        } catch (err) {
            console.error("❌ [Save Keybindings]:", err.message);
            socket.emit("settings_error", "Couldn't save your shortcuts. Please try again.");
        }
    });
}
