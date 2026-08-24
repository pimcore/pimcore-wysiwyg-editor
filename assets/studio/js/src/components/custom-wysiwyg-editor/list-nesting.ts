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

    // no item to attach to (the list starts with a nested level) — give it one
    const listItem = root.ownerDocument.createElement('li')
    nestedList.parentNode?.insertBefore(listItem, nestedList)
    listItem.appendChild(nestedList)
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
