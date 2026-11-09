// user_identities: one row per (provider, provider id) -> user. Calls the sign-in helper directly,
// since real provider tokens are never used in tests.
import { check, eq, section, q1, qa, db } from "../lib/harness.mjs";

export async function run() {
    const { findOrCreateUser, EmailTakenError } = await import("../../server/auth.js");
    const tag = Date.now();

    section("user_identities: migration backfill");
    {
        const missing = await qa(`SELECT u.id FROM users u WHERE u.google_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = u.id AND i.provider = 'google' AND i.provider_user_id = u.google_id) AND u.created_at < (SELECT applied_at FROM schema_migrations WHERE filename = '19_user_identities.sql')`);
        eq("every pre-existing Google login has an identity row", missing.length, 0);
    }

    section("user_identities: sign in, again, and another provider");
    {
        const first = await findOrCreateUser("google", { providerUserId: `g-${tag}`, email: `id${tag}@test.local`, name: "Ida", avatarUrl: null });
        const ids = await qa("SELECT provider, provider_user_id, last_login_at FROM user_identities WHERE user_id = $1", [first.id]);
        eq("new login: user + one google identity", ids.map((r) => [r.provider, r.provider_user_id]), [["google", `g-${tag}`]]);
        check("new login: player_stats row made", !!(await q1("SELECT 1 FROM player_stats WHERE user_id = $1", [first.id])));

        const again = await findOrCreateUser("google", { providerUserId: `g-${tag}`, email: `id${tag}@test.local`, name: "Ida", avatarUrl: null });
        eq("same login again: same user", again.id, first.id);
        eq("no second user for it", (await q1("SELECT COUNT(*)::int AS n FROM users WHERE email = $1", [`id${tag}@test.local`])).n, 1);

        let refused = null;
        try {
            await findOrCreateUser("facebook", { providerUserId: `f-${tag}`, email: `ID${tag}@test.local`, name: "Imposter", avatarUrl: null });
        } catch (err) {
            refused = err;
        }
        check("another provider with the same email is refused, never auto-joined", refused instanceof EmailTakenError, refused?.message);
        eq("and nothing was created for it", (await q1("SELECT COUNT(*)::int AS n FROM user_identities WHERE provider_user_id = $1", [`f-${tag}`])).n, 0);

        const noEmail = await findOrCreateUser("facebook", { providerUserId: `f2-${tag}`, email: undefined, name: "No Email", avatarUrl: null });
        check("a provider that withholds the email still gets an account", noEmail.id && noEmail.email === null && noEmail.google_id === null, noEmail);

        // Linking (later, from inside a signed-in account) is just another row for the same user.
        await db.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'facebook', $2)", [first.id, `f3-${tag}`]);
        eq("a linked provider signs in to the same account", (await findOrCreateUser("facebook", { providerUserId: `f3-${tag}`, email: null, name: "x", avatarUrl: null })).id, first.id);

        const dupe = await db.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)", [first.id, `g2-${tag}`]).catch((e) => e);
        check("one account per provider per user", dupe instanceof Error && dupe.code === "23505", dupe.message);
        const stolen = await db.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'google', $2)", [noEmail.id, `g-${tag}`]).catch((e) => e);
        check("a provider account can't belong to two users", stolen instanceof Error && stolen.code === "23505", stolen.message);
        const badName = await db.query("INSERT INTO user_identities (user_id, provider, provider_user_id) VALUES ($1, 'Bad Name', 'z')", [noEmail.id]).catch((e) => e);
        check("provider names are lowercase words", badName instanceof Error && badName.code === "23514", badName.message);

        await db.query("DELETE FROM users WHERE id = ANY($1)", [[first.id, noEmail.id]]);
        eq("deleting the user removes its identities", (await q1("SELECT COUNT(*)::int AS n FROM user_identities WHERE user_id = ANY($1)", [[first.id, noEmail.id]])).n, 0);
    }
}
