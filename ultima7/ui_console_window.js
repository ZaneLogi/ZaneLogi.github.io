import { centerWorldPosition, centerNpc } from "./map_viewer.js";

export function setupConsoleWindow() {
  // Attach window behavior
  new FloatingWindowManager("consoleWindow");

  const displayArea = document.getElementById('displayArea');
  const textInput = document.getElementById('textInput');

  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, m =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m])
    );
  }

  function colorizeAtWords(text) {
    // if output contains "<tag>", assume it's HTML already, don't modify
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return text;
    }
    return text.replace(/@(\w+)/g, '<span style="color:red">$1</span>');
  }

  // === Command Table ===
  const commands = {
    help: (args) => {
      return "Available commands: " + Object.keys(commands).join(", ");
    },
    echo: (args) => {
      return args.join(" ");
    },
    clear: (args) => {
      displayArea.innerHTML = "";
      return "(console cleared)";
    },
    test: (args) => {
      return "This is a test command. Args: " + args.join(", ");
    },
    version: (args) => {
      return "Console v1.0";
    },
    moveto: (args) => {
      if (args.length != 2) throw new Error("Syntax: moveto [x] [y]");
      const x = parseInt(args[0], 10);
      const y = parseInt(args[1], 10);
      centerWorldPosition(x, y);
      return `Move to ${x}, ${y}`;
    },
    npc: (args) => {
      if (args.length != 1) throw new Error("Syntax: npc [number]");
      const npcIndex = parseInt(args[0], 10);
      if (centerNpc(npcIndex)) {
        return `Move to NPC ${npcIndex}`;
      }
      else {
        throw new Error(`failed to move to NPC ${npcIndex}`);
      }
    },
  };

  function runCommand(input) {
    const tokens = input.trim().split(/\s+/);
    const cmd = tokens[0];
    const args = tokens.slice(1);

    if (commands[cmd]) {
      try {
        return commands[cmd](args);
      } catch (err) {
        return `<span style="color:red">Error: ${escapeHTML(err.message)}</span>`;
      }
    } else {
      return `<span style="color:red">Unknown command: ${escapeHTML(cmd)}</span>`;
    }
  }

  function printToConsole(html) {
    displayArea.innerHTML += html + "<br>";
    displayArea.scrollTop = displayArea.scrollHeight;
  }

  // === Command History ===
  const history = [];
  let historyIndex = -1;

  // === Handle Input ===
  textInput.addEventListener('keydown', (event) => {  
    if (event.key === 'Enter') {
      event.preventDefault();
      const raw = textInput.value.trim();
      if (raw) {
        history.push(raw);
        historyIndex = -1;

        const safe = escapeHTML(raw);
        printToConsole(`<span style="color: orange">&gt; ${safe}</span>`);

        const output = runCommand(raw);
        if (output) {
          printToConsole(colorizeAtWords(output));
        }

        textInput.value = '';
      }
    }
    else if (event.key === 'ArrowUp') {
      if (history.length > 0) {
        if (historyIndex === -1) historyIndex = history.length - 1;
        else if (historyIndex > 0) historyIndex--;

        textInput.value = history[historyIndex];
        setTimeout(() => textInput.setSelectionRange(textInput.value.length, textInput.value.length), 0);
      }
      event.preventDefault();
    }
    else if (event.key === 'ArrowDown') {
      if (history.length > 0 && historyIndex !== -1) {
        if (historyIndex < history.length - 1) {
          historyIndex++;
          textInput.value = history[historyIndex];
        } else {
          historyIndex = -1;
          textInput.value = '';
        }
        setTimeout(() => textInput.setSelectionRange(textInput.value.length, textInput.value.length), 0);
      }
      event.preventDefault();
    }
    else if (event.key === 'Tab') {
      event.preventDefault();
      const input = textInput.value.trim();
      if (!input) return;

      const matches = Object.keys(commands).filter(c => c.startsWith(input));
      if (matches.length === 1) {
        // Unique match → autocomplete
        textInput.value = matches[0] + " ";
      } else if (matches.length > 1) {
        // Multiple matches → show them
        printToConsole(`<span style="color: gray">Possible: ${matches.join(", ")}</span>`);
      }
    }
  });
}
