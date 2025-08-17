import { uilevel } from "./globals.js";

export function setupLevelWindow() {
  // Attach window behavior
  const levelWin = new FloatingWindowManager("levelWindow");

  // Build the select: "ground", 0..15
  const select = document.getElementById("levelSelect");
  select.innerHTML = ""; // safety

  // “Ground” -> value -1
  const optGround = document.createElement("option");
  optGround.value = "-1";
  optGround.textContent = "ground";
  select.appendChild(optGround);

  for (let i = 0; i <= 15; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `level ${i}`;
    select.appendChild(opt);
  }

  // Default to level 15 (everything)
  select.value = "15";

  // When the user changes the highest visible level:
  select.addEventListener("change", () => {
    const level = parseInt(select.value, 10);

    uilevel.highestVisibleLevel = level;
  });
}
