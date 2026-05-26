# 120-cell-adventure

**120-cell-adventure** is a browser-based platform adventure built on the graph structure of the 120-cell. The game contains 600 interconnected vertex mazes, with each maze connected to neighboring mazes through exits that follow the 4-regular graph of the 120-cell.

Current version: **0.1.0-dev**

## Play

Open `index.html` in a modern browser, or publish the repository with GitHub Pages using `index.html` at the root of the publishing source.

The project is written as a small static web app. No server-side code is required.

## Features

- 600 deterministic vertex mazes connected by the 120-cell graph
- Phi-Spur Live Contact Backtracker maze generation with seeded DFS and live loop creation
- Platformer movement with gravity, left/right motion, a 2.62-square jump, and one airborne double jump
- Pentagon player body with rotation and side-settling behavior
- Centered exits on every maze side
- Room orientation that places the entry door at the bottom of the current room
- Temporarily closed bottom entry exit until the player leaves the entry square
- Partial border-maze visibility around the current maze, clipped by a circular viewport expanded by `(√2 / 4)` of one grid square
- Quick animated room transitions with input locked during the transition
- One circular discovery marker in every maze
- Marker-based discovery and win condition: discover all 600 markers to win
- One triangular enemy spawned for every maze, with global one-square-per-second random-walk movement and fixed inverse birth-maze color
- Enemy travel through maze exits
- Death and respawn at the last touched marker, or the original start position if no marker has been touched
- 7,200 gold collectibles distributed randomly throughout the 600 mazes
- Gold storage capacity based on discovered marker count
- Defend action powered by stored gold, hidden until storage capacity exists and greyed out when no gold is stored
- Inset and full-screen 120-cell graph visualizers
- Map filters for all, discovered-only, and undiscovered-only mazes
- Current-cell focus modes, including a topology-correct 2D projection mode whose displayed nodes and edges map to the actual local 120-cell graph
- Local browser save support
- Save export and import
- Seeded new games
- Game pause overlay and manual Kill player respawn control

## Controls

| Action | Keyboard / Mouse / Touch |
|---|---|
| Move left/right | `A` / `D`, left/right arrows, or mobile thumbstick |
| Jump | `W`, `Space`, `Z`, or mobile Jump button |
| Double jump | Press jump once while airborne |
| Defend | `X`, click inside the maze area, or mobile Defend button when gold storage is unlocked |
| Kill/respawn | `K` or Kill player button |
| Pause/resume game | `Esc` or Pause game button |
| Full map | `M` or Full map button |
| Map filter | `V` or map filter button: all / discovered / undiscovered |
| Current cell focus | `C` or focus button: off / 4D cell / 2D cell |
| Pause/resume map rotation | Pause/resume button on the map |
| Rotate map | Left-click drag or one-finger drag |
| Pan map | Shift-drag, right-click drag, or two-finger drag |
| Zoom map | Mouse wheel, trackpad scroll, or pinch |
| Close full map | `Esc` or Close button |

## Discovery, gold, and defend

A maze is discovered only after the player touches that maze's circular marker. The marker glows after being touched.

Gold capacity is calculated as:

```text
round(discovered maze count / 50)
```

Touching gold removes it from the maze. If storage has room, the gold is added to storage. If storage is full, the gold is still removed but is not added.

The Defend button is hidden while gold capacity is `0`. Once capacity is greater than `0`, the button is visible; it is greyed out while stored gold is `0`. Defend spends all stored gold. If no gold is stored, defend does nothing. The defend area is a temporary transparent pentagon centered on the player with radius `stored gold / 3` maze squares. Enemies inside it are removed for 5 seconds, then respawn in the maze farthest from their birth maze. When an enemy respawns, 3 gold are added randomly to the respawn maze or one of its bordering mazes.

## Maze generation

Each 15×15 room is generated with a Phi-Spur Live Contact Backtracker. The generator starts as a seeded depth-first recursive backtracker. When the active DFS path reaches a dead end, it checks closed-wall contacts to already-carved cells. A contact opens only when the loop it would create is large enough compared with the spur being removed:

```text
cycle length >= ceil(spur length ^ phi)
phi = (1 + sqrt(5)) / 2
```

When multiple contacts qualify, the implementation chooses the valid contact with the largest cycle length and opens at most one contact for that dead-end event. This creates deterministic looped mazes without a loop probability and without a post-generation braid pass.

## Saves and seeds

Progress is saved locally in the browser. You can also export your save as an encoded text string and import it on another device.

A new save system is used for this game and is not intended to be compatible with older saves from the previous project.

The maze set, markers, starting gold, and starting enemies are generated from a numeric seed. Starting a new game with the same seed recreates the same initial world.

## Project structure

```text
index.html        App shell and HUD markup
styles.css        Layout, HUD, mobile controls, and visual styling
data.js           120-cell data and extracted 2D projection layout
game.js           Main gameplay, rendering, physics, enemies, gold, and input
map-renderer.js   120-cell map and focus visualizers
save.js           Local save, export, import, and save validation
```

The game can be developed as these static files and can also be bundled into one self-contained HTML file later if desired.

## License

Copyright (c) 2026 Etothetaui.

This project is licensed under the GNU General Public License version 2 (GPLv2). See [`LICENSE`](LICENSE) for details.

In practical terms, people may use, share, modify, and distribute the game, including commercially, but distributed modified versions must also provide source code under the GPLv2 terms.
