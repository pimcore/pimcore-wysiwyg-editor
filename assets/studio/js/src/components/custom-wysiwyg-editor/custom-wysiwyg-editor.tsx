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
import { createImageThumbnailUrl, type DragAndDropInfo, useMessage } from '@pimcore/studio-ui-bundle/components'
import { escapeHtml, toCssDimension } from '@pimcore/studio-ui-bundle/utils'
import { useTranslation } from '@pimcore/studio-ui-bundle/app'
import { readClipboardText } from './clipboard'
import { isNil } from 'lodash'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { EditorToolbar } from './editor-toolbar'
import { CodeViewModal } from './code-view-modal'
import {
  INLINE_MARKS,
  findEnclosingLink,
  findInlineMark,
  findListItem,
  resolveSelectionStartNode,
  useEditorSelection,
  type InlineMark
} from './use-editor-selection'
import {
  applyBlockToListItem,
  canNestItem,
  isEmptyItemWithNestedList,
  isNestedItem,
  liftNestedItems,
  normalizeNestedLists
} from './list-nesting'

const LINKABLE_DOCUMENT_TYPES = ['page', 'hardlink', 'link']

/** Width a dropped image is placed at, and the thumbnail width requested for it. */
const DROPPED_IMAGE_WIDTH = 600

/** Formats a browser can display as-is, so a small one needs no thumbnail at all. */
const BROWSER_RENDERABLE_EXTENSIONS = ['jpg', 'jpeg', 'gif', 'png', 'webp', 'avif']

const getFileExtension = (path: string): string => path.split('.').pop()?.toLowerCase() ?? ''

/**
 * The child-index path from `root` down to `node`, so the same position can be found again in a
 * structurally identical clone of `root` — a `Range` only makes sense against the live document,
 * so wrapping a selection inside a detached clone needs another way to locate it there.
 */
const nodePath = (root: Node, node: Node): number[] => {
  const path: number[] = []
  let current = node

  while (current !== root) {
    const parent: Node | null = current.parentNode

    if (isNil(parent)) {
      break
    }

    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current))
    current = parent
  }

  return path
}

/** The node at `path` within `root` — the inverse of {@link nodePath}. */
const nodeAtPath = (root: Node, path: number[]): Node =>
  path.reduce<Node>((node, index) => node.childNodes[index], root)

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE'])

/** The nearest block-level ancestor of `node`, up to and including `root` itself. */
const closestBlock = (node: Node, root: Node): Node => {
  let current: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node

  while (!isNil(current) && current !== root) {
    if (current instanceof HTMLElement && BLOCK_TAGS.has(current.tagName)) {
      return current
    }

    current = current.parentNode
  }

  return root
}

/**
 * Wraps `range` in a `tagName` element, splitting the wrap one block at a time when the range
 * spans more than one. `Range.extractContents()` preserves the ancestor structure of whatever it
 * spans, so wrapping a cross-block range in a single inline element the ordinary way would nest
 * block content — a paragraph, say — inside it; wrapping it back up on reinsertion is not
 * something a browser's HTML parser can make sense of either. Splitting first keeps each wrapper
 * inside the one block it belongs to, which is both valid markup and what a reader would expect:
 * each paragraph gets its own run of bold text.
 *
 * Returns the path to the last wrapper inserted, so the caret can be placed after it once this
 * runs on a clone and the result is committed to the live document.
 */
