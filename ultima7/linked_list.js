// Node for the linked list
class ListNode {
  constructor(value) {
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

export class LinkedList {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  // --- Basic operations ---
  clear() {
    this.head = this.tail = null;
    this.size = 0;
  }

  empty() {
    return this.size === 0;
  }

  front() {
    return this.head?.value;
  }

  back() {
    return this.tail?.value;
  }

  // --- Push / Pop ---
  pushFront(value) {
    const node = new ListNode(value);
    if (!this.head) {
      this.head = this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
    this.size++;
    return node;
  }

  pushBack(value) {
    const node = new ListNode(value);
    if (!this.tail) {
      this.head = this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.size++;
    return node;
  }

  popFront() {
    if (!this.head) return null;
    const node = this.head;
    this.head = node.next;
    if (this.head) this.head.prev = null;
    else this.tail = null;
    node.next = node.prev = null;
    this.size--;
    return node.value;
  }

  popBack() {
    if (!this.tail) return null;
    const node = this.tail;
    this.tail = node.prev;
    if (this.tail) this.tail.next = null;
    else this.head = null;
    node.next = node.prev = null;
    this.size--;
    return node.value;
  }

  // --- Insert / Remove ---
  insertBefore(refNode, value) {
    if (!refNode) return this.pushBack(value);
    const node = new ListNode(value);
    node.next = refNode;
    node.prev = refNode.prev;
    if (refNode.prev) refNode.prev.next = node;
    else this.head = node;
    refNode.prev = node;
    this.size++;
    return node;
  }

  insertAfter(refNode, value) {
    if (!refNode) return this.pushFront(value);
    const node = new ListNode(value);
    node.prev = refNode;
    node.next = refNode.next;
    if (refNode.next) refNode.next.prev = node;
    else this.tail = node;
    refNode.next = node;
    this.size++;
    return node;
  }

  remove(node) {
    if (!node) return;
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.next = node.prev = null;
    this.size--;
  }

  removeValue(value) {
    let cur = this.head;
    while (cur) {
      if (cur.value === value) {
        this.remove(cur);
        return true; // removed successfully
      }
      cur = cur.next;
    }
    return false; // value not found
  }

  // --- Search / traversal ---
  find(predicate) {
    let cur = this.head;
    while (cur) {
      if (predicate(cur.value)) return cur;
      cur = cur.next;
    }
    return null;
  }

  forEach(callback) {
    let cur = this.head;
    while (cur) {
      callback(cur.value);
      cur = cur.next;
    }
  }

  // --- Iteration support ---
  *[Symbol.iterator]() {
    let cur = this.head;
    while (cur) {
      yield cur;
      cur = cur.next;
    }
  }
}
