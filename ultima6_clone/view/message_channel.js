// view/message_channel.js
//
// I-10a — renders the MessageLog resource into a DOM element.
//
// Installer pattern, matching installDevHud / installDevProbe: it is *handed* its
// target element and knows nothing about page layout, so the fixed shell (or a
// future dock window) can place the channel anywhere. This is the placement half
// of the content/placement seam — see resources/message_log.js for the data half.
//
// Render-flush idiom (same as installDevHud's stat lines): a render-system
// rebuilds the list only when the log's `revision` changes. Idle cost is one
// integer compare per frame; a full rebuild (<=200 light nodes) happens only when
// a message actually fires, which keeps the channel independent of the world's
// render path — it survives region streaming / camera pans untouched.

import { MessageLog } from '../resources/message_log.js';

export function installMessageChannel(world, { el }) {
  const log = world.getResource(MessageLog);
  let lastRevision = -1;

  world.addRenderSystem(() => {
    if (log.revision === lastRevision) return;
    lastRevision = log.revision;

    // Full rebuild rather than append-and-evict: robust to the ring dropping its
    // oldest line, and trivially cheap at human message rates.
    el.replaceChildren(...log.lines.map(({ text, cls }) => {
      const div = document.createElement('div');
      div.className = cls ? `msg ${cls}` : 'msg';
      div.textContent = text;
      return div;
    }));
    el.scrollTop = el.scrollHeight;   // auto-scroll to the newest line
  });

  // Convenience emitter for callers holding the world (the I-10b dispatcher) and
  // for live preview-eval via window.__U6.message.
  return (text, cls) => log.push(text, cls);
}
