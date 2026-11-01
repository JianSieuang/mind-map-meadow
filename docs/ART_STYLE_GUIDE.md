# Mind Map Meadow — Pixel Style Guide (v2, draft)

Reference implementation: `gen-v2.js` (Fitness Lv1–3 + 24×32 player) — generator scripts live in the session scratchpad, final PNGs in `mind-map-meadow/src/assets/`. Size ratios between buildings and characters are summarised in [`PLAN.md`](PLAN.md).

## 1. Projection: ¾ top-down oblique (Pokémon / Stardew)
- The camera looks down at a fixed angle. Ground tiles are drawn as **square** 48×48 cells.
- **Vertical faces** (walls, fences, people) are drawn at **1 px of height = 1 px of screen up**.
- **Horizontal faces** (roofs, tables, the ground) are drawn at **1 px of depth = 1 px of screen up**. The top face sits directly above the front face; nothing is skewed.
- **No side faces.** Never draw an isometric or perspective side wall. To show volume, darken the right 1/6 of the front face and of the roof.
- **Round things** (the stadium, fountains, plates) have an ellipse top with a ratio of about 3:2 (w:h). Their front face is the lower half-ellipse extruded straight down.
- **Pitched roofs:** draw the front slope as the top face. The ridge sits at depth D, and you never see the back slope.

## 2. Footprint and size
| Thing | Footprint | Canvas | Wall height | Top depth D |
|---|---|---|---|---|
| Building Lv1 | 2×2 tiles (96×96) | 96×112 | props only, ≤ 30 | — |
| Building Lv2 | 2×2 | 96×136 | 46 (1 storey) | 56 |
| Building Lv3 | 2×2 | 96×168 | 60 (1.5 storeys) + topper | 60 |
| Decoration | 1×1 | 48×48 to 48×64 | ≤ 24 | ≤ 24 |
| Landmark | 3×3+ | 144×(144+H) | free | free |

- **Anchor:** the bottom 96 rows of every canvas are the footprint. Bottom-align the canvas to the footprint's front edge.
- **Front apron:** leave 8–16 px of ground in front of the wall for the doorstep and the shadow.
- **Side margin:** keep the art at x ≤ 91 so the drop shadow fits inside 96.
- **Storey height:** 44–46 px.
- **Doors:** 18 wide × 34 tall.
- **Windows:** sill about 10 px above the ground.

## 3. Characters
- **Canvas:** 24×32, with feet on the bottom row.
- **Proportions:** the head is 14 px wide, about 40% of the body (chibi).
- **Scale:** that makes a person ¼ of a building's width and ¾ of a storey tall, so they fit through a door.
- **Existing sprites:** the current 32×48 player and AI companion must be redrawn.
- **Animation:** 4 directions × 3 frames.

## 4. Light, outline, shadow
- **Light** comes from the top-left: the left edge and top surfaces use the light tone, and the right 1/6 uses the dark tone.
- **Outline:** a 1 px `#2b1e1a` outline on the outer silhouette of every sprite, characters included. The white sticker outline is retired.
- **Interior lines:** use the darker ramp tone, never black.
- **Building and prop shadow:** the sprite silhouette offset by (+4, +2), colour `#1c1a2e` at 31% alpha (RGBA 28, 26, 46, 80), drawn only under transparent pixels.
- **Character and small-prop shadow:** an ellipse under the feet, rx = 0.35 × width, ry = 2, in the same colour.
- **Banned:** gradients and anti-aliasing.

## 5. Master palette (32)
| Group | Hex | Use |
|---|---|---|
| Outline | `#2b1e1a` | every outline |
| Grass | `#3f7a3a` `#5a9a4a` `#7cbf5a` `#a8d672` | ground, shrubs, pitch |
| Dirt | `#6e5234` `#8a6a45` `#a5825a` `#c9a978` | paths, yards, sand |
| Stone | `#5d6470` `#8a919c` `#b5bbc4` `#dfe2e6` | roofs, bases, metal highlights |
| Wood | `#6b3f22` `#a2652f` `#c4824a` | doors, fences, hair |
| Cream wall | `#cfa877` `#e8c99a` `#f6e6c8` | plaster walls, rims |
| Red (Fitness accent) | `#9c2f2b` `#d2493f` `#ef7a62` | brick, flags |
| Blue (Learning accent, glass) | `#2f6f9a` `#4f93b0` `#7fc4dc` `#bfe6f2` | windows, water |
| Gold (Finance accent, coins) | `#a8770b` `#e0a526` `#ffd65a` | coins, trophies |
| Skin | `#c98a62` `#f0c29a` | people |
| Misc | `#f4efe6` (white), `#3d3f46` (iron), `#5a3b6e` (purple, Homes and night accent) | |

Each line has its own accent: Fitness = red, Learning = blue, Finance = gold, Homes = purple roof with cream walls.

## 6. Ship checklist
1. Canvas width is 96 for buildings or 48 for decorations, the bottom 96 (or 48) rows are the footprint, and the art stays at x ≤ 91.
2. Only front and top faces are drawn, with no side walls. Top depth is 1:1, and round tops are 3:2 ellipses.
3. Storey height is about 45 px, the door is 18×34, and the 24×32 character fits through the door.
4. Every colour comes from the 32-colour palette (check with a script).
5. There is one 1 px `#2b1e1a` outline, with no white outlines, gradients or anti-aliasing.
6. Light comes from the top-left and the right 1/6 is shaded.
7. The shadow follows the standard (silhouette at +4,+2 or an ellipse), with no hard black shadows.
8. Check a 4× preview on grass: no transparent seams or stray pixels outside the silhouette.
9. Check a lineup next to the player and an existing building: angle and scale read the same.
10. Each level of a line is clearly taller or richer than the one below it, keeps the same accent colour, and keeps a recognisable motif (for Fitness, the barbell or trophy).
