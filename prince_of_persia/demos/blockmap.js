// blockmap.js — the static level-1 collision block map. A thin caller over the shared
// renderer (blockmap_render.js), which the interactive level_viewer also uses. Renders
// the committed level1.js; the viewer decodes a dropped LEVELS.DAT into the same shape.
import { LEVEL1 } from '../res/level1.js';
import { renderLevel } from './blockmap_render.js';

document.getElementById('info').textContent =
  renderLevel(document.getElementById('map'), LEVEL1);
