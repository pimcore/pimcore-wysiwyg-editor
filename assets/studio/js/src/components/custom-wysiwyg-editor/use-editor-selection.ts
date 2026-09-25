/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { isNil } from 'lodash'
import { canNestItem, isNestedItem } from './list-nesting'

export interface FormatState {
  bold: boolean
  italic: boolean
  unorderedList: boolean
  orderedList: boolean
  blockquote: boolean
  block?: string
  /** an item can only be nested under a preceding one, so the first item of a list cannot indent */
  canIndent: boolean
  /** only an item that is already nested has a level to move out to */
  canOutdent: boolean
  /** text is selected, so a link can take it as its label */
  hasSelection: boolean
  /**
   * The `href` of the link the caret sits in, so the link popover can edit it instead of adding a
   * second link. An empty string is a link without an address; `undefined` is no link at all.
   */
  linkUrl?: string
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
  block: undefined,
  canIndent: false,
  canOutdent: false,
  hasSelection: false,
  linkUrl: undefined
}

export type InlineMark = 'bold' | 'italic'

interface InlineMarkDefinition {
  tag: string
  tags: string[]
  isStyled: (element: HTMLElement) => boolean
}

export const INLINE_MARKS: Record<InlineMark, InlineMarkDefinition> = {
  bold: {
    tag: 'b',
    tags: ['B', 'STRONG'],
    isStyled: (element) => isBoldWeight(element.style.fontWeight)
  },
  italic: {
    tag: 'i',
    tags: ['I', 'EM'],
    isStyled: (element) => isItalicStyle(element.style.fontStyle)
  }
}

export const queryState = (doc: Document, command: string): boolean => {
  try {
    return doc.queryCommandState(command)
  } catch {
    return false
  }
}

/** Whether a font-style value slants the text — oblique, at any angle, reads as italic as much as italic does. */
export const isItalicStyle = (fontStyle: string): boolean =>
  fontStyle === 'italic' || fontStyle.startsWith('oblique')

export const isBoldWeight = (weight: string): boolean => {
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

/** Walks from `node` up to (but not including) `root`, returning the first element that matches. */
/**
 * Elements a `b`/`i` may legally wrap. Listing what is inline rather than what is not is the
 * safer way round here: the toolbar produces a known handful of blocks, but the code view accepts
 * whatever a project pastes into it — a table, a `pre`, a `section` — and treating anything
 * unrecognised as a block keeps the wrap from ever being placed around one.
 */
export const INLINE_TAGS = new Set([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN', 'EM', 'I', 'IMG',
  'INS', 'KBD', 'LABEL', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SAMP', 'SMALL', 'SPAN', 'STRONG',
  'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR'
])

/** Whether `node` is an element the wrap has to stay inside rather than enclose. */
export const isBlockElement = (node: Node): node is HTMLElement =>
  node instanceof HTMLElement && !INLINE_TAGS.has(node.tagName)

const findAncestor = (root: HTMLElement, node: Node, matches: (element: HTMLElement) => boolean): HTMLElement | null => {
  let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode

  while (current instanceof HTMLElement && current !== root && root.contains(current)) {
    if (matches(current)) {
      return current
    }

    current = current.parentElement
  }

  return null
}

/**
 * The `b`/`strong`/`i`/`em` (or inline-styled) element applying `mark` to `node`, if any.
 *
 * `queryCommandState('bold' | 'italic')` cannot answer this: it reports the *computed* style, so it
 * is true for anything inside a heading purely because headings default to font-weight 700. That
 * both lights up the bold button when nothing is bold and makes `execCommand('bold')` "un-bold"
 * heading text into a `span{font-weight:normal}` instead of adding a `b`. A block carrying the
 * style itself — a paragraph styled bold — is treated like such a heading: not a mark the button
 * lights up for or takes off, but the block the text sits in; only an inline element counts.
 */
export const findInlineMark = (root: HTMLElement, node: Node, mark: InlineMark): HTMLElement | null => {
  const { tags, isStyled } = INLINE_MARKS[mark]

  return findAncestor(root, node, (element) => tags.includes(element.nodeName) || (!isBlockElement(element) && isStyled(element)))
}

/** The list item the caret sits in, if any — indenting only makes sense inside one. */
export const findListItem = (root: HTMLElement, node: Node): HTMLElement | null =>
  findAncestor(root, node, (element) => element.nodeName === 'LI')

/**
 * The link the selection sits in, if any. A selection that starts in a link but runs past it is
 * not "in" that link: the user is picking text to link, so this returns null and the range is
 * treated as new text to link rather than as an edit of the first link.
 */
export const findEnclosingLink = (root: HTMLElement, range: Range): HTMLElement | null => {
  // the start container itself, not the child at its offset: a caret placed just before a link
  // sits at the parent's offset of that link, and resolving to the child would put it inside
  const link = findAncestor(root, range.startContainer, (element) => element.nodeName === 'A')

  if (isNil(link) || range.collapsed) {
    return link
  }

  return link.contains(range.endContainer) ? link : null
}

export const resolveSelectionStartNode = resolveStartNode

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
    const listItem = findListItem(content, startNode)
    const link = findEnclosingLink(content, range)

    setFormatState({
      bold: !isNil(findInlineMark(content, startNode, 'bold')),
      italic: !isNil(findInlineMark(content, startNode, 'italic')),
      unorderedList: queryState(doc, 'insertUnorderedList'),
      orderedList: queryState(doc, 'insertOrderedList'),
      blockquote: block === 'blockquote',
      block,
      canIndent: !isNil(listItem) && canNestItem(listItem),
      canOutdent: !isNil(listItem) && isNestedItem(listItem),
      hasSelection: !range.collapsed,
      linkUrl: isNil(link) ? undefined : link.getAttribute('href') ?? ''
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
