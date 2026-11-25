# Isoboard

An isometric sketchbook for systems and ideas. Drag colourful blocks onto a grid, connect them,
and export a crisp picture. Everything is SVG, with no WebGL, and your work is saved in your browser.

## What you can draw

- **People**: user, man, woman, boy, girl, kid, elder, developer and a group, each with their
  own look (hair, clothes, glasses, headset) in the block's colour.
- **Architecture**: client devices, mobile apps, services, load balancers, functions,
  AI models, API gateways, CDNs, firewalls, auth, databases, caches, queues, storage buckets,
  analytics, email / notifications and external services.
- **Tech stack**: Spring Boot, PostgreSQL, Oracle, MySQL, MongoDB, Redis, Kafka, RabbitMQ,
  Elasticsearch, Kubernetes, Docker and Nginx.
- **Files**: generic file, PDF, CSV, JSON, XML, spreadsheet, Word document, archive, image,
  video, text, YAML and log files. Each is a single upright sheet with its type written big in
  its own colour. Their stickers also work as connector labels.
- **Flows**: start and end, red failure ends (KO, error, exception), conditions (a diamond
  sign with a question mark), process steps, inputs and outputs, timers and events, with
  `true` / `false` branches (green and red tags) and validation. A condition's branches share
  one step number.
- **State machines**: initial, final, composite and terminate states, plus choice, junction,
  fork / join, history (shallow or deep) and entry / exit points. You can also add guards,
  actions, inputs and outputs. Transitions carry event, guard and action fields (shown in the
  inspector rather than as labels). A guarded transition gets a small diamond marker, and the
  validation panel catches common mistakes.
- **Orthogonal states and events**: an orthogonal state runs two or more regions in parallel
  (connect it to each region; those links are dotted). A child sends an event to another region
  with a send event, and a receive event waits for it: the link between them is a dashed
  `signal` connector with a bolt sticker. Submachine states run another machine. Validation
  checks that an orthogonal state has 2+ regions, every send signals something and every
  receive gets its event.
- **Shapes and notes**: generic box, pyramid, sphere and cone, sticky notes and zones.

## Using it

| Action                         | How                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Add a block                    | Drag it from the palette, or click it                                                                    |
| Connect                        | Use the connect tool, or drag from a block's handle to another block                                     |
| Pan / zoom                     | Two-finger scroll (trackpad, Magic Mouse), Space + drag or middle mouse; mouse wheel or pinch to zoom    |
| Undo / redo                    | Ctrl/⌘ Z · Ctrl/⌘ Shift Z                                                                                |
| Duplicate · copy · paste       | Ctrl/⌘ D · C · V                                                                                         |
| Nudge · delete · deselect      | Arrow keys · Delete · Esc                                                                                |
| Rename                         | Double-click a block                                                                                     |
| Add a note                     | `N` or the note button (tied to the selected block), or double-click empty board                         |
| Edit · move · resize a note    | Double-click it · drag it · drag any corner or edge; Ctrl Enter saves                                    |
| Point a note anywhere          | Drag the dot at the end of its line (or its round handle) onto any spot on a block or the board          |
| Hand-drawn / clean lines       | Pen button in the canvas toolbar, or **Lines** in a connector's inspector                                |
| Step numbers on / off          | Numbered-list button in the canvas toolbar (reorder in the inspector)                                    |
| Re-route a connector           | Drag any part of it sideways (grips show when selected); double-click to reset                           |
| Attach a connector anywhere    | Select it, drag the dot at either end onto any spot on a block (or another block); double-click frees it |
| Label a connector with an item | Select it, pick one under **Label item** (shows that item's sticker)                                     |
| Present                        | **Present** button or `P`                                                                                |
| Show / hide components         | `[`                                                                                                      |
| Focus mode (canvas only)       | `F`                                                                                                      |
| Browser full screen            | Full-screen button in the top bar, or `Shift F`                                                          |
| Quick search                   | Ctrl/⌘ K                                                                                                 |
| Play / pause flow animation    | Tap Space                                                                                                |

Connectors start plain (no label) and find their own way: they route around blocks and their
names, keep off each other's tracks, leave and enter blocks straight, and arrive at a block's
front when they can. They re-route live as you move blocks. Where lines still share a track,
each gets its own lane, ordered so they peel off without crossing. Arrowheads are always drawn
on top, so they never hide behind a block. A connector ends exactly where it meets a block's
outline, and you can pin either end to any spot on any side of a block: the route then leaves
or arrives through that side. A connector you re-route by hand keeps its path, and the others
route around it.

## Presenting

**Present** (or `P`) goes full screen and walks through the connectors in step order: an
overview with the title, then one connector per step (it draws itself, its two blocks light up,
the rest dims and the camera follows), then the full picture. A condition's branches come on
stage together as one step, and the caption lists each branch. A step into an end is
flagged in the caption: **End** in green, or **KO** / **Error** / **Exception** in red. Add a **presenter note** to a
connector in the inspector to show it in the caption.

| Key               | Action                                                 |
| ----------------- | ------------------------------------------------------ |
| → · Space · click | Next step                                              |
| ← · right-click   | Previous step                                          |
| Home · End        | Overview · full picture                                |
| `L`               | Laser pointer                                          |
| `D`               | Disappearing ink (fades after a moment); `C` clears it |
| `F`               | Camera follows each step on / off                      |
| Esc               | Leave the presentation                                 |

The controls hide themselves when the mouse rests.

## Files and export

**File → Save to device** (Ctrl/⌘ S) writes an editable `.isoboard` file. In Chrome and Edge
later saves go straight back to the same file; elsewhere the file is downloaded.
**Save as…** (Ctrl/⌘ Shift S) picks a new file, and **Open…** (Ctrl/⌘ O) or dropping a
`.isoboard` / `.json` file on the canvas opens it.

**Export** (Ctrl/⌘ E) renders exactly what you see, in these formats:

| Format          | Notes                                             |
| --------------- | ------------------------------------------------- |
| PNG             | 1×, 2×, 3× or 4×; optional transparent background |
| JPG             | 1×–4×, small files for chats and email            |
| WebP            | 1×–4×, small and sharp, optional transparency     |
| SVG             | Vector, with colours and font embedded            |
| PDF             | One page, sized to the diagram                    |
| ISOBOARD / JSON | Editable diagram data                             |

Choose **Current view** or **Whole diagram** (everything, at 100% zoom), and **Copy** puts a
PNG on the clipboard.

Projects are autosaved to this browser's local storage. Open **My projects** to create,
rename, duplicate or delete them.
