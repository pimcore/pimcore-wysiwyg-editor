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

const queryState = (doc: Document, command: string): boolean => {
  try {
    return doc.queryCommandState(command)
  } catch {
    return false
  }
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

    // keep the last known state while the caret sits outside, otherwise the toolbar would reset
    // itself the moment a toolbar control takes focus
    if (!content.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      return
    }

    const doc = content.ownerDocument
    const block = queryBlockTag(doc)

    setFormatState({
      bold: queryState(doc, 'bold'),
      italic: queryState(doc, 'italic'),
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
