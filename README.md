# Port Azura: Heat

[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ditkan/gta6-v3/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/ditkan/gta6-v3/reward.svg)](https://make.fun/c/gta6-01)

**Port Azura: Heat** is a complete open-world crime game for the desktop browser,
built for the [make.fun "Make GTA 6" bounty](https://make.fun/c/gta6-01). It is an
original game — its own sun-soaked port city, characters, vehicles, names and story —
written in vanilla JavaScript and HTML5 canvas. No build step, no libraries, no
network: serve the `game/` folder with any static file server and play.

You are Nico Ferreira, a dock runner fresh off the boat in Port Azura. Fixer Marisol
Vega has work for you: six jobs that climb from a $750 package run to a $5,000 score
at the harbor, with the Azura Police Department paying closer attention every time.
Between jobs the city is yours — steal cars, run courier fares, hunt the ten hidden
briefcases, and try to keep your wanted level down.

## Play it

```sh
node serve.ts
# then open http://localhost:8080
```

Node 22.18 or later runs `serve.ts` as-is; any other static server pointed at
`game/` works too.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrow keys | Walk, or drive |
| Shift | Run on foot |
| Space | Handbrake in a car |
| F or E | Enter / exit a car, use a point of interest |
| Mouse | Aim |
| Left mouse button | Fire the pistol (or swing a fist up close) |
| R | Reload |
| Enter | Start a mission or job at its marker, confirm dialogue |
| P or Esc | Pause |
| M | Mute |

## What is in the city

- **Port Azura itself** — a road grid of six named districts (North Heights, Casino
  Row, The Marina, Industrial Yards, Old Market and Harbor Point) with more than a
  hundred collidable buildings, sidewalks, lane-marked streets and a day/night cycle.
- **Ten points of interest** — Rosa's Safehouse, the Harbor Garage (repairs), Azura
  Arms (pistol, ammo and armour), St. Marina Hospital (healing), the Port Azura
  Casino, the Docks Warehouse, Azura Police HQ, Palm Pawn, a Fuel & Go station and
  the Lookout.
- **Driving** — steal parked or moving cars, each with acceleration, braking,
  steering, a handbrake and a damage model; traffic cars drive the road network and
  pedestrians wander, chat and flee from gunfire and reckless driving.
- **Wanted system** — one to five stars. Police cruisers spawn, chase, ram and bust
  you; break their line of sight and the heat decays star by star.
- **A six-job story** from Marisol Vega with dialogue, map markers, timers and
  payouts from $750 to $5,000, plus endlessly repeatable courier jobs and ten
  hidden briefcases worth $250 each.
- **Combat** — fists and a pistol with ammo, reloads, muzzle flash and hit
  reactions; health and armour for the player.
- **A full HUD** — health and armour bars, cash, wanted stars, weapon and ammo, a
  mission banner, and a live minimap showing streets, your position, the mission
  marker and the police.
- **Sound, synthesised live** — engine hum that follows your speed, gunshots,
  pickups, a two-tone siren when the police close in, and a small bass-and-arp
  music loop. No audio files.
- **Saving** — cash, story progress, found briefcases and your position persist in
  `localStorage`; the start screen offers Continue when a save exists.

## Repository layout

- `game/` — the playable game: `index.html`, `style.css` and `src/` (one file per
  system: `city.js` the world, `vehicles.js`, `peds.js`, `police.js`, `combat.js`,
  `missions.js`, `hud.js`, `audio.js`, `save.js`, `util.js`, `main.js` the loop).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to the output
  directory and writes `dossier.json` with `vendor/makefun-game.ts`.
- `serve.ts` — the local development server above.
- `screenshots/` — screenshots of the game itself; the first by name is the cover.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`.
