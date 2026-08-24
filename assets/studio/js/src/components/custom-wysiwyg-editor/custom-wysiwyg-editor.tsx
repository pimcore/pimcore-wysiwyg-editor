/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type WysiwygEditorRef, type WysiwygProps } from '@pimcore/studio-ui-bundle/modules/wysiwyg'
import { type DragAndDropInfo } from '@pimcore/studio-ui-bundle/components'
import { escapeHtml, pasteHtmlAtCaret, toCssDimension } from '@pimcore/studio-ui-bundle/utils'
import { isNil } from 'lodash'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { EditorToolbar } from './editor-toolbar'
import { CodeViewModal } from './code-view-modal'
import {
  INLINE_MARKS,
  findInlineMark,
  findListItem,
  resolveSelectionStartNode,
  useEditorSelection,
  type InlineMark
} from './use-editor-selection'
import { normalizeNestedLists } from './list-nesting'

const LINKABLE_DOCUMENT_TYPES = ['page', 'hardlink', 'link']

export const CustomWysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  ({ value, onChange, disabled, width, height, placeholder }, ref): React.JSX.Element => {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [hasFocus, setHasFocus] = useState(false)
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
    const [codeViewOpen, setCodeViewOpen] = useState(false)
    const { styles } = useStyles()

    const isEditable = disabled !== true
    // the toolbar stays out of the way until the field is actually being worked on, but must
    // survive controls that render in a portal and therefore steal focus out of the wrapper
    const showToolbar = isEditable && (hasFocus || linkPopoverOpen || codeViewOpen)

    const { formatState, refreshFormatState, restoreSelection } = useEditorSelection(contentRef, showToolbar)

    const valueIsEmpty = isNil(value) || value.trim() === '' || value === '<p></p>' || value === '<br>'

    useImperativeHandle(ref, (): WysiwygEditorRef => ({
      onDrop: (info: DragAndDropInfo): void => {
        handleElementDrop(info)
      }
    }))

    useEffect(() => {
      const content = contentRef.current

      if (isNil(content)) {
        return
      }

      // While the field has focus the DOM is the source of truth. The parent may still hold the
      // previous value when this runs (its onChange can be debounced), and writing that back would
      // revert the edit that produced it — a heading switch would snap back to the old level — as
      // well as drop the caret and the browser's undo history.
      if (content.ownerDocument.activeElement === content) {
        return
      }

      if (content.innerHTML !== (value ?? '')) {
        content.innerHTML = value ?? ''
      }
    }, [value])

    const emitChange = (): void => {
      if (!isNil(contentRef.current)) {
        onChange?.(contentRef.current.innerHTML)
      }
    }

    const handleInput = (): void => {
      emitChange()
    }

    const handleFocus = (): void => {
      setHasFocus(true)
    }

    const handleBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
      const nextTarget = event.relatedTarget

      if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget) === true) {
        return
      }

      setHasFocus(false)
    }

    const focusContent = (): void => {
      const content = contentRef.current

      if (isNil(content)) {
        return
      }

      const selection = content.ownerDocument.defaultView?.getSelection()
      const caretIsInside = !isNil(selection) &&
        selection.rangeCount > 0 &&
        content.contains(selection.getRangeAt(0).commonAncestorContainer)

      content.focus({ preventScroll: true })

      if (caretIsInside || restoreSelection()) {
        return
      }

      // nothing usable to restore — put the caret at the end of the content
      if (!isNil(selection)) {
        const range = content.ownerDocument.createRange()
        range.selectNodeContents(content)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }

    const handleCommand = (command: string, argument?: string): void => {
      if (!isEditable) {
        return
      }

      focusContent()
      // deliberately kept on the deprecated-but-universal execCommand API to stay dependency-free;
      // formatBlock is the one command whose argument format differs per engine — the
      // angle-bracket form is the only one every browser accepts
      const commandArgument = command === 'formatBlock' && argument !== undefined ? `<${argument}>` : argument
      contentRef.current?.ownerDocument.execCommand(command, false, commandArgument)
      emitChange()
      refreshFormatState()
    }

    /**
     * Bold and italic are applied by hand rather than through `execCommand`, which decides whether
     * it is adding or removing the mark from the *computed* style. Inside a heading that is always
     * "already bold", so it would strip the text into a `span{font-weight:normal}` instead of
     * wrapping it in a `b`. Toggling against the marks actually present keeps the button state and
     * what the command does in agreement.
     */
    const handleToggleMark = (mark: InlineMark): void => {
      if (!isEditable) {
        return
      }

      focusContent()

      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection) || selection.rangeCount === 0) {
        return
      }

      const doc = content.ownerDocument
      const range = selection.getRangeAt(0)
      const existingMark = findInlineMark(content, resolveSelectionStartNode(range), mark)

      if (!isNil(existingMark)) {
        // unwrap the whole marked run — a simplification the "basic formatting" scope allows
        const parent = existingMark.parentNode

        if (!isNil(parent)) {
          while (existingMark.firstChild !== null) {
            parent.insertBefore(existingMark.firstChild, existingMark)
          }

          parent.removeChild(existingMark)
        }
      } else if (range.collapsed) {
        // no selection to wrap — let the browser handle "type the next characters marked"
        doc.execCommand(mark)
      } else {
        const wrapper = doc.createElement(INLINE_MARKS[mark].tag)
        wrapper.appendChild(range.extractContents())
        range.insertNode(wrapper)

        const wrappedRange = doc.createRange()
        wrappedRange.selectNodeContents(wrapper)
        selection.removeAllRanges()
        selection.addRange(wrappedRange)
      }

      emitChange()
      refreshFormatState()
    }

    /** The list item the caret is in, or null when the selection is not inside a list. */
    const getCurrentListItem = (): HTMLElement | null => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection) || selection.rangeCount === 0) {
        return null
      }

      const range = selection.getRangeAt(0)

      return content.contains(range.commonAncestorContainer)
        ? findListItem(content, resolveSelectionStartNode(range))
        : null
    }

    /**
     * An item nests under the one above it, so the first item of a list has no level to move into
     * and indenting it must do nothing — otherwise each press wraps it in another item that holds
     * only a list, rendering as a stack of empty markers.
     */
    const canApplyIndent = (listItem: HTMLElement, command: 'indent' | 'outdent'): boolean =>
      command === 'outdent' || listItem.previousElementSibling?.tagName === 'LI'

    /**
     * Indenting is offered inside lists only. Outside one `execCommand('indent')` wraps the block
     * in a margin-styled blockquote, which is not something this editor should produce.
     */
    const handleIndent = (command: 'indent' | 'outdent'): void => {
      const content = contentRef.current

      if (!isEditable || isNil(content)) {
        return
      }

      focusContent()

      const listItem = getCurrentListItem()

      if (isNil(listItem) || !canApplyIndent(listItem, command)) {
        return
      }

      content.ownerDocument.execCommand(command)
      normalizeNestedLists(content)
      emitChange()
      refreshFormatState()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      // Tab only indents within a list; everywhere else it must keep moving focus
      if (event.key !== 'Tab' || isNil(getCurrentListItem())) {
        return
      }

      event.preventDefault()
      handleIndent(event.shiftKey ? 'outdent' : 'indent')
    }

    const insertHtml = (html: string): void => {
      if (!isEditable) {
        return
      }

      const currentWindow = contentRef.current?.ownerDocument.defaultView

      if (isNil(currentWindow)) {
        return
      }

      focusContent()
      pasteHtmlAtCaret(html, currentWindow)
      emitChange()
      refreshFormatState()
    }

    const handleInsertLink = (url: string, text: string): void => {
      insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`)
    }

    const handleElementDrop = (info: DragAndDropInfo): void => {
      if (!isEditable) {
        return
      }

      const data = info.data

      if (isNil(data?.id) || isNil(data?.fullPath)) {
        return
      }

      if (info.type === 'document' && !LINKABLE_DOCUMENT_TYPES.includes(String(data.type))) {
        return
      }

      const pimcoreType = info.type === 'data-object' ? 'object' : info.type
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()
      const selectedText = !isNil(selection) &&
        !isNil(content) &&
        selection.rangeCount > 0 &&
        content.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.toString()
        : ''

      const linkText = selectedText !== '' ? selectedText : String(data.key ?? data.fullPath)

      insertHtml(
        `<a href="${escapeHtml(String(data.fullPath))}" pimcore_id="${escapeHtml(String(data.id))}" pimcore_type="${escapeHtml(pimcoreType)}">${escapeHtml(linkText)}</a>`
      )
    }

    const handleApplyCodeView = (newValue: string): void => {
      // write through to the DOM rather than relying on the sync effect, which skips while the
      // content is focused — where focus lands after the modal closes is not ours to predict
      if (!isNil(contentRef.current)) {
        contentRef.current.innerHTML = newValue
      }

      onChange?.(newValue)
      setCodeViewOpen(false)
    }

    return (
      <div
        className={ styles.wrapper }
        onBlur={ handleBlur }
        onFocus={ handleFocus }
        ref={ wrapperRef }
        style={ { maxWidth: toCssDimension(width) } }
      >
        { showToolbar && (
          <EditorToolbar
            formatState={ formatState }
            linkPopoverOpen={ linkPopoverOpen }
            onCommand={ handleCommand }
            onInsertLink={ handleInsertLink }
            onLinkPopoverOpenChange={ setLinkPopoverOpen }
            onIndent={ handleIndent }
            onOpenCodeView={ () => { setCodeViewOpen(true) } }
            onToggleMark={ handleToggleMark }
          />
        ) }

        <div
          className={ styles.content }
          contentEditable={ isEditable }
          data-empty={ valueIsEmpty }
          data-placeholder={ placeholder }
          onInput={ handleInput }
          onKeyDown={ handleKeyDown }
          ref={ contentRef }
          style={ { minHeight: toCssDimension(height) } }
          suppressContentEditableWarning
        />

        <CodeViewModal
          onApply={ handleApplyCodeView }
          onCancel={ () => { setCodeViewOpen(false) } }
          open={ codeViewOpen }
          readOnly={ !isEditable }
          value={ value ?? '' }
        />
      </div>
    )
  }
)

CustomWysiwygEditor.displayName = 'CustomWysiwygEditor'

export default CustomWysiwygEditor
