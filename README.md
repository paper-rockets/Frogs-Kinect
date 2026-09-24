# Frogs Kinect: Living Jungle Wall

A calm, interactive tropical diorama for a projector wall. A small island with a pond
floats on pure black. Red-eyed tree frogs and butterflies live on it, and they react
when a visitor comes close.

**Live demo:** https://paper-rockets.github.io/Frogs-Kinect/

## What happens

- **Frogs** sit and cycle through their animations (three idles and the occasional
  hop on the spot). They roam, sometimes leaving the picture and coming back, and they
  hop away when a hand comes near.
- **Big frogs** now and then leap at the viewer and stick belly-first to the "glass",
  or leap onto a wall behind the island and climb it, back toward you.
- **Butterflies** fly head-first around the island and flee from a hand.
- **The pond** ripples under the hand, when frogs land beside it, and from slow drips.
- **Sound:** a real rainforest background and a frog chorus. Single frogs call from
  their side of the screen, the chorus hushes while someone is near, and there are
  drips, splashes and a "plip" when a frog hits the glass.

The background stays pure black, so the projector shows nothing outside the scene.

## Controls

| Input | Action |
|---|---|
| Move the mouse or finger | The "hand": animals react to it |
| Drag | Turn the island / look higher or lower |
| Mouse wheel / pinch | Zoom |
| Double-click | Reset the view |

**Kinect:** send normalised hand positions from your Kinect bridge:

```js
window.jungleWall.setInput({ x: 0.5, y: 0.6 }); // 0..1 across and down the picture
window.jungleWall.clearInput();                 // nobody there
window.jungleWall.frogLeap('glass');            // or 'wall': trigger the frog act now
```

## Run it

- **Online:** open the demo link. It can be installed as an app (it runs full screen
  and works offline after the first visit).
- **Locally:** double-click `start.bat` (needs Node.js), then open http://localhost:8080.
- **Projector / Kinect wall:** double-click `start-kiosk.bat`. It opens Chrome full screen
  with sound allowed from the start (browsers normally wait for a click). Alt+F4 closes it.
- **Options:** add `?quality=low` for weak PCs or `?quality=high` to skip the automatic
  check. The app otherwise drops shadows by itself if the PC runs under about 45 fps.
  `?sound=off` mutes it and `?volume=0.5` turns it down.

Plain HTML, CSS and JavaScript with [three.js](https://threejs.org/), with no build step.

## Credits

The 3D models (frogs, butterflies, coconut island and tropical plants) were downloaded
from [Sketchfab](https://sketchfab.com/) and compressed for the web. They remain the
work of their original authors and are covered by their own licences, which are not
part of this repository's code. The sounds are CC0 recordings from
[Freesound](https://freesound.org); see [audio/CREDITS.md](audio/CREDITS.md).
