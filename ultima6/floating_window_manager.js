// === Enhanced FloatingWindowManager with docking and group dragging ===
class FloatingWindowManager {
  static nextOffsetX = 0;
  static nextOffsetY = 0;
  static allWindowIds = [];
  static instances = new Map();

  constructor(id) {
    FloatingWindowManager.allWindowIds.push(id);
    FloatingWindowManager.instances.set(id, this);

    this.id = id;
    this.window = document.getElementById(id);
    this.header = this.window.querySelector(".floatingHeader");
    this.content = this.window.querySelector(".floatingContent");
    this.collapsedButton = this.header.querySelector(".collapse-btn");
    this.closeButton = this.header.querySelector(".close-btn");

    const rect = this.window.getBoundingClientRect();
    this.initialStyle = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    this.keyLeft = `${id}_left`;
    this.keyTop = `${id}_top`;
    this.keyCollapsed = `${id}_collapsed`;
    this.keyClosed = `${id}_closed`;

    this.applyInitialPosition();
    this.restoreState();
    this.initDrag();
    this.initCollapse();
  }

  applyInitialPosition() {
    if (!localStorage.getItem(this.keyLeft) && !localStorage.getItem(this.keyTop)) {
      let x = FloatingWindowManager.nextOffsetX;
      let y = FloatingWindowManager.nextOffsetY;
      if (y + this.initialStyle.height > window.innerHeight) {
        // Move to next column if it exceeds window height
        FloatingWindowManager.nextOffsetX += this.initialStyle.width;
        FloatingWindowManager.nextOffsetY = 0;
        x = FloatingWindowManager.nextOffsetX;
        y = 0;
      }
      else {
        FloatingWindowManager.nextOffsetY += this.initialStyle.height;
      }
      if (x + this.initialStyle.width > window.innerWidth) {
        // Reset to top left corner if it exceeds window width
        FloatingWindowManager.nextOffsetX = 0;
        FloatingWindowManager.nextOffsetY = 0;
        x = 0;
        y = 0;;
      }

      this.window.style.left = x + "px";
      this.window.style.top = y + "px";
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
    const closed = localStorage.getItem(this.keyClosed);
    if (closed === "1") {
      this.window.style.display = "none";
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
    const onCollapse = () => {
      this.window.classList.toggle("collapsed");
      const isCollapsed = this.window.classList.contains("collapsed");
      localStorage.setItem(this.keyCollapsed, isCollapsed ? "1" : "0");
    };

    this.header.addEventListener("dblclick", onCollapse);
    
    if (this.collapsedButton) {
      this.collapsedButton.addEventListener("click", onCollapse);
    }

    if (this.closeButton) {
      this.closeButton.addEventListener("click", () => {
        this.window.style.display = "none";
        localStorage.setItem(`${this.id}_closed`, "1");
      });
    }
  }

  resetPosition() {
    // clear localStorage
    localStorage.removeItem(this.keyLeft);
    localStorage.removeItem(this.keyTop);
    localStorage.removeItem(this.keyCollapsed);
    localStorage.removeItem(this.keyClosed);

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

    // set it visible
    this.window.style.display = "block";
  }

  static resetAllLayout() {
    FloatingWindowManager.nextOffsetX = 0;
    FloatingWindowManager.nextOffsetY = 0;

    let currentX = 0;
    let currentY = 0;

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    for (const id of FloatingWindowManager.allWindowIds) {
      const instance = FloatingWindowManager.instances.get(id);
      if (!instance) continue;

      const win = instance.window;
      win.style.display = "block"; // Make visible
      win.classList.remove("collapsed");

      // clear the storage
      localStorage.removeItem(instance.keyLeft);
      localStorage.removeItem(instance.keyTop);
      localStorage.removeItem(instance.keyCollapsed);
      localStorage.removeItem(instance.keyClosed);

      const rect = win.getBoundingClientRect();
      const w = instance.initialStyle.width;
      const h = rect.height;

      // exceed the bottom of the window, move to next column
      if (currentY + h > winH) {
        currentY = 0;
        currentX += w;
      }

      // be able to fit in the current row?
      if (currentX + w <= winW) {
        win.style.left = currentX + "px";
        win.style.top = currentY + "px";

        currentY += h;
      } else {
        // no, reset to the top left corner
        currentX = 0;
        currentY = 0;
        win.style.left = "0px";
        win.style.top = "0px";
      }

      win.style.width = instance.initialStyle.width + "px";

      localStorage.setItem(instance.keyLeft, win.style.left);
      localStorage.setItem(instance.keyTop, win.style.top);
    }
  }
}
