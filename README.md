# ⚡ NEON BREAKOUT

A modern, glowing brick-breaker you can play straight in your browser. Built with **vanilla JavaScript + Canvas**, CSS and HTML — no build step, packages or external game engine.

## 🎮 Play

Open **[index.html](./index.html)** in any modern browser. Move the paddle, bounce the ball and clear all **3 sectors** while keeping your lives.

| Action | Keyboard / Mouse | Mobile |
| --- | --- | --- |
| Move | **← / →** or **A / D**, or move mouse | Drag your finger |
| Launch | **Space** or click playfield | Tap playfield |
| Pause / resume | **P** or **Esc** | Pause button |
| Sound on/off | **M** | Speaker button |

### Features
- Three stages with increasingly challenging brick layouts.
- **Wide paddle**, **multiball**, and **slow motion** power-ups.
- Score, personal best (saved in your browser), combos, lives and stage progress.
- Neon particles, ball trails, screen shake and synthesized arcade sounds.
- Responsive layout and touch controls.

## 🚀 Publish with GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Set **Build and deployment** to **Deploy from a branch**.
3. Choose **main** and **/(root)**, then click **Save**.
4. Once GitHub Pages has published the site, play at `https://masterjimo.github.io/Neon-Breakout/`.

## 🛠 Local development

No setup needed. You can simply double-click `index.html`, or start a local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Files

- `index.html` — layout, HUD and menus
- `style.css` — neon arcade styling and responsive layout
- `game.js` — collision physics, levels, effects, sound and input

Made for the high score chasers. ✦
