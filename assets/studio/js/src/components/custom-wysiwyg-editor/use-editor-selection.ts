/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { isNil } from 'lodash'

export interface FormatState {
  bold: boolean
  italic: boolean
  unorderedList: boolean
  orderedList: boolean
  blockquote: boolean
  block?: string
}

export interface EditorSelection {
  formatState: FormatState
  refreshFormatState: () => void
  restoreSelection: () => boolean
}

const EMPTY_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  unorderedList: false,
  orderedList: false,
  blockquote: false,
  block: undefined
}

const BOLD_TAGS = ['B', 'STRONG']
const ITALIC_TAGS = ['I', 'EM']

const queryState = (doc: Document, command: string): boolean => {
  try {
    return doc.queryCommandState(command)
  } catch {
    return false
  }
}

const isBoldWeight = (weight: string): boolean => {
  if (weight === 'bold' || weight === 'bolder') {
    return true
  }

  const numericWeight = Number(weight)

  return !Number.isNaN(numericWeight) && numericWeight >= 600
}

/**
 * The node the caret sits in. For a range that starts on an element (`selectNodeContents`) the
 * start container is the element itself, so descend to the child the offset points at.
 */
const resolveStartNode = (range: Range): Node => {
  const { startContainer, startOffset } = range

  return startContainer.nodeType === Node.ELEMENT_NODE
    ? startContainer.childNodes[startOffset] ?? startContainer
    : startContainer
}

/**
 * `queryCommandState('bold' | 'italic')` reports the *computed* style, so it is true for anything
 * inside a heading purely because headings default to font-weight 700 — which lights up the bold
 * button when the user has applied no bold at all. The toolbar has to show whether the mark was
 * explicitly applied, so look for one in the ancestor chain instead.
 */
const hasInlineMark = (root: HTMLElement, node: Node, tags: string[], isStyled: (element: HTMLElement) => boolean): boolean => {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode

  while (current instanceof HTMLElement && current !== root && root.contains(current)) {
    if (tags.includes(current.nodeName) || isStyled(current)) {
      return true
    }

    current = current.parentElement
  }

  return false
}

/**
 * Resolves the block element the caret currently sits in. Browsers report plain, never
 * explicitly formatted content either as an empty string or as `div`, which both read as
 * "paragraph" for the user.
 */
const queryBlockTag = (doc: Document): string | undefined => {
  let block: string

  try {
    block = String(doc.queryCommandValue('formatBlock') ?? '')
  } catch {
    return undefined
  }

  block = block.toLowerCase().replace(/[<>]/g, '')

  return block === '' || block === 'div' ? 'p' : block
}

/**
 * Keeps track of the formatting that applies to the current caret position so the toolbar can
 * reflect it, and remembers the last selection inside the editor so a command triggered from a
 * toolbar control that steals focus (the format dropdown, the link popover) still applies to the
 * text the user had selected.
 */
export const useEditorSelection = (contentRef: RefObject<HTMLElement>, active: boolean): EditorSelection => {
  const [formatState, setFormatState] = useState<FormatState>(EMPTY_FORMAT_STATE)
  const savedRangeRef = useRef<Range | null>(null)

  const getSelection = useCallback((): Selection | null => {
    const content = contentRef.current

    return isNil(content) ? null : content.ownerDocument.defaultView?.getSelection() ?? null
  }, [contentRef])

  const refreshFormatState = useCallback((): void => {
    const content = contentRef.current
    const selection = getSelection()

    if (isNil(content) || isNil(selection) || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)

    // keep the last known state while the caret sits outside, otherwise the toolbar would reset
    // itself the moment a toolbar control takes focus
    if (!content.contains(range.commonAncestorContainer)) {
      return
    }

    const doc = content.ownerDocument
    const block = queryBlockTag(doc)
    const startNode = resolveStartNode(range)

    setFormatState({
      bold: hasInlineMark(content, startNode, BOLD_TAGS, (element) => isBoldWeight(element.style.fontWeight)),
      italic: hasInlineMark(content, startNode, ITALIC_TAGS, (element) => element.style.fontStyle === 'italic'),
      unorderedList: queryState(doc, 'insertUnorderedList'),
      orderedList: queryState(doc, 'insertOrderedList'),
      blockquote: block === 'blockquote',
      block
    })
  }, [contentRef, getSelection])

  const handleSelectionChange = useCallback((): void => {
    const content = contentRef.current
    const selection = getSelection()

    if (!isNil(content) && !isNil(selection) && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)

      if (content.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange()
      }
    }

    refreshFormatState()
  }, [contentRef, getSelection, refreshFormatState])

  useEffect(() => {
    if (!active) {
      return
    }

    const doc = contentRef.current?.ownerDocument

    if (isNil(doc)) {
      return
    }

    doc.addEventListener('selectionchange', handleSelectionChange)
    handleSelectionChange()

    return () => {
      doc.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [active, contentRef, handleSelectionChange])

  const restoreSelection = useCallback((): boolean => {
    const content = contentRef.current
    const range = savedRangeRef.current
    const selection = getSelection()

    if (isNil(content) || isNil(range) || isNil(selection) || !content.contains(range.commonAncestorContainer)) {
      return false
    }

    selection.removeAllRanges()
    selection.addRange(range)

    return true
  }, [contentRef, getSelection])

  return { formatState, refreshFormatState, restoreSelection }
}
