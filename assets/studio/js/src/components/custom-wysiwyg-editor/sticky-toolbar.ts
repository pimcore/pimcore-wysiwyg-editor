/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import { type RefObject, useEffect } from 'react'

export interface StickyOffsetInput {
  /** top edge of the visible scroll area; 0 when the page itself scrolls */
  scrollerTop: number
  toolbarTop: number
  toolbarHeight: number
  wrapperBottom: number
}

/**
 * How far the toolbar has to be shifted down, from where it sits without any offset, to stay at
 * the top edge of the scroll area. It never leaves its own field: once the field's bottom edge
 * comes up it rides out with the field.
 */
export const getStickyOffset = ({ scrollerTop, toolbarTop, toolbarHeight, wrapperBottom }: StickyOffsetInput): number => {
  const overshoot = scrollerTop - toolbarTop

  if (overshoot <= 0) {
    return 0
  }

  const room = wrapperBottom - toolbarHeight - toolbarTop

  return Math.max(0, Math.min(overshoot, room))
}

const SCROLLING_OVERFLOW = ['auto', 'scroll', 'overlay']

/**
 * The nearest ancestor the user can actually scroll. A box that merely allows scrolling but grows
 * with its content never scrolls, and CSS `position: sticky` still takes it as its scroll area,
 * which is why it is skipped here and not picked.
 */
export const findScrollContainer = (element: HTMLElement): HTMLElement | null => {
  for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
    const overflowY = getComputedStyle(ancestor).overflowY

    if (SCROLLING_OVERFLOW.includes(overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) {
      return ancestor
    }
  }

  return null
}

/**
 * Keeps the toolbar at the top of the scroll area while a long field scrolls past, and returns the
 * function that stops it.
 *
 * The stylesheet already makes it `position: sticky`. That cannot work where an ancestor between
 * the field and the scrolling box clips with its own overflow, as the tab panels of a data object
 * do, so the toolbar is additionally shifted by hand. The offset is measured from the toolbar's
 * unshifted position, so it adds nothing where sticky positioning already holds the toolbar.
 */
export const keepToolbarInView = (toolbar: HTMLElement): (() => void) => {
  const wrapper = toolbar.parentElement

  if (wrapper === null) {
    return () => {}
  }

  const update = (): void => {
    toolbar.style.transform = ''

    const scroller = findScrollContainer(toolbar)
    const toolbarRect = toolbar.getBoundingClientRect()

    const offset = getStickyOffset({
      scrollerTop: scroller?.getBoundingClientRect().top ?? 0,
      toolbarTop: toolbarRect.top,
      toolbarHeight: toolbarRect.height,
      wrapperBottom: wrapper.getBoundingClientRect().bottom
    })

    toolbar.style.transform = offset > 0 ? `translateY(${offset}px)` : ''
  }

  // a scroll event does not bubble, so it is caught on the way down, whichever box scrolls
  document.addEventListener('scroll', update, { capture: true, passive: true })
  window.addEventListener('resize', update)

  // The field can shrink or grow, or the toolbar wrap, without any scroll or window resize, and
  // the offset measured earlier would then leave the toolbar outside its field.
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
  observer?.observe(wrapper)
  observer?.observe(toolbar)

  update()

  return () => {
    document.removeEventListener('scroll', update, { capture: true })
    window.removeEventListener('resize', update)
    observer?.disconnect()
    toolbar.style.transform = ''
  }
}

export const useStickyToolbar = (toolbarRef: RefObject<HTMLElement>): void => {
  useEffect(() => {
    const toolbar = toolbarRef.current

    return toolbar === null ? undefined : keepToolbarInView(toolbar)
  }, [toolbarRef])
}
