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
import { createImageThumbnailUrl, type DragAndDropInfo } from '@pimcore/studio-ui-bundle/components'
import { escapeHtml, toCssDimension } from '@pimcore/studio-ui-bundle/utils'
import { useSettings } from '@pimcore/studio-ui-bundle/modules/app'
import { htmlToMarkdown, markdownToHtml } from './markdown'
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
import {
  applyBlockToListItem,
  indentListItem,
  isEmptyItemWithNestedList,
  isNestedItem,
  liftNestedItems,
  normalizeNestedLists,
  outdentListItem
} from './list-nesting'

const LINKABLE_DOCUMENT_TYPES = ['page', 'hardlink', 'link']

/** Width a dropped image is placed at, and the thumbnail width requested for it. */
const DROPPED_IMAGE_WIDTH = 600

/** Formats a browser can display as-is, so a small one needs no thumbnail at all. */
const BROWSER_RENDERABLE_EXTENSIONS = ['jpg', 'jpeg', 'gif', 'png', 'webp', 'avif']

const getFileExtension = (path: string): string => path.split('.').pop()?.toLowerCase() ?? ''

/** Setting published by the bundle's WysiwygSettingsProvider. */
const PERSISTENCE_FORMAT_SETTING = 'wysiwyg_editor_persistence_format'

