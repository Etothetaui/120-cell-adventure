# 120-cell-adventure

**120-cell-adventure** is a browser-based platform adventure built on the graph structure of the 120-cell. The game contains 600 interconnected vertex mazes, with each maze connected to neighboring mazes through exits that follow the 4-regular graph of the 120-cell.

## Play

Extract the project folder, then open `index.html` in a modern browser. No build step, local server, or server-side code is required.

The same files can also be published with GitHub Pages. For GitHub Pages, keep `index.html` at the root of the selected publishing source along with the other project files.

## Features

- 600 deterministic vertex mazes connected by the 120-cell graph
- Spur-conserving live-contact maze generation: randomized DFS with structural live loops and preserved dead ends
- Platformer movement with gravity, left/right motion, jump, and one airborne double jump
- Pentagon player body with rotation and side-settling behavior
- Centered exits on every maze side
- Room orientation that places the entry door at the bottom of the current room
- Temporarily closed bottom entry exit until the player leaves the entry square
- Partial border-maze visibility around the current maze
- Quick animated room transitions with input locked during the transition
- One circular discovery marker in every maze
- Marker-based discovery and win condition: discover all 600 markers to win
- One equilateral-triangle enemy spawned for every maze, with global one-square-per-second random-walk movement
- Enemy travel through maze exits
- Enemy color is the RGB inverse of the background/floor color of its birth maze
- Death and respawn at the last touched marker, or the original start position if no marker has been touched
- Manual kill/respawn button and `K` keyboard shortcut for returning to the last checkpoint
- 7,200 gold collectibles distributed randomly throughout the 600 mazes
- Gold storage capacity based on discovered marker count
- Defend action powered by stored gold
- Inset and full-screen 120-cell graph visualizers
- Interactive map controls:
  - pause/resume rotation
  - drag to rotate
  - shift-drag, right-click drag, or two-finger drag to pan
  - mouse wheel, trackpad scroll, or pinch to zoom
  - reset map view
- Map filters for all, discovered-only, and undiscovered-only mazes
- Current-cell focus modes, including a 2D projection mode whose displayed nodes and edges are mapped to the actual local 120-cell topology
- Pause overlay that dims the maze and displays PAUSED
- Mobile touch controls placed below the maze viewport so they do not cover gameplay
- Local browser save support
- Save export and import with checksum validation
- Seeded new games

## Controls

| Action | Keyboard / Mouse / Touch |
|---|---|
| Move left/right | `A` / `D`, left/right arrows, or the mobile thumbstick below the maze |
| Jump | `W`, `Space`, `Z`, or the mobile Jump button below the maze |
| Double jump | Press jump once while airborne |
| Defend | `X`, click inside the maze area, or the mobile Defend button below the maze |
| Kill/respawn player | `K` or Kill player button |
| Pause game | `Esc` or Pause game button |
| Full map | `M` or Full map button |
| Map filter | `V` or map filter button: all / discovered / undiscovered |
| Current cell focus | `C` or focus button: off / 4D cell / 2D cell |
| Pause/resume map rotation | Pause/resume button on the map |
| Rotate map | Left-click drag or one-finger drag |
| Pan map | Shift-drag, right-click drag, or two-finger drag |
| Zoom map | Mouse wheel, trackpad scroll, or pinch |
| Close full map | Close button |

## Discovery, gold, and defend

A maze is discovered only after the player touches that maze's circular marker. The marker glows after being touched.

Gold capacity is calculated as:

```text
round(discovered maze count / 50)
```

Touching gold removes it from the maze. If storage has room, the gold is added to storage. If storage is full, the gold is still removed but is not added.

Defend spends all stored gold. If no gold is stored, defend does nothing. The defend area is a temporary transparent pentagon centered on the player with radius `stored gold / 3` maze squares. Enemies inside it are removed for 5 seconds, then respawn in the maze farthest from their birth maze. When an enemy respawns, 3 gold are added randomly to the respawn maze or one of its bordering mazes.


## Maze generation

Each 15×15 room maze is generated with a **spur-conserving live-contact backtracker**. It starts from the center cell like a randomized depth-first search / recursive backtracker, but when the active DFS tip gets stuck at a true dead end, the generator may open one extra contact wall to create a loop.

A contact is accepted only when the created cycle is large enough relative to the terminal spur being sacrificed:

```text
cycle length >= grid size
cycle length >= spur length^φ
φ = (1 + sqrt(5)) / 2
```

This keeps the long organic corridors and some meaningful dead ends from recursive backtracking, while adding structural loops during generation instead of using a post-generation braid pass or fixed loop probability.

## Saves and seeds

Progress is saved locally in the browser. You can also export your save as an encoded text string and import it on another device.

A new save system is used for this game and is not intended to be compatible with older saves from the previous project.

The maze set, markers, starting gold, and starting enemies are generated from a numeric seed. Starting a new game with the same seed recreates the same initial world.

## Version

Current version: **0.1.0-dev**

## Development

This project is distributed as a static multi-file web app. The files can be opened locally in a browser or served as a static site.

```text
index.html        App shell and HUD markup
styles.css        Layout, HUD, mobile controls, and visual styling
data.js           120-cell data and extracted 2D projection layout
game.js           Main gameplay, rendering, physics, enemies, gold, and input
map-renderer.js   120-cell map and focus visualizers
save.js           Local save, export, import, and save validation
```

To modify it, edit the files directly and open `index.html` in a browser to test. The game can also be bundled into one self-contained HTML file later if desired.

## License

Copyright (c) 2026 Etothetaui.

This project is licensed under the GNU General Public License version 2 (GPLv2). See [`LICENSE`](LICENSE) for details.

In practical terms, people may use, share, modify, and distribute the game, including commercially, but distributed modified versions must also provide source code under the GPLv2 terms.
