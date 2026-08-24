/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import { isNil } from 'lodash'

const LIST_IN_LIST = 'ol > ol, ol > ul, ul > ol, ul > ul'
const NESTED_LIST = 'li > ol, li > ul'
const ITEM_IN_ITEM = 'li > li'

const isList = (node: Node): boolean => node.nodeName === 'OL' || node.nodeName === 'UL'

const HEADING_PATTERN = /^H[1-6]$/

/** The item's own content, ignoring any sub-list hanging off it. */
const ownChildNodes = (listItem: HTMLElement): Node[] =>
  Array.from(listItem.childNodes).filter((node) => !isList(node))

/** True when the item carries a sub-list but no text of its own. */
export const isEmptyItemWithNestedList = (listItem: HTMLElement): boolean =>
  Array.from(listItem.children).some(isList) &&
  ownChildNodes(listItem).map((node) => node.textContent ?? '').join('').trim() === ''

/** True when the item sits in a sub-list, i.e. there is a level for it to move out to. */
export const isNestedItem = (listItem: HTMLElement): boolean =>
  listItem.parentElement?.parentElement?.tagName === 'LI'

/**
 * Nests an item under the one above it. Done by hand rather than with `execCommand('indent')`,
 * which produces markup a list may not contain and needs repairing afterwards — a repair the
 * browser's undo history knows nothing about.
 */
export const indentListItem = (listItem: HTMLElement): void => {
  const previous = listItem.previousElementSibling
  const parentList = listItem.parentElement

  if (previous?.tagName !== 'LI' || isNil(parentList)) {
    return
  }

  const lastChild = previous.lastElementChild
  let targetList: Element

  if (!isNil(lastChild) && isList(lastChild)) {
    targetList = lastChild
  } else {
    targetList = listItem.ownerDocument.createElement(parentList.tagName)
    previous.appendChild(targetList)
  }

  targetList.appendChild(listItem)
}

/** Moves a nested item out one level, to sit after the item it was nested under. */
export const outdentListItem = (listItem: HTMLElement): void => {
  const parentList = listItem.parentElement
  const parentItem = parentList?.parentElement

  if (isNil(parentList) || parentItem?.tagName !== 'LI') {
    return
  }

  parentItem.parentElement?.insertBefore(listItem, parentItem.nextSibling)

  if (parentList.children.length === 0) {
    parentList.remove()
  }
}

/**
 * Removes an item, lifting its sub-list into the position it occupied. Backspace cannot do this on
 * its own: on an item holding nothing but a sub-list it leaves the item in place and deletes into
 * the *previous* item's text instead, so the empty entry can never be got rid of.
 */
export const liftNestedItems = (listItem: HTMLElement): void => {
  const parentList = listItem.parentNode

  if (isNil(parentList)) {
    return
  }

  Array.from(listItem.children)
    .filter(isList)
    .forEach((nestedList) => {
      while (nestedList.firstChild !== null) {
        parentList.insertBefore(nestedList.firstChild, listItem)
      }
    })

  listItem.remove()
}

/**
 * Applies a block format to a list item's own content, keeping it inside the item.
 *
 * `execCommand('formatBlock')` cannot be used here: inside a list it splits the list around the
 * item and wraps the fragment in the block — `<ol>…</ol><h2><ol><li>x</li></ol></h2><ol>…</ol>` —
 * which is invalid and restarts the numbering of everything below.
 */
export const applyBlockToListItem = (listItem: HTMLElement, tag: string): void => {
  const doc = listItem.ownerDocument
  const existingBlock = Array.from(listItem.children)
    .find((child) => HEADING_PATTERN.test(child.tagName) || child.tagName === 'BLOCKQUOTE')

  if (tag === 'p') {
    // back to plain content — drop the wrapper, keep what it held
    if (!isNil(existingBlock)) {
      while (existingBlock.firstChild !== null) {
        listItem.insertBefore(existingBlock.firstChild, existingBlock)
      }

      existingBlock.remove()
    }

    return
  }

  const block = doc.createElement(tag)

  if (!isNil(existingBlock)) {
    while (existingBlock.firstChild !== null) {
      block.appendChild(existingBlock.firstChild)
    }

    existingBlock.replaceWith(block)

    return
  }

  ownChildNodes(listItem).forEach((node) => {
    block.appendChild(node)
  })

  listItem.insertBefore(block, listItem.firstChild)
}

/**
 * Repairs the markup `execCommand('indent' | 'outdent')` leaves behind. Browsers render their
 * output, but it is not valid HTML — a list may only contain list items — and the numbering it
 * produces is wrong. Three separate defects, all of which survive into the saved value:
 *
 * - indent puts the new list next to the item instead of inside it (`<ol><li>a</li><ol>…</ol></ol>`)
 * - indenting consecutive items makes one list each, restarting the numbering at every item
 * - outdent drops the item inside its parent item (`<li>a<li>b</li></li>`)
 */
export const normalizeNestedLists = (root: HTMLElement): void => {
  // a list beside its item belongs inside it
  root.querySelectorAll<HTMLElement>(LIST_IN_LIST).forEach((nestedList) => {
    const previous = nestedList.previousElementSibling

    if (previous?.tagName === 'LI') {
      previous.appendChild(nestedList)

      return
    }

    // No item to nest under, so there is no level to nest into — lift the entries into the parent
    // list. Wrapping them in an item of their own instead would add a marker with no text, and
    // repeating that stacks up the empty "1." markers this normalization exists to avoid.
    const parentList = nestedList.parentNode

    if (!isNil(parentList)) {
      while (nestedList.firstChild !== null) {
        parentList.insertBefore(nestedList.firstChild, nestedList)
      }

      nestedList.remove()
    }
  })

  // an outdented item belongs after its former parent, not inside it; reversed so that several
  // items moving out of the same parent keep their order
  Array.from(root.querySelectorAll<HTMLElement>(ITEM_IN_ITEM)).reverse().forEach((listItem) => {
    const parentItem = listItem.parentElement

    if (!isNil(parentItem)) {
      parentItem.parentNode?.insertBefore(listItem, parentItem.nextSibling)
    }
  })

  // fold sibling lists inside one item back together so the numbering runs continuously; only
  // nested lists are merged, so two deliberately separate top-level lists stay separate
  root.querySelectorAll<HTMLElement>(NESTED_LIST).forEach((nestedList) => {
    const previous = nestedList.previousElementSibling

    if (previous?.tagName !== nestedList.tagName) {
      return
    }

    while (nestedList.firstChild !== null) {
      previous.appendChild(nestedList.firstChild)
    }

    nestedList.remove()
  })

  // outdenting the last entry leaves the wrapper behind
  root.querySelectorAll<HTMLElement>('ol, ul').forEach((list) => {
    if (list.children.length === 0) {
      list.remove()
    }
  })
}
