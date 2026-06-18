// resources/message_log.js
//
// I-10a — the gameplay message channel's data layer (source's CON_printf analog,
// seg_0A33.c). Holds the scrollback as a capped ring of { text, cls } lines.
//
// Deliberately layout-agnostic: it knows nothing about where (or whether) the
// channel is shown. view/message_channel.js renders it into whatever DOM element
// it's handed, so the fixed shell — or a future dock window — can move or redock
// the channel without touching this. That content/placement seam is what makes
// the UI-shell model swappable (see CLAUDE.md / progress.md §"I-10 scope").
//
// `revision` bumps on every mutation so the renderer flushes only on change.

const MAX_LINES = 200;

export class MessageLog {
  constructor(max = MAX_LINES) {
    this.lines = [];      // [{ text, cls }] — newest last, capped at `max`
    this.max = max;
    this.revision = 0;    // bumped on every push/clear; the renderer diffs against it
  }

  // Append one line. `cls` selects a palette class for styling (e.g. 'miss' for
  // refusals like "Out of range!"; '' = the default result style). Mirrors the
  // (text, cls) shape of main.js's boot-time log() helper.
  push(text, cls = '') {
    this.lines.push({ text: String(text), cls });
    if (this.lines.length > this.max) this.lines.shift();
    this.revision++;
    return text;
  }

  clear() {
    this.lines.length = 0;
    this.revision++;
  }
}