const wrapRangeByBlock = (doc: Document, root: HTMLElement, range: Range, tagName: string): number[] => {
  const startBlock = closestBlock(range.startContainer, root)
  const endBlock = closestBlock(range.endContainer, root)

  if (startBlock === endBlock) {
    const wrapper = doc.createElement(tagName)

    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)

    // extractContents leaves an empty text node behind exactly where mutateWithHistory's own
    // insertHTML earlier did — normalizing drops it, matching what the string round trip through
    // that command produces, so the path below still resolves once this runs against the live copy
    root.normalize()

    return nodePath(root, wrapper)
  }

  // one text node at a time, grouped by the block each belongs to, so a run split across inline
  // elements within the same block (already bold text, a link) still becomes one wrapper per block
  // rather than one per text node
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  })

  const blockOrder: Node[] = []
  const textNodesByBlock = new Map<Node, Text[]>()
  let current = walker.nextNode()

  while (!isNil(current)) {
    const block = closestBlock(current, root)
    const nodes = textNodesByBlock.get(block)

    if (isNil(nodes)) {
      textNodesByBlock.set(block, [current as Text])
      blockOrder.push(block)
    } else {
      nodes.push(current as Text)
    }

    current = walker.nextNode()
  }

  // an element reference survives `normalize()` below even though its position among siblings
  // can shift — unlike a path computed before it, which could end up pointing at the wrong node
  let lastWrapper: Element | null = null

  for (const block of blockOrder) {
    const textNodes = textNodesByBlock.get(block)

    if (isNil(textNodes) || textNodes.length === 0) {
      continue
    }

    const first = textNodes[0]
    const last = textNodes[textNodes.length - 1]
    const blockRange = doc.createRange()

    blockRange.setStart(first, first === range.startContainer ? range.startOffset : 0)
    blockRange.setEnd(last, last === range.endContainer ? range.endOffset : last.length)

    const wrapper = doc.createElement(tagName)

    wrapper.appendChild(blockRange.extractContents())
    blockRange.insertNode(wrapper)

    lastWrapper = wrapper
  }

  // see the single-block branch above: without this, a path computed here can point at a position
  // the string round trip through insertHTML never reproduces
  root.normalize()

  return nodePath(root, lastWrapper ?? startBlock)
}

