# Isoboard

An isometric sketchbook for systems and ideas. Drag colourful blocks onto a grid, connect them,
and export a crisp picture. Everything is SVG, with no WebGL, and your work is saved in your browser.

## What you can draw

- **Architecture**: users, client devices, mobile apps, services, load balancers, functions,
  AI models, API gateways, CDNs, firewalls, auth, databases, caches, queues, storage buckets,
  analytics, email / notifications and external services.
- **Tech stack**: Spring Boot, PostgreSQL, Oracle, MySQL, MongoDB, Redis, Kafka, RabbitMQ,
  Elasticsearch, Kubernetes, Docker and Nginx.
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
| Step numbers on / off | Numbered-list button in the canvas toolbar (reorder in the inspector) |
| Re-route a connector | Drag any part of it sideways (grips show when selected); double-click to reset |
| Present | **Present** button or `P` |
| Show / hide components | `[` |
| Focus mode (canvas only) | `F` |
| Quick search | Ctrl/⌘ K |
| Play / pause flow animation | Tap Space |

Connectors start plain (no label). Each one gets its own lane when it shares a line with
others, and arrowheads are always drawn on top, so they never hide behind a block.

## Presenting

**Present** (or `P`) goes full screen and walks through the connectors in step order: an
overview with the title, then one connector per step (it draws itself, its two blocks light up,
the rest dims and the camera follows), then the full picture. Add a **presenter note** to a
connector in the inspector to show it in the caption.

| Key | Action |
| --- | --- |
| → · Space · click | Next step |
| ← · right-click | Previous step |
| Home · End | Overview · full picture |
| `L` | Laser pointer |
| `D` | Disappearing ink (fades after a moment); `C` clears it |
| `F` | Camera follows each step on / off |
| Esc | Leave the presentation |

The controls hide themselves when the mouse rests.

**Export** gives you exactly what is on the canvas, in the same view:

- **PNG (3×)**: a high-resolution image.
- **SVG**: a standalone vector file with its colours and font embedded. It opens the same in
  any viewer.
- **JSON**: a diagram file you can import again later.

Projects are autosaved to this browser's local storage. Open **My projects** to create,
rename, duplicate or delete them.