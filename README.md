# ⚡ NEON BREAKOUT

A neon arcade brick-breaker. Keep the ball in play, destroy every brick and beat your high score!

## 🎮 How to play

- Move the paddle to bounce the ball back toward the bricks.
- **Endless arcade:** clear each sector to unlock the next wave. There is **no final level** — keep playing for the highest score possible.
- You start with **3 lives**. The run ends when all lives are lost.
- Each completed sector awards bonus points; later waves include tougher brick layouts.
- Hit bricks in quick succession to build a **combo** and earn more points.
- Your **personal best** is saved in your browser.

## 🕹️ Controls

| Action | Keyboard & mouse | Touchscreen |
| --- | --- | --- |
| Move paddle | **← / →**, **A / D**, or move the mouse left/right | Drag left/right |
| Launch ball | **Space** or **left-click** the playfield | Tap the playfield |
| Pause / resume | **P** or **Esc** | Pause button |
| Mute/unmute all sound | **M** | Speaker button |
| Adjust SFX and music | **SFX / Music sliders** in the top bar | Same sliders |

## ⚡ Neon FX

- Glowing glass bricks with cyan, pink, amber and other electric colours.
- **Brick hit:** quick neon sparks, diamond-shaped fragments and impact rings.
- **Brick destroyed:** bigger bursts, luminous shards and brief cyber HUD callouts.
- **Power-ups:** glowing electric orbs, trailing sparks and a pickup pulse.
- **Sector clear:** an expanding energy shockwave, confetti and a neon scan revealing the next endless wave.

All visual effects are generated directly in Canvas and do not require external image assets.

## ✨ Power-ups

**Hollow, glowing-outline bricks contain a guaranteed power-up.** Break one, then catch the falling bonus with your paddle.

| Bonus | Effect |
| --- | --- |
| **W — Wide Paddle** | A wider paddle for **12 seconds** |
| **M — Multiball** | Splits the ball into extra balls |
| **S — Slow-Mo** | Slows the balls for **9 seconds** |

Some later-sector bricks need **two hits** to break. Keep an eye on your remaining lives and sector progress!

## 🎵 Music & asset credits

This section distinguishes **assets actually used in the game** from **visual references**. Credits are included even where the license does not require them.

### Music — included in the game (attribution required)

- **Track:** **"Technocade" (Looping)**
- **Composer / creator:** **Eric Matyas**
- **Artist's website:** https://soundimage.org/
- **Original publication and download page:** https://opengameart.org/content/technocade-looping
- **Audio files published with the track:**
  - OGG: https://opengameart.org/sites/default/files/technocade.ogg
  - MP3: https://opengameart.org/sites/default/files/technocade_0.mp3
- **License:** Creative Commons Attribution 3.0 Unported (**CC BY 3.0**) — https://creativecommons.org/licenses/by/3.0/
- **Required attribution, as requested by the composer:** **"Technocade" by Eric Matyas — Soundimage.org.**
- **Changes:** No remix or editing of the original audio. The game loops the published track and adjusts playback volume during runtime.

The game currently loads this music from OpenGameArt. Internet access is needed for playback. Music starts after the player presses **Start Game** and can be adjusted independently with the **Music** slider.

### Particle effects and graphics — original code, visual references credited

- **Kenney / Kenney Vleugels — Particle Pack**  
  Asset page: https://kenney.nl/assets/particle-pack  
  Alternative publication: https://opengameart.org/content/particle-pack-80-sprites  
  License of Kenney's pack: **CC0 1.0** — https://creativecommons.org/publicdomain/zero/1.0/  
  **Usage status:** Visual inspiration for the glowing particle style. **No PNGs, spritesheets, textures or other files from this pack are currently included in Neon Breakout.** Attribution is optional under CC0; included here to recognize Kenney's work.

- **MasterJimo — Star Swarm**  
  Original project: https://github.com/MasterJimo/Star-Swarm  
  **Usage status:** Reference for Neon Breakout's neon colour palette. No Star Swarm image assets are imported.

- **Neon Breakout game art and VFX:** Brick glow, lightning-orb power-ups, particle shards, rings, trails, paddle, background, mini-icons and in-game UI are **drawn procedurally with HTML, CSS, SVG and JavaScript Canvas**. The approved concept/mockup guided the appearance; it is not shipped as a gameplay texture.

### Sound effects — generated in the game

- **Source:** `game.js` (Web Audio API).
- **Usage status:** Paddle bounces, brick collisions, pickups, transitions and other arcade cues are **synthesized in code**, not taken from an external SFX pack.
- **Third-party audio files:** None for SFX; the Eric Matyas track above is the only external audio asset currently referenced.

### Attribution notes

**CC BY 3.0** requires crediting the composer and supplying the source/license links above. **CC0 1.0** does not require attribution, but Kenney is acknowledged as a creative reference. Those licenses apply to their respective works; they do **not** imply that the entire Neon Breakout project is under CC0 or CC BY.

The soundtrack uses the existing in-game speaker mute control (**M**) and separate 0–100% **SFX** and **Music** sliders. Volume preferences are remembered in your browser.

**Break the bricks. Chase the high score.** ✦
