# Harbor Heat — Solmar Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/akungamesatu6-crypto/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/akungamesatu6-crypto/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game set in **Solmar Bay**, a sun-soaked harbor
city. You are a rookie getaway driver for the Harbor Crew: steal cars, outrun
the police, and run five story jobs from the market to the pier — all in a
desktop browser, offline, from static files. No network requests, no audio or
image files: the city is procedural, the sound is synthesized live, and the
world is seeded so every run can be replayed.

## How to play

- **On foot:** walk the avenues, find a car, and get in. Punch anyone who
  gets in your way; Space or click to shoot when the heat is on.
- **Driving:** steal any parked or traffic car (the owner will notice — and so
  will the police). Speed builds your wanted level; lose the patrol cars and
  it fades.
- **Missions:** follow the yellow diamond on the minimap. Pick up the package,
  deliver it, and get paid. Five jobs, one story:
  1. **First Pickup** — market to garage, $150
  2. **Harbor Delivery** — garage to the pier in 90 seconds, $250
  3. **Hot Wheels** — steal a sport car for the crew, $400
  4. **Heat Run** — deliver to the safehouse with the police on you, $600
  5. **The Big Score** — across town in 120 seconds, $1,000
- **Busted:** get caught on foot and the run ends — your cash and finished
  jobs are saved, so pick up where you left off.
- **Save:** progress (cash, jobs done, best stats) saves automatically to your
  browser.

## Controls

| Key | Action |
| --- | --- |
| W / A / S / D | Walk / drive (steer while driving) |
| Shift | Sprint on foot / boost in a car |
| F | Get in / out of a car |
| E | Punch |
| Space or mouse click | Shoot (Space also starts the game) |
| P or Esc | Pause |

## Run it

```sh
# Play locally (serves game/ on http://localhost:8080)
node serve.ts

# Build the entry bundle (game/ + screenshots/ + dossier.json into out/)
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Needs Node.js 22 or later and a desktop browser. `?seed=N` fixes the world
layout; `?shot=start|play|chase|mission&seed=1` stages a screenshot scene.

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01?ref=w6dq43eh&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
