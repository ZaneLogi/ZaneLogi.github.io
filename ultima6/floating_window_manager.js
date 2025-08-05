// === Enhanced FloatingWindowManager with docking and group dragging ===
class FloatingWindowManager {
  static nextOffsetX = 20;
  static nextOffsetY = 20;
  static allWindowIds = [];
  static instances = new Map();

  constructor(id) {
    FloatingWindowManager.allWindowIds.push(id);
    FloatingWindowManager.instances.set(id, this);

    this.id = id;
    this.window = document.getElementById(id);
    this.header = this.window.querySelector(".floatingHeader");
    this.content = this.window.querySelector(".floatingContent");

    this.keyLeft = `${id}_left`;
    this.keyTop = `${id}_top`;
    this.keyCollapsed = `${id}_collapsed`;

    this.applyInitialPosition();
    this.restoreState();
    this.initDrag();
    this.initCollapse();
  }

  applyInitialPosition() {
    if (!localStorage.getItem(this.keyLeft) && !localStorage.getItem(this.keyTop)) {
      const x = FloatingWindowManager.nextOffsetX;
      const y = FloatingWindowManager.nextOffsetY;
      this.window.style.left = x + "px";
      this.window.style.top = y + "px";

      FloatingWindowManager.nextOffsetX += 360;
      if (FloatingWindowManager.nextOffsetX + 320 > window.innerWidth) {
        FloatingWindowManager.nextOffsetX = 20;
        FloatingWindowManager.nextOffsetY += 240;
      }
    }
  }

  restoreState() {
    const left = localStorage.getItem(this.keyLeft);
    const top = localStorage.getItem(this.keyTop);
    if (left && top) {
      this.window.style.left = left;
      this.window.style.top = top;
    }
    const collapsed = localStorage.getItem(this.keyCollapsed);
    if (collapsed === "1") {
      this.window.classList.add("collapsed");
    }
  }

  initDrag() {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    this.header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      const rect = this.window.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;

      const maxX = window.innerWidth - this.window.offsetWidth;
      const maxY = window.innerHeight - this.window.offsetHeight;
      x = Math.max(0, Math.min(maxX, x));
      y = Math.max(0, Math.min(maxY, y));

      // Snap to screen edge
      const snapThreshold = 15;
      if (x < snapThreshold) x = 0;
      else if (x > maxX - snapThreshold) x = maxX;
      if (y < snapThreshold) y = 0;
      else if (y > maxY - snapThreshold) y = maxY;

      // Snap to other windows ===
      [x, y] = this.snapToOtherWindows(x, y);

      this.window.style.left = x + "px";
      this.window.style.top = y + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        localStorage.setItem(this.keyLeft, this.window.style.left);
        localStorage.setItem(this.keyTop, this.window.style.top);
      }
      isDragging = false;
    });
  }

  snapToOtherWindows(x, y) {
    const threshold = 15;
    const myRect = this.window.getBoundingClientRect();
    const width = myRect.width;
    const height = myRect.height;

    let snappedX = x;
    let snappedY = y;

    FloatingWindowManager.instances.forEach((other, id) => {
      if (id === this.id) return;

      const otherRect = other.window.getBoundingClientRect();

      // Snap horizontally
      if (Math.abs((x + width) - otherRect.left) < threshold) {
        snappedX = otherRect.left - width;
      } else if (Math.abs(x - (otherRect.right)) < threshold) {
        snappedX = otherRect.right;
      }

      // Snap vertically
      if (Math.abs((y + height) - otherRect.top) < threshold) {
        snappedY = otherRect.top - height;
      } else if (Math.abs(y - (otherRect.bottom)) < threshold) {
        snappedY = otherRect.bottom;
      }
    });

    return [snappedX, snappedY];
  }

  initCollapse() {
    this.header.addEventListener("dblclick", () => {
      this.window.classList.toggle("collapsed");
      const isCollapsed = this.window.classList.contains("collapsed");
      localStorage.setItem(this.keyCollapsed, isCollapsed ? "1" : "0");
    });
  }

  resetPosition() {
    // clear localStorage
    localStorage.removeItem(this.keyLeft);
    localStorage.removeItem(this.keyTop);
    localStorage.removeItem(this.keyCollapsed);

    // reset to defaults（according to nextOffsetX, nextOffsetY）
    // similar to applyInitialPosition but not check localStorage
    this.window.style.left = FloatingWindowManager.nextOffsetX + "px";
    this.window.style.top = FloatingWindowManager.nextOffsetY + "px";

    FloatingWindowManager.nextOffsetX += 360;
    if (FloatingWindowManager.nextOffsetX + 320 > window.innerWidth) {
      FloatingWindowManager.nextOffsetX = 20;
      FloatingWindowManager.nextOffsetY += 240;
    }

    // remove collapsed state
    this.window.classList.remove("collapsed");
  }

  static resetAllLayout() {
    FloatingWindowManager.nextOffsetX = 20;
    FloatingWindowManager.nextOffsetY = 20;

    for (const id of FloatingWindowManager.allWindowIds) {
      const instance = FloatingWindowManager.instances.get(id);
      if (instance) {
        instance.resetPosition();
      }
    }
  }
}
