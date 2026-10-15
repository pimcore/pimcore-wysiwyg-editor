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
  /** top edge of the area the field is visible in; 0 when only the page scrolls */
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

/** how many sticky bars stacked at the top are looked through; more than a few is not realistic */
const MAX_STICKY_BARS = 4

/**
 * The bottom edge of a sticky bar (a tab strip, a header) stuck over the point just below `top`,
 * or `top` itself when none covers it. The toolbar would otherwise sit underneath it. Only a
 * sticky element counts: a fixed one, such as a modal, does not belong to the scroll area, and an
 * element holding the toolbar is no bar above it.
 */
const clearStickyBars = (element: HTMLElement, top: number): number => {
  if (typeof document.elementsFromPoint !== 'function') {
    return top
  }

  const rect = element.getBoundingClientRect()
  const x = rect.left + rect.width / 2

  for (let bars = 0; bars < MAX_STICKY_BARS; bars++) {
    const bar = document
      .elementsFromPoint(x, top + 1)
      .find((candidate) => (
        getComputedStyle(candidate).position === 'sticky' &&
        !candidate.contains(element) &&
        candidate.getBoundingClientRect().top <= top + 1 &&
        candidate.getBoundingClientRect().bottom > top + 1
      ))

    if (bar === undefined) {
      break
    }

    top = bar.getBoundingClientRect().bottom
  }

  return top
}

/**
 * The top edge of the area in which the element is visible: the lowest top edge among the
 * viewport and every ancestor the user can actually scroll, moved down past any sticky bar stuck
 * there. With nested scroll areas the outer one can have scrolled past the inner one's top, so
 * the nearest scroller alone is not enough. A box that merely allows scrolling but grows with its
 * content never scrolls, and CSS `position: sticky` still takes it as its scroll area, which is
 * why it is skipped here.
 */
export const getVisibleTop = (element: HTMLElement): number => {
  let top = 0

  for (let ancestor = element.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
    const overflowY = getComputedStyle(ancestor).overflowY

    if (SCROLLING_OVERFLOW.includes(overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) {
      top = Math.max(top, ancestor.getBoundingClientRect().top)
    }
  }

  return clearStickyBars(element, top)
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

    const toolbarRect = toolbar.getBoundingClientRect()

    const offset = getStickyOffset({
      scrollerTop: getVisibleTop(toolbar),
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
