# A Personal Apocalypse — roguelike built from OpenStreetMap

A turn-based zombie survival roguelike that runs in a browser with no server.
Type a town or neighbourhood; the game downloads the real buildings, roads, land use
and shops from OpenStreetMap once, stores them in the browser, and plays offline after that.

## Play it now

https://jordanlong121.github.io/a-personal-apocalypse/ — nothing to install. The page is the game.

## Run it locally

Double-click `index.html`. That is all. Downloads of new places need internet; the
bundled Carleton Place sample works with none.

If your browser blocks storage on `file://`, serve the folder instead:

```
cd ~/zombie-rogue && python3 -m http.server 8000
```

then open http://localhost:8000/.

## Play

A new game starts with a class pick: Soldier, Police Officer, Doctor, Engineer, Firefighter, Hunter or Chef.
Each has a starting kit and a perk (see `CLASSES` in `js/game.js`). Then you choose a look: fourteen presets across
skin tones, hair, beards and headwear, or mix your own; the outfit follows the class (see `Sprites.avatar`).
All on-screen text is written flat and spare, after Cormac McCarthy's The Road.

- Arrows or numpad move (numpad corners for diagonals). Walk into a zombie to attack it.
- Walk into a fridge, shelf, locker or car to search it. `g` searches whatever is beside you. `u` then a letter uses an item (eat, drink, heal, wield).
- `F` then a direction fires a wielded ranged weapon (bow 8, shotgun 6, pistol 10, rifle 16 tiles). Guns are loud.
- Doors start closed: walk into one to open it, `c` + direction closes it. Alert zombies pound on closed doors for many turns before they break through.
- Windows: walk into one to smash it and climb through. Hordes roam in occasionally and will batter down doors, windows and eventually walls.
- `d` + letter drops. `.` waits. `m` overview map. `S` saves. `Esc` quits to the title (autosaves).
- Food and water drain over time. Below a quarter of your health you stagger: 25% of steps go astray at a quarter, 90% at a tenth. At night zombies notice you from less far away.
- Permadeath: dying erases the save for that place.

## How a place becomes a world

1. Nominatim geocodes the name; the game takes a 2, 3 or 5 km box around it.
2. Overpass returns buildings, roads, land use, water and shop/amenity points.
3. `js/osm.js` compacts that into a flat feature list in metre tiles and classifies every
   building into a loot class (home, food, medical, tools, weapons, fuel, office).
4. `js/world.js` rasterizes 64×64-tile chunks on demand: ground from land use, roads by
   class width, building walls from footprints, interiors from a seeded BSP, containers by
   loot class. Beyond the data edge the world continues as noise-generated wilderness.
5. `js/game.js` runs the turn loop: FOV, hunger/thirst, zombies, loot, saves.

Saves store only the seed plus what changed, so they are a few kilobytes.

## How it looks

- The ground is drawn straight from the OSM geometry: smooth roads with sidewalks, centre lines and street names, paths, rail,
  rivers, lots and lawns, over a subtle noise texture. Tiles underneath still decide where you can walk.
- Buildings show roofs (pitched with a ridge and shingles, flat with HVAC units, charred when burnt) until you step
  inside; then the roof lifts off and you see the interior: hardwood, tile, concrete or carpet by building type,
  partition walls, and a shadowed outer wall, all clipped to the real footprint. Churches get a steeple, hospitals an H, civic buildings
  a flag, arenas a ribbed roof; landmarks and large buildings carry their real names.
- Streets are furnished: parked cars and highway traffic jams with burnt-out wrecks (walk into a car to search it),
  bins by the doors, lamps, hydrants, carts on parking lots, plus any trees, benches, bus stops and post boxes
  that OSM maps.
- The clock is your real local clock, with sunrise and sunset computed for the town's latitude, and the HUD names the
  phase: dawn, morning, midday, afternoon, evening, dusk, night. When online the weather is the town's real weather
  from Open-Meteo, refreshed every ten minutes (temperature shown in the HUD). Offline, weather changes every few hours: clear, overcast, rain, fog (zombies notice you later) and snow, which settles
  on the ground and roofs. Light shifts through dawn, day, dusk and night. A few buildings burn with drifting smoke.
- Everything beyond your sight is drawn slightly dimmed with a soft edge and shows no loot or zombies.

## Files

- `index.html` — page and styles
- `js/osm.js` — geocode, Overpass fetch, compaction (also used by the bundle tool)
- `js/store.js` — IndexedDB for places, localStorage for saves
- `js/world.js` — chunk generation and building interiors
- `js/game.js` — rules, items, zombies, save/load
- `js/sprites.js` — embedded 12×12 pixel-art sprites (people, containers, doors, trees)
- `js/render.js` — canvas view, overview map, sidebar
- `js/main.js` — title screen and input
- `data/bundled.js` — Carleton Place sample (regenerate with `node tools/bundle.js <overpass.json> "<name>" s w n e`; the query comes from `OSM.overpassQuery`)

## License

Source-available, all rights reserved: you may read the code and play the game for personal use, nothing more
without written permission. See `LICENSE`. Map data © OpenStreetMap contributors, ODbL.
