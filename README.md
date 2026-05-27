# 120-cell-adventure

**120-cell-adventure** is a browser-based platform adventure built on the graph structure of the 120-cell. The game contains 600 interconnected vertex mazes, with each maze connected to neighboring mazes through exits that follow the 4-regular graph of the 120-cell.

Current version: **0.2.1-dev**

## Play

Open `index.html` in a modern browser, or publish the repository with GitHub Pages using `index.html` at the root of the publishing source.

The project is written as a small static web app. No server-side code is required.

## Features

- 600 deterministic vertex mazes connected by the 120-cell graph
- Phi-Spur Live Contact Backtracker maze generation with seeded DFS and live loop creation
- Platformer movement with gravity, left/right motion, variable-height jumps up to 2.62 squares, one airborne double jump, and anti-tunneling collision guards
- Pentagon player body with rotation and side-settling behavior
- Centered exits on every maze side
- Room orientation that places the entry door at the bottom of the current room
- Temporarily closed bottom entry exit until the player leaves the entry square
- Partial border-maze visibility around the current maze, clipped by a circular viewport expanded by `(√2 / 4)` of one grid square
- Quick animated room transitions with input locked during the transition
- One circular discovery marker in every maze
- Marker-based discovery and win condition: discover all 600 markers to win
- One triangular enemy spawned for every maze, with global one-square-per-second movement and fixed inverse birth-maze color
- Enemy movement alternates probabilistically between the original random movement and targeted pursuit based on discovered-maze percentage
- Targeted enemy movement uses shortest maze distance toward the player in the same maze, or toward the best shortest-route exit when outside the player's maze
- Enemy travel through maze exits
- Death and respawn at the last touched marker, or the original start position if no marker has been touched, with 5 seconds of invulnerability and a 1-second stationary defense bubble at the respawn point
- 7,200 energy collectibles distributed randomly throughout the 600 mazes
- Energy storage capacity based on discovered marker count, calculated as `round(discovered maze count / 10)`
- Defend action powered by stored energy, hidden until storage capacity exists and greyed out when no energy is stored
- Inset and full-screen 120-cell graph visualizers; opening the full-screen map temporarily pauses the game unless it was already manually paused
- Map filters for all, discovered-only, and undiscovered-only mazes
- Current-cell focus modes, defaulting to the topology-correct 2D projection mode whose displayed nodes and edges map to the actual local 120-cell graph
- Local browser save support
- Save export and import
- Seeded new games
- Game pause overlay, active-play timer, paused gameplay-input discard, and manual Kill player respawn control

## Controls

| Action | Keyboard / Mouse / Touch |
|---|---|
| Move left/right | `A` / `D`, left/right arrows, mobile thumbstick, mobile left/right buttons, or mobile tilt controls |
| Jump | `W`, `Space`, `Z`, or mobile Jump button; tap for a short hop, hold for full height |
| Double jump | Press jump once while airborne; early release also shortens the double jump |
| Defend | `X`, `L`, or mobile Defend button when energy storage is unlocked |
| Kill/respawn | `K` or Kill player button |
| Pause/resume game | `Esc` or Pause game button |
| Full map | `M` or Full map button; opening it auto-pauses only when the map caused the pause |
| Map filter | `V` or map filter button: all / discovered / undiscovered |
| Current cell focus | `C` or focus button: off / 4D cell / 2D cell |
| Pause/resume map rotation | Pause/resume button on the map |
| Rotate map | Left-click drag or one-finger drag |
| Pan map | Shift-drag, right-click drag, or two-finger drag |
| Zoom map | Mouse wheel, trackpad scroll, or pinch |
| Close full map | `Esc` or Close button |

Gameplay inputs made while the game is paused are discarded instead of queued. Pause/resume and map/UI controls remain usable while paused. The timer tracks active unpaused play time only; it does not advance while paused or while the tab is closed/inactive.

## Discovery, energy, and defend