export const CustomWysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  ({ value, onChange, disabled, width, height, placeholder }, ref): React.JSX.Element => {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [hasFocus, setHasFocus] = useState(false)
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
    const [codeViewOpen, setCodeViewOpen] = useState(false)
    const [pasteAsPlainText, setPasteAsPlainText] = useState(false)
    const { styles } = useStyles()
    const settings = useSettings()

    // the editor always works in HTML; markdown, when configured, is only the persisted form
    const persistsMarkdown = (settings as Record<string, any>)[PERSISTENCE_FORMAT_SETTING] !== 'html'
    // an image stored only as an element address needs a real URL before the editor can show it
    const resolveAssetSrc = (assetId: number): string =>
      createImageThumbnailUrl(assetId, { width: DROPPED_IMAGE_WIDTH, mimeType: 'JPEG' })
    const toEditorHtml = (stored?: string | null): string =>
      persistsMarkdown ? markdownToHtml(stored ?? '', resolveAssetSrc) : stored ?? ''
    const toStoredValue = (html: string): string => persistsMarkdown ? htmlToMarkdown(html) : html

    const isEditable = disabled !== true
    // the toolbar stays out of the way until the field is actually being worked on, but must
    // survive controls that render in a portal and therefore steal focus out of the wrapper
    const showToolbar = isEditable && (hasFocus || linkPopoverOpen || codeViewOpen)

    const { formatState, refreshFormatState, restoreSelection } = useEditorSelection(contentRef, showToolbar)

    const valueIsEmpty = isNil(value) || value.trim() === '' || value === '<p></p>' || value === '<br>'
    const editorHtml = toEditorHtml(value)

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

      if (content.innerHTML !== editorHtml) {
        content.innerHTML = editorHtml
      }
    }, [editorHtml])

    const emitChange = (): void => {
      if (!isNil(contentRef.current)) {
        onChange?.(toStoredValue(contentRef.current.innerHTML))
      }
    }

    const handleInput = (): void => {
      emitChange()
    }

    /**
     * While the toggle is on, a paste contributes text and nothing else — no styles, classes or
     * markup from wherever it came from. The clipboard's plain-text flavour is used rather than the
     * text of its HTML flavour, which would also pick up the contents of any script tag in it.
     */
    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>): void => {
      if (!pasteAsPlainText || !isEditable) {
        return
      }

      event.preventDefault()

      const text = event.clipboardData.getData('text/plain')

      if (text === '') {
        return
      }

      // insertText keeps the paste in the undo history and splits lines into blocks
      contentRef.current?.ownerDocument.execCommand('insertText', false, text)
      emitChange()
      refreshFormatState()
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

    /**
     * Applies a DOM change so that it lands in the browser's undo history.
     *
     * Nodes moved or created directly are invisible to `execCommand('undo')`: the change cannot be
     * reverted, and worse, undo then rolls back an *earlier* edit while keeping this one, leaving
     * content in a state that never existed. Mutating a copy and writing it back through
     * `insertHTML` records one ordinary, undoable step.
     */
    const mutateWithHistory = (target: HTMLElement, mutate: (draft: HTMLElement) => void): void => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection)) {
        return
      }

      const doc = content.ownerDocument
      const draft = target.cloneNode(true) as HTMLElement

      mutate(draft)

      const range = doc.createRange()

      if (target === content) {
        range.selectNodeContents(target)
      } else {
        range.selectNode(target)
      }

      selection.removeAllRanges()
      selection.addRange(range)
      doc.execCommand('insertHTML', false, target === content ? draft.innerHTML : draft.outerHTML)
    }

    const handleCommand = (command: string, argument?: string): void => {
      if (!isEditable) {
        return
      }

      focusContent()

      const listItem = command === 'formatBlock' ? getCurrentListItem() : null

      if (!isNil(listItem) && argument !== undefined) {
        // inside a list execCommand would split the list around the item and restart its numbering
        mutateWithHistory(listItem, (draft) => { applyBlockToListItem(draft, argument) })
      } else {
        // deliberately kept on the deprecated-but-universal execCommand API to stay dependency-free;
        // formatBlock is the one command whose argument format differs per engine — the
        // angle-bracket form is the only one every browser accepts
        const commandArgument = command === 'formatBlock' && argument !== undefined ? `<${argument}>` : argument
        contentRef.current?.ownerDocument.execCommand(command, false, commandArgument)
      }

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
        const markRange = doc.createRange()
        markRange.selectNode(existingMark)
        selection.removeAllRanges()
        selection.addRange(markRange)
        doc.execCommand('insertHTML', false, existingMark.innerHTML)
      } else if (range.collapsed) {
        // no selection to wrap — let the browser handle "type the next characters marked"
        doc.execCommand(mark)
      } else {
        const draft = doc.createElement('div')
        draft.appendChild(range.cloneContents())
        doc.execCommand('insertHTML', false, `<${INLINE_MARKS[mark].tag}>${draft.innerHTML}</${INLINE_MARKS[mark].tag}>`)
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
      if (!isEditable) {
        return
      }

      focusContent()

      const listItem = getCurrentListItem()

      if (isNil(listItem) || !canApplyIndent(listItem, command)) {
        return
      }

      const list = listItem.parentElement

      if (isNil(list)) {
        return
      }

      // the whole list is rewritten in one step, so indenting is a single undoable action
      const itemIndex = Array.from(list.children).indexOf(listItem)

      mutateWithHistory(list, (draft) => {
        const draftItem = draft.children[itemIndex]

        if (!(draftItem instanceof HTMLElement)) {
          return
        }

        if (command === 'indent') {
          indentListItem(draftItem)
        } else {
          outdentListItem(draftItem)
        }

        normalizeNestedLists(draft)
      })

      emitChange()
      refreshFormatState()
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const listItem = getCurrentListItem()

      if (event.key === 'Backspace' && !isNil(listItem) && isEmptyItemWithNestedList(listItem)) {
        // browsers refuse to remove such an item and delete into the previous one's text instead
        event.preventDefault()

        const list = listItem.parentElement
        const itemIndex = isNil(list) ? -1 : Array.from(list.children).indexOf(listItem)

        if (!isNil(list) && itemIndex >= 0) {
          mutateWithHistory(list, (draft) => {
            const draftItem = draft.children[itemIndex]

            if (draftItem instanceof HTMLElement) {
              liftNestedItems(draftItem)
            }
          })
        }

        emitChange()
        refreshFormatState()

        return
      }

      // Tab only indents within a list; everywhere else it must keep moving focus
      if (event.key !== 'Tab' || isNil(listItem)) {
        return
      }

      event.preventDefault()
      handleIndent(event.shiftKey ? 'outdent' : 'indent')
    }

    const insertHtml = (html: string): void => {
      if (!isEditable) {
        return
      }

      focusContent()

      const doc = contentRef.current?.ownerDocument

      if (isNil(doc)) {
        return
      }

      // insertHTML rather than inserting nodes directly, so the insertion is undoable
      doc.execCommand('insertHTML', false, html)
      emitChange()
      refreshFormatState()
    }

    /** True when something inside the content is selected, rather than just a caret. */
    const hasContentSelection = (): boolean => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection) || selection.rangeCount === 0) {
        return false
      }

      const range = selection.getRangeAt(0)

      return !range.collapsed && content.contains(range.commonAncestorContainer)
    }

    const handleInsertLink = (url: string, text: string): void => {
      if (!isEditable) {
        return
      }

      focusContent()

      const doc = contentRef.current?.ownerDocument

      if (isNil(doc)) {
        return
      }

      if (hasContentSelection()) {
        // Wrap the selection where it is. Rebuilding it as markup instead would lose the formatting
        // around it: a selection inside a `b` clones as bare text, and replacing it collapses the
        // now-empty `b`, so linking bold text would drop the bold.
        doc.execCommand('createLink', false, url)
        emitChange()
        refreshFormatState()

        return
      }

      insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(text !== '' ? text : url)}</a>`)
    }

    /**
     * An image asset is dropped in as the image itself rather than a link to it.
     *
     * `src` points at the Studio thumbnail endpoint, which only an authenticated user can read —
     * that is fine, and is what the classic editor does too: on output Pimcore matches the
     * `pimcore_id`/`pimcore_type` attributes, replaces `src` with the asset's public path and
     * regenerates a thumbnail from the width attribute (`Pimcore\Tool\Text::wysiwygText()`).
     */
    const buildImageHtml = (data: Record<string, any>): string => {
      const assetId = Number(data.id)
      const assetWidth = Number(data.width)
      const knownWidth = Number.isFinite(assetWidth) && assetWidth > 0
      const fitsUnscaled = knownWidth &&
        assetWidth < DROPPED_IMAGE_WIDTH &&
        BROWSER_RENDERABLE_EXTENSIONS.includes(getFileExtension(String(data.fullPath)))

      const width = knownWidth ? Math.min(assetWidth, DROPPED_IMAGE_WIDTH) : DROPPED_IMAGE_WIDTH
      const source = fitsUnscaled
        ? String(data.fullPath)
        : createImageThumbnailUrl(assetId, { width: DROPPED_IMAGE_WIDTH, mimeType: 'JPEG' })

      const attributes = [
        `src="${escapeHtml(source)}"`,
        `width="${width}"`,
        `alt="${escapeHtml(String(data.filename ?? data.key ?? ''))}"`,
        `pimcore_id="${escapeHtml(String(data.id))}"`,
        'pimcore_type="asset"',
        // tells Pimcore to keep the original on output, since it is already small enough
        ...(fitsUnscaled ? ['pimcore_disable_thumbnail="true"'] : [])
      ]

      return `<img ${attributes.join(' ')} />`
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

      // selected text is there to become a link label; replacing it with an image would drop it
      if (info.type === 'asset' && data.type === 'image' && selectedText === '') {
        insertHtml(buildImageHtml(data))

        return
      }

      const linkText = selectedText !== '' ? selectedText : String(data.key ?? data.fullPath)

      insertHtml(
        `<a href="${escapeHtml(String(data.fullPath))}" pimcore_id="${escapeHtml(String(data.id))}" pimcore_type="${escapeHtml(pimcoreType)}">${escapeHtml(linkText)}</a>`
      )
    }

    /**
     * The modal edits the field in the form it is stored in: markdown where that is configured,
     * HTML otherwise. Editing HTML while the field persists markdown would show the user a form
     * their edits are immediately converted out of.
     */
    const handleApplyCodeView = (edited: string): void => {
      // write through to the DOM rather than relying on the sync effect, which skips while the
      // content is focused — where focus lands after the modal closes is not ours to predict
      if (!isNil(contentRef.current)) {
        contentRef.current.innerHTML = persistsMarkdown ? markdownToHtml(edited, resolveAssetSrc) : edited
      }

      onChange?.(persistsMarkdown ? edited : toStoredValue(edited))
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
            onTogglePasteAsPlainText={ () => { setPasteAsPlainText((current) => !current) } }
            pasteAsPlainText={ pasteAsPlainText }
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
          onPaste={ handlePaste }
          ref={ contentRef }
          style={ { minHeight: toCssDimension(height) } }
          suppressContentEditableWarning
        />

        <CodeViewModal
          language={ persistsMarkdown ? 'markdown' : 'html' }
          onApply={ handleApplyCodeView }
          onCancel={ () => { setCodeViewOpen(false) } }
          open={ codeViewOpen }
          readOnly={ !isEditable }
          value={ persistsMarkdown ? value ?? '' : editorHtml }
        />
      </div>
    )
  }
)

CustomWysiwygEditor.displayName = 'CustomWysiwygEditor'

export default CustomWysiwygEditor
