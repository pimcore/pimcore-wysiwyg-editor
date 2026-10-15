/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import React, { useRef } from 'react'
import { render } from '@testing-library/react'
import { findScrollContainer, getStickyOffset, useStickyToolbar } from './sticky-toolbar'

const rect = (top: number, height: number): DOMRect => ({
  top,
  bottom: top + height,
  height,
  left: 0,
  right: 0,
  width: 0,
  x: 0,
  y: top,
  toJSON: () => ({})
})

const makeScroller = (overflowY: string, scrollHeight: number, clientHeight: number): HTMLElement => {
  const element = document.createElement('div')
  element.style.overflowY = overflowY
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight })
  Object.defineProperty(element, 'clientHeight', { value: clientHeight })

  return element
}

describe('getStickyOffset', () => {
  it('leaves a toolbar that is still in view where it is', () => {
    expect(getStickyOffset({ scrollerTop: 100, toolbarTop: 120, toolbarHeight: 32, wrapperBottom: 900 })).toBe(0)
  })

  it('moves a toolbar that scrolled past the top edge back down to it', () => {
    expect(getStickyOffset({ scrollerTop: 100, toolbarTop: -300, toolbarHeight: 32, wrapperBottom: 900 })).toBe(400)
  })

  it('stops at the bottom of the field so the toolbar never leaves it', () => {
    // 400 would be needed to reach the top edge, but only 398 leaves the toolbar inside the field
    expect(getStickyOffset({ scrollerTop: 100, toolbarTop: -300, toolbarHeight: 32, wrapperBottom: 130 })).toBe(398)
  })

  it('never moves a toolbar upwards once the field is shorter than the toolbar', () => {
    expect(getStickyOffset({ scrollerTop: 100, toolbarTop: -300, toolbarHeight: 32, wrapperBottom: -290 })).toBe(0)
  })
})

describe('findScrollContainer', () => {
  it('finds the nearest ancestor that really scrolls', () => {
    const scroller = makeScroller('auto', 2000, 500)
    const inner = document.createElement('div')
    scroller.appendChild(inner)

    expect(findScrollContainer(inner)).toBe(scroller)
  })

  it('skips an ancestor that allows scrolling but has no overflowing content', () => {
    const scroller = makeScroller('auto', 2000, 500)
    const growing = makeScroller('auto', 800, 800)
    const inner = document.createElement('div')
    growing.appendChild(inner)
    scroller.appendChild(growing)

    expect(findScrollContainer(inner)).toBe(scroller)
  })

  it('returns null when nothing but the page scrolls', () => {
    const inner = document.createElement('div')
    document.body.appendChild(inner)

    expect(findScrollContainer(inner)).toBeNull()

    inner.remove()
  })
})

describe('useStickyToolbar', () => {
  const Probe = (): React.JSX.Element => {
    const toolbarRef = useRef<HTMLDivElement>(null)
    useStickyToolbar(toolbarRef)

    return <div data-testid='toolbar' ref={ toolbarRef } />
  }

  const setup = (toolbarTop: number): { toolbar: HTMLElement, scroller: HTMLElement } => {
    const scroller = makeScroller('auto', 3000, 500)
    scroller.getBoundingClientRect = () => rect(100, 500)
    document.body.appendChild(scroller)
    const wrapper = document.createElement('div')
    wrapper.getBoundingClientRect = () => rect(-400, 1400)
    scroller.appendChild(wrapper)

    const view = render(<Probe />, { container: wrapper })
    const toolbar = view.getByTestId('toolbar')
    // the hook measures with its own offset removed, so the untransformed position is fixed
    toolbar.getBoundingClientRect = () => rect(toolbarTop, 32)

    return { toolbar, scroller }
  }

  afterEach(() => { document.body.innerHTML = '' })

  it('shifts the toolbar down to the scroll container edge once the field scrolled past it', () => {
    const { toolbar, scroller } = setup(-400)

    scroller.dispatchEvent(new Event('scroll'))

    expect(toolbar.style.transform).toBe('translateY(500px)')
  })

  it('does nothing while the toolbar is still in view', () => {
    const { toolbar, scroller } = setup(150)

    scroller.dispatchEvent(new Event('scroll'))

    expect(toolbar.style.transform).toBe('')
  })
})
