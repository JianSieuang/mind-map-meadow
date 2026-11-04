# Business Notes

Business Manager · 2026-11-04 · Answers the 2026-11-04 request on `TEAM_BOARD.md`.

## 1. Monthly running cost
**Assumptions** (worst case: every user active daily):
- **Haiku 5.5** ($0.10/$0.50 per MTok): 50 calls/day, ~1,500 tokens in / 80 out → ~$0.29/month.
- **Sonnet 5.5** ($2/$10): one reflection/day, ~6,000 in / 400 out → ~$0.48/month, or ~$0.24 through the Batch API.
- +30% tokenizer buffer → **AI ≈ $0.70–1.00 per user/month**, before prompt caching.
- **Hosting:** Railway-style (Hobby $5 including $5 of usage; Pro $20/seat), app + Postgres. Ollama stays local; a hosted GPU would cost more than everything else.

| Users | Hosting | AI | Total / month | Per user |
|---|---|---|---|---|
| 1 | ~$5 | ~$1 | ~$6 | ~$6 |
| 5 | ~$6 | ~$5 | ~$11 | ~$2.20 |
| 100 | ~$25–40 | ~$70–100 | ~$100–140 | ~$1.20 |
| 1,000 | ~$100–200 | ~$700–1,000 | ~$0.8–1.2k | ~$1.00 |

AI is the cost that grows. **Add per-user call caps and a spend alert before inviting friends.**

## 2. Pricing options
Comparison: YNAB $14.99/mo or $109/yr (paid only) · Habitica free + $4.99/mo or $47.99/yr, plus gems · Finch free + ~$40–70/yr.

- **A. Free + "Meadow Plus", $3.99/mo or $29.99/yr:** daily AI reflection and memory, calendar sync, cosmetic themes. The builder loop stays free; a lapsed Plus removes nothing earned.
- **B. Cosmetic packs, $1.99–4.99:** no gameplay effect. If v1.1 decorations boost buildings, sell only no-boost versions.
- **C. Lifetime supporter, ~$49,** for early friends.

**Never sold:** summons, workers, coins or progress speed-ups.

**Margin warning:** keep free users' AI small (~5 Haiku reactions/day, no Sonnet), or about 1 in 3 users must pay to break even.

## 3. Before charging anyone
- Privacy policy: what we store (including money logs), that task text goes to Anthropic but financial notes never do, retention.
- Terms of service and refund policy.
- Account deletion and data export.
- Payments through a merchant of record (Paddle, Lemon Squeezy) to handle sales tax.
- Daily database backups, since "never destroy progress" is a promise.
- Google OAuth verification: Calendar scopes are "sensitive" (verified domain, privacy policy, demo video; about a week). No paid CASA audit unless we add restricted scopes like Gmail or Drive. Testing mode caps at 100 users.

## Recommendation
**Now:** host staging; set up Haiku with caching, batched Sonnet reflections and per-user caps; draft the privacy policy and terms; buy the domain.

**After the week-4 test:** price, payments and Google verification. Charge only if ~40%+ of testers are still active in week 4, starting with option A at $29.99/yr.

---
Sources: [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Railway pricing (third-party summary)](https://livemy.app/blog/railway-pricing) · [YNAB](https://getfinny.app/blog/ynab-pricing-2026) · [Habitica (App Store)](https://apps.apple.com/app/id994882113) · [Finch (App Store)](https://apps.apple.com/app/id1528595748) · [Google OAuth scope tiers](https://nango.dev/docs/api-integrations/google-shared/google-security-review). Competitor prices come from store listings and review sites, so confirm them before launch.