A maze is discovered only after the player touches that maze's circular marker. The marker glows after being touched.

Energy capacity is calculated as:

```text
round(discovered maze count / 10)
```

Touching energy removes it from the maze. If storage has room, the energy is added to storage. If storage is full, the energy is still removed but is not added.

The energy meter is displayed as a permanent overlay at the top-left of the maze view.

The Defend button is hidden while energy capacity is `0`. Once capacity is greater than `0`, the button is visible; it is greyed out while stored energy is `0`. If no energy is stored, defend does nothing. Defend creates a stationary transparent pentagon centered where it was triggered and lasting 1 second. Its radius is `energy spent / 3` maze squares, capped at the shared maximum defense radius of 4 maze squares. Because of that cap, one manual defense spends at most 12 energy and leaves any remaining stored energy intact. Enemies inside the bubble are removed for 5 seconds, then respawn in the maze farthest from their birth maze. When an enemy respawns, 3 energy are added randomly to the respawn maze or one of its bordering mazes.

After death, the player respawns with 5 seconds of invulnerability. The invulnerability flash dims the player to 50% opacity instead of making the player fully invisible. Respawning also creates a 1-second stationary defense bubble centered at the respawn location, using the shared 4-maze-square maximum defense radius.


## Enemy movement

Each enemy still moves once per second. On every enemy movement tick, the game now chooses between two movement types:

```text
targeted move chance = discovered maze count / 600
random move chance   = (600 - discovered maze count) / 600
```

A random move uses the existing wandering behavior, with one correction: after an enemy enters a maze through an exit, random movement avoids immediately returning through the same maze connection when another valid move exists. A targeted move uses shortest maze distance. If the enemy is in the same maze as the player, it moves toward the player's current cell. If the enemy is in a different maze, it uses a precomputed all-pairs 120-cell routing table to identify shortest-route candidate exits toward the player's maze, chooses the candidate exit closest to the enemy by local maze distance, breaks remaining exit ties randomly, and moves toward that exit.

This makes enemy pursuit scale with discovery progress: early in a run enemies mostly wander, while late-game enemies increasingly route toward the player.

## Maze generation

Each 15×15 room is generated with a Phi-Spur Live Contact Backtracker. The generator starts as a seeded depth-first recursive backtracker. When the active DFS path reaches a dead end, it checks closed-wall contacts to already-carved cells. A contact opens only when the loop it would create is large enough compared with the spur being removed:

```text
cycle length >= ceil(spur length ^ phi)
phi = (1 + sqrt(5)) / 2
```

When multiple contacts qualify, the implementation chooses the valid contact with the largest cycle length and opens at most one contact for that dead-end event. This creates deterministic looped mazes without a loop probability and without a post-generation braid pass.

## Saves and seeds

Progress is saved locally in the browser. You can also export your save as an encoded text string and import it on another device. Saves store accumulated active play time rather than wall-clock time.

A new save system is used for this game and is not intended to be compatible with older saves from the previous project.

The maze set, markers, starting energy, and starting enemies are generated from a numeric seed. Starting a new game with the same seed recreates the same initial world. Starting a new game or resetting progress preserves user settings such as map focus, map filter, map view state, and mobile direction-control mode.

## Project structure

```text
index.html        App shell and HUD markup
styles.css        Layout, HUD, mobile controls, and visual styling
data.js           120-cell data and extracted 2D projection layout
game.js           Main gameplay, rendering, physics, enemies, energy, and input
map-renderer.js   120-cell map and focus visualizers
save.js           Local save, export, import, and save validation
```

The game can be developed as these static files and can also be bundled into one self-contained HTML file later if desired.

## License

Copyright (c) 2026 Etothetaui.

This project is licensed under the GNU General Public License version 2 (GPLv2). See [`LICENSE`](LICENSE) for details.

In practical terms, people may use, share, modify, and distribute the game, including commercially, but distributed modified versions must also provide source code under the GPLv2 terms.