export const CustomWysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  ({ value, onChange, disabled, width, height, placeholder }, ref): React.JSX.Element => {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [hasFocus, setHasFocus] = useState(false)
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
    const [codeViewOpen, setCodeViewOpen] = useState(false)
    const { styles } = useStyles()
    const messageApi = useMessage()
    const { t } = useTranslation()

    const isEditable = disabled !== true
    // the toolbar stays out of the way until the field is actually being worked on, but must
    // survive controls that render in a portal and therefore steal focus out of the wrapper
    const showToolbar = isEditable && (hasFocus || linkPopoverOpen || codeViewOpen)

    const { formatState, refreshFormatState, restoreSelection } = useEditorSelection(contentRef, showToolbar)

    const valueIsEmpty = isNil(value) || value.trim() === '' || value === '<p></p>' || value === '<br>'
    const editorHtml = value ?? ''

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
      const content = contentRef.current

      if (isNil(content)) {
        return
      }

      // The browser's own list markup is not always valid — `execCommand('indent')` puts the nested
      // list beside its item rather than inside it. Repairing the live DOM would desynchronise the
      // undo history, which knows only the browser's version, so a copy is repaired instead and the
      // stored value is the sound one.
      const draft = content.cloneNode(true) as HTMLElement
      normalizeNestedLists(draft)
      onChange?.(draft.innerHTML)
    }

    const handleInput = (): void => {
      emitChange()
    }

    /**
     * Inserts what is on the clipboard as text and nothing else — no styles, classes or markup from
     * wherever it came from. The clipboard's plain-text flavour is used rather than the text of its
     * HTML flavour, which would also pick up the contents of any script tag in it.
     *
     * This is an action, not a mode: the button pastes right away, which is what a user who has just
     * copied a passage from a word processor expects it to do.
     */
    const handlePasteAsPlainText = async (): Promise<void> => {
      if (!isEditable) {
        return
      }

      const text = await readClipboardText(contentRef.current?.ownerDocument.defaultView?.navigator.clipboard)

      if (text === null) {
        // the browser will not share the clipboard; its own plain-text paste shortcut still works
        void messageApi.warning(t('wysiwyg-editor.toolbar.paste-plain-text-unavailable'))

        return
      }

      if (text === '') {
        return
      }

      // the selection may have moved while the browser asked for permission
      focusContent()

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
    const mutateWithHistory = (target: HTMLElement, mutate: (draft: HTMLElement) => number[] | void): void => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection)) {
        return
      }

      const doc = content.ownerDocument
      const draft = target.cloneNode(true) as HTMLElement

      // a path to a node in `draft`: after committing, the same path resolves against `target`
      // itself, since inserting the serialized clone reproduces the same structure as its
      // children. Only sound for `target === content` — a narrower target is itself replaced by
      // the commit below, so `target` as a reference would no longer be part of the live tree.
      const caretAfterPath = mutate(draft)

      const range = doc.createRange()

      if (target === content) {
        range.selectNodeContents(target)
      } else {
        range.selectNode(target)
      }

      selection.removeAllRanges()
      selection.addRange(range)
      doc.execCommand('insertHTML', false, target === content ? draft.innerHTML : draft.outerHTML)

      if (Array.isArray(caretAfterPath)) {
        const caretNode = nodeAtPath(target, caretAfterPath)
        const caretRange = doc.createRange()
        caretRange.setStartAfter(caretNode)
        caretRange.collapse(true)
        selection.removeAllRanges()
        selection.addRange(caretRange)
      }
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
        // Wrapping the selection directly through execCommand risks a browser quirk: replacing a
        // range that sits next to a plain space, or that spans a whole text node, can leave that
        // space — or an empty text node split off in its place — turned into a real &nbsp;, one a
        // reader never typed. Building the wrap on a detached clone with the plain Range API next
        // avoids the browser's own insertHTML behaviour entirely, and committing the whole,
        // already-correct result through `mutateWithHistory` in one step keeps undo and redo
        // reverting and replaying that exact result, rather than an intermediate one — and lets the
        // caret return to where the selection was, rather than wherever replacing the whole field's
        // content happens to leave it.
        const startPath = nodePath(content, range.startContainer)
        const startOffset = range.startOffset
        const endPath = nodePath(content, range.endContainer)
        const endOffset = range.endOffset

        mutateWithHistory(content, (draft) => {
          const draftRange = doc.createRange()
          draftRange.setStart(nodeAtPath(draft, startPath), startOffset)
          draftRange.setEnd(nodeAtPath(draft, endPath), endOffset)

          return wrapRangeByBlock(doc, draft, draftRange, INLINE_MARKS[mark].tag)
        })
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
      command === 'outdent' ? isNestedItem(listItem) : canNestItem(listItem)

    /**
     * Indenting is offered inside lists only. Outside one `execCommand('indent')` wraps the block
     * in a margin-styled blockquote, which is not something this editor should produce.
     */
    /**
     * Indenting is left to the browser rather than done by hand.
     *
     * Applying it through `insertHTML`, as the other structural edits are, corrupts a list that the
     * browser has put inside a paragraph: the replacement leaves an item orphaned outside any list,
     * which renders as a bare bullet. The native command copes with that structure, and is undoable
     * for free. It produces invalid nesting of its own, which `emitChange` repairs on the way out.
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

    /** The link the selection sits in, if any; see `findEnclosingLink` for what counts as "in". */
    const getCurrentLink = (): HTMLElement | null => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection) || selection.rangeCount === 0) {
        return null
      }

      const range = selection.getRangeAt(0)

      return content.contains(range.commonAncestorContainer)
        ? findEnclosingLink(content, range)
        : null
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

      const link = getCurrentLink()

      if (!isNil(link)) {
        // confirming the address as it is must not touch the link: the element attributes below
        // are the reference Pimcore tracks, and rewriting the tag would drop them for nothing
        if (url === (link.getAttribute('href') ?? '')) {
          return
        }

        // Change the link in place rather than nesting a new one inside it. The element attributes
        // have to go with the old address: Pimcore rewrites the href of a tag carrying them back to
        // that element's path on output, which would silently undo the change.
        mutateWithHistory(link, (draft) => {
          draft.setAttribute('href', url)
          draft.removeAttribute('pimcore_id')
          draft.removeAttribute('pimcore_type')
        })
        emitChange()
        refreshFormatState()

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

    const handleApplyCodeView = (edited: string): void => {
      // write through to the DOM rather than relying on the sync effect, which skips while the
      // content is focused — where focus lands after the modal closes is not ours to predict
      if (!isNil(contentRef.current)) {
        contentRef.current.innerHTML = edited
      }

      onChange?.(edited)
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
            onPasteAsPlainText={ () => { void handlePasteAsPlainText() } }
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
          value={ editorHtml }
        />
      </div>
    )
  }
)

CustomWysiwygEditor.displayName = 'CustomWysiwygEditor'

export default CustomWysiwygEditor
