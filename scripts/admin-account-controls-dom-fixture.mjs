// Minimal DOM ownership fixture, not browser focus or session proof.
export function createAccountDocument() {
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = {};
      this.className = '';
      this.ownText = '';
      this.listeners = new Map();
      this.ownerDocument = document;
      this.classList = {
        contains: value => this.className.split(' ').includes(value),
        add: value => { this.className += ` ${value}`; },
        remove: value => { this.className = this.className.split(' ').filter(item => item !== value).join(' '); },
      };
    }
    set textContent(value) { this.replaceChildren(); this.ownText = String(value); }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
    append(...nodes) {
      for (let node of nodes) {
        if (!(node instanceof Element)) {
          const textNode = new Element('#text');
          textNode.ownText = String(node);
          node = textNode;
        }
        node.remove();
        node.parentNode = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.children) child.parentNode = null;
      this.children = [];
      this.ownText = '';
      this.append(...nodes);
    }
    remove() {
      if (!this.parentNode) return;
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatchEvent(event) {
      for (const listener of this.listeners.get(event.type) || []) listener(event);
      return true;
    }
    click() { if (!this.disabled) this.dispatchEvent({ type: 'click' }); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    get isConnected() { return document.body === this || Boolean(this.parentNode?.isConnected); }
    matches(selector) {
      return selector.startsWith('.')
        ? this.className.split(' ').includes(selector.slice(1))
        : this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (child.matches(selector)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() { document.activeElement = this; }
  }

  document = {
    createElement: tag => new Element(tag),
    createTextNode: value => { const node = new Element('#text'); node.ownText = value; return node; },
    querySelectorAll: selector => document.body.querySelectorAll(selector),
    addEventListener() {},
    removeEventListener() {},
  };
  document.body = new Element('body');

  return { document, Element };
}
