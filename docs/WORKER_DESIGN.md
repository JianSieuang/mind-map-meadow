# Worker Design Sheet (draft for the owner to edit)

Everything here is a starting point. Change names, numbers, or whole rows. The game reads this as data, so edits don't change the system.

## 1. Rarity (what you can pull from a summon)
| Rarity | Odds | Work speed | Ability? | Look |
|---|---|---|---|---|
| Normal | 60% | ×1.0 | None | Plain clothes |
| Rare | 25% | ×1.1 | 1 small | Blue trim |
| Epic | 12% | ×1.25 | 1 strong | Purple trim + badge |
| Legendary | 3% | ×1.5 | 1 unique | Gold trim + sparkle |

## 2. Skill (where they work best)
A worker earns +20% extra when staffed in a building of their skill.
| Skill | Best in | Theme |
|---|---|---|
| Trainer | Fitness: yard, gym, arena | Sporty |
| Scholar | Learning: shed, library, academy | Books, glasses |
| Merchant | Finance: stall, market, bank | Apron, coin pouch |
| All-rounder | No +20%, but +5% everywhere | Toolbelt |

## 3. Abilities (the special effect)
| Ability | Effect | For |
|---|---|---|
| Deep Pockets | Their building stores 25% more coins | Rare |
| Quick Hands | Their building's work speed +5% | Rare |
| Early Bird | First Collect all of the day: +3 coins | Rare |
| Bargainer | Merges cost 10% less | Epic |
| Cheerleader | Buildings next to theirs earn +5% | Epic |
| Recruiter | +1 extra worker slot | Epic |
| Master Builder | Merges cost 25% less | Legendary |
| Town Hero | All buildings earn +5% | Legendary |
| Lucky Star | Better odds on your next summons | Legendary |

Abilities only ever help. None of them earn coins while the town is asleep, so real effort stays the source of progress.

## 4. Starter roster (12 workers)
| Name | Rarity | Skill | Ability |
|---|---|---|---|
| Ben | Normal | Trainer | — |
| Mia | Normal | Scholar | — |
| Sam | Normal | Merchant | — |
| Joe | Normal | All-rounder | — |
| Coach Rae | Rare | Trainer | Quick Hands |
| Ivy | Rare | Scholar | Early Bird |
| Penny | Rare | Merchant | Deep Pockets |
| Max Iron | Epic | Trainer | Cheerleader |
| Professor Lin | Epic | Scholar | Recruiter |
| Madam Gold | Epic | Merchant | Bargainer |
| Old Tom | Legendary | All-rounder | Master Builder |
| Mayor Star | Legendary | All-rounder | Town Hero |

Each worker needs one 24×32 sprite, so 12 sprites in total.

## 5. Rules to decide
| # | Question | Draft answer |
|---|---|---|
| 1 | Pull a worker you already own? | Keeps counting as a worker, and that worker gains a star (+5% speed, up to 3 stars) |
| 2 | Bad-luck protection? | At least Epic guaranteed every 10 summons |
| 3 | Can workers level up? | Not in v1 |
| 4 | Who chooses where workers go? | Auto-assign best match by default; you can move them by hand |
| 5 | Can you dismiss a worker? | No. Workers are never lost |
| 6 | Show the odds to players? | Yes, always |
| 7 | Buy summons with real money? | Never |
| 8 | Buy summons with coins? | Later (v1.1), as a use for spare coins |
