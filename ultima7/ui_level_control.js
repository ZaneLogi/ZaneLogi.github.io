import { uilevel } from "./globals.js";

export function setupLevelWindow() {
  // Attach window behavior
  new FloatingWindowManager("levelWindow");

  const container = document.getElementById("levelButtons");
  container.innerHTML = ""; // clear any existing buttons

  function makeButton(label, value) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.dataset.value = value;

    btn.addEventListener("click", () => {
      // Update global level
      uilevel.highestVisibleLevel = parseInt(value, 10);

      // Remove active from all buttons
      container.querySelectorAll("button").forEach(b => b.classList.remove("active"));

      // Add active to clicked button
      btn.classList.add("active");
    });

    container.appendChild(btn);
    return btn;
  }

  // Ground button ("G" -> -1)
  makeButton("G", -1);

  // Levels 0..15
  for (let i = 0; i <= 15; i++) {
    makeButton(String(i), i);
  }

  // Default to 15 (everything)
  const defaultBtn = container.querySelector("button[data-value='15']");
  if (defaultBtn) defaultBtn.classList.add("active");
}
