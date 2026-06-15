# ♟️ OMNI ARENA — Chess KILLSTREAK

A complete, **single-file** custom Chess Arena that runs entirely in the browser. No build step, no dependencies — just open `index.html`.

## ▶️ Play

**[Play on GitHub Pages →](https://rdelorier.github.io/chess_KILLSTREAK/)**

Or clone and open `index.html` directly in any modern browser.

## Features

- **Two modes** — Local **1v1** hot-seat, or solo vs an **AI bot** (minimax + alpha-beta, three difficulties: Rookie / Strategist / Grandmaster).
- **Full legal chess** — castling, en passant, promotion, check / checkmate / stalemate, insufficient-material draws. Move generation is verified against standard `perft` counts through depth 4.
- **Coin economy + Shop** — earn gold by winning, spend it on board themes, piece skins, and FX trails. Progress persists via `localStorage`.
- **FX trails** — moving pieces leave a fading emoji particle trail (🔥 / ⚡ / ✨ / 💫).
- **Ultra piece ✦** — optional "Ultra Arena" mode swaps knights for pieces that leap **exactly 2 squares** in any of 8 directions, jumping over anything.
- **Fake-Out 🎭** — arm a piece as bait; if an enemy ends its move adjacent to it next turn, a counter-blast vaporizes it.

## Development

```bash
node perft.test.js   # validate the chess engine (perft depth 1–4)
node smoke.mjs       # drive the real page in headless Chrome (CDP smoke test)
```

`smoke.mjs` requires Google Chrome installed; it drives the live UI over the DevTools Protocol with no extra dependencies.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The entire game — markup, styles, engine, and UI |
| `perft.test.js` | Chess engine correctness test |
| `smoke.mjs` | Headless-browser end-to-end smoke test |
