import { LinkedList } from "./linked_list.js";

export class TimeQueue {
  constructor() {
    this.list = new LinkedList();
  }

  clear() {
    this.list.clear();
  }

  add(time, handler, context) {
    const entry = { time, handler, context };

    if (this.list.empty()) {
      this.list.pushBack(entry);
      return;
    }

    // Insert in time order
    for (const node of this.list) {
      if (time < node.value.time) {
        this.list.insertBefore(node, entry);
        return;
      }
    }

    // Append at the end if largest
    this.list.pushBack(entry);
  }

  remove(handler) {
    for (const node of this.list) {
      if (node.value.handler === handler) {
        this.list.remove(node);
        return;
      }
    }
  }

  trigger(curTime = performance.now()) {
    while (!this.list.empty() && this.list.front().time <= curTime) {
      const entry = this.list.popFront(); // removes front and returns value
      entry.handler.handleEvent(curTime, entry.context);
    }
  }
}
