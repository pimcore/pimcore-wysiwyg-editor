/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

// antd reads media queries for its responsive observer; jsdom has no implementation of it
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
})

// jsdom 26 (jest 30) moves the selection to the start of an element on focus(), even when it
// already lies inside it; browsers keep it. Restore the selection that was inside the element.
const originalFocus = HTMLElement.prototype.focus

HTMLElement.prototype.focus = function focus (this: HTMLElement, options?: FocusOptions): void {
  const selection = this.ownerDocument.getSelection()
  const saved = selection !== null && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  const wasInside = saved !== null && this.contains(saved.commonAncestorContainer)

  originalFocus.call(this, options)

  if (wasInside && saved !== null && selection !== null) {
    selection.removeAllRanges()
    selection.addRange(saved)
  }
}
