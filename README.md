# Isoboard

An isometric sketchbook for systems and ideas. Drag colourful blocks onto a grid, connect them,
and export a crisp picture. Everything is SVG, with no WebGL, and your work is saved in your browser.

## What you can draw

- **Architecture**: users, client devices, mobile apps, services, load balancers, functions,
  AI models, API gateways, CDNs, firewalls, auth, databases, caches, queues, storage buckets,
  analytics, email / notifications and external services.
- **Flows**: start and end, conditions, process steps, inputs and outputs, timers and events,
  with `true` / `false` branches and validation.
- **State machines**: initial, final, composite and terminate states, plus choice, junction,
  fork / join, history (shallow or deep) and entry / exit points. You can also add guards,
  actions, inputs and outputs. Transitions carry event, guard and action fields (shown in the
  inspector rather than as labels). A guarded transition gets a small diamond marker, and the
  validation panel catches common mistakes.
- **Shapes and notes**: generic box, pyramid, sphere and cone, sticky notes and zones.

## Using it

| Action | How |
| --- | --- |
| Add a block | Drag it from the palette, or click it |
| Connect | Use the connect tool, or drag from a block's handle to another block |
| Pan / zoom | Space + drag, or middle mouse; mouse wheel; fit-to-screen button |
| Undo / redo | Ctrl/⌘ Z · Ctrl/⌘ Shift Z |
| Duplicate · copy · paste | Ctrl/⌘ D · C · V |
| Nudge · delete · deselect | Arrow keys · Delete · Esc |
| Rename | Double-click a block |
| Show / hide components | `[` |
| Focus mode (canvas only) | `F` |
| Quick search | Ctrl/⌘ K |
| Play / pause flow animation | Tap Space |

**Export** gives you exactly what is on the canvas, in the same view and theme:

- **PNG (3×)**: a high-resolution image.
- **SVG**: a standalone vector file with its colours and font embedded. It opens the same in
  any viewer.
- **JSON**: a diagram file you can import again later.

Projects are autosaved to this browser's local storage. Open **My projects** to create,
rename, duplicate or delete them.