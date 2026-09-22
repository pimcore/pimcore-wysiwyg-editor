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
  isBlockElement,
  isBoldWeight,
  isItalicStyle,
  queryState,
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

/**
 * The node at `path` within `root` — the inverse of {@link nodePath}, or `null` when the path
 * leads nowhere. A path worked out against a clone is followed against the committed document,
 * which the browser is free to have reparsed into a slightly different shape, so any step along
 * the way may be missing rather than only the last one.
 */
const nodeAtPath = (root: Node, path: number[]): Node | null =>
  path.reduce<Node | null>((node, index) => node?.childNodes[index] ?? null, root)

/** Where to leave the caret once a span is committed: right after a node, or at an offset within one. */
type CaretAnchor = { after: Node } | { within: Node, offset: number }

interface FieldSpan {
  container: HTMLElement
  from: number
  to: number
}

/**
 * The marker put in front of a field's first block before the whole field is written back
 * through `insertHTML`. What the replaced range begins with decides how the browser reinserts —
 * see {@link commitSpan} — and a rendered inline node in front keeps a heading or list from
 * becoming the shell everything else ends up nested in. A zero-width space is what renders
 * without showing; the element around it, carrying a token this editor instance made up, is what
 * tells the marker apart from anything a user could have written. It goes out with the replaced
 * content and only ever comes back with an undo, where {@link dropInlineLead} removes it again.
 */
const INLINE_LEAD_ATTRIBUTE = 'data-wysiwyg-lead'

const createInlineLead = (doc: Document, token: string): HTMLElement => {
  const lead = doc.createElement('span')

  lead.setAttribute(INLINE_LEAD_ATTRIBUTE, token)
  lead.textContent = '\u200b'

  return lead
}

const dropInlineLead = (content: HTMLElement, token: string): void => {
  content.querySelectorAll(`:scope > [${INLINE_LEAD_ATTRIBUTE}="${token}"]`).forEach((lead) => { lead.remove() })
}

/** Whether `node` puts anything on the page: an element, or text that is not just whitespace between tags. */
const isRendered = (node: Node): boolean =>
  node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && (node as Text).data.trim() !== '')

/**
 * Whether `element` can be written back as one piece: its contents begin with a rendered inline
 * node, or it is empty, so it holds no block of its own for the browser to turn into a shell. A
 * comment or whitespace between tags in front of the first block renders nothing and protects
 * nothing, so it is looked past.
 */
const beginsInline = (element: HTMLElement): boolean => {
  const first = Array.from(element.childNodes).find(isRendered)

  return isNil(first) || !isBlockElement(first)
}

/**
 * The child-index spans of `root` (or of blocks nested in it) to write back for a change within
 * `range` — see {@link commitSpan} for why a span must not begin with a block. A container that
 * begins inline goes back whole — including a paragraph the browser left a list in after its
 * text, which the browser lifts the list out of on the way in, whereas the text run written back
 * on its own picks up a stray <br>. Otherwise each block the range reaches is taken on its own,
 * descending into it as long as it begins with a block itself, and each run of inline nodes
 * between blocks is one span of its parent.
 */
const spansToCommit = (root: HTMLElement, range: Range): FieldSpan[] => {
  if (beginsInline(root)) {
    return [{ container: root, from: 0, to: root.childNodes.length }]
  }

  const spans: FieldSpan[] = []
  let run: { from: number, to: number, reached: boolean, rendered: boolean } | null = null

  // a run the range reaches but that renders nothing — the whitespace between two blocks' tags —
  // has nothing to format, and a wrapper around it would be markup where none belongs
  const closeRun = (): void => {
    if (!isNil(run) && run.reached && run.rendered) {
      spans.push({ container: root, from: run.from, to: run.to })
    }

    run = null
  }

  root.childNodes.forEach((child, index) => {
    if (isBlockElement(child)) {
      closeRun()

      if (range.intersectsNode(child)) {
        spans.push(...spansToCommit(child, range))
      }

      return
    }

    if (isNil(run)) {
      run = { from: index, to: index, reached: false, rendered: false }
    }

    run.to = index + 1
    run.reached = run.reached || range.intersectsNode(child)
    run.rendered = run.rendered || isRendered(child)
  })

  closeRun()

  return spans
}

/** Whether what surrounds `element` renders `mark` by itself — a heading's own weight, say. */
const isMarkInherited = (element: Node, mark: InlineMark): boolean => {
  const parent = element.parentElement
  const style = parent?.ownerDocument.defaultView?.getComputedStyle(parent)

  if (isNil(style)) {
    return false
  }

  return mark === 'bold' ? isBoldWeight(style.fontWeight) : isItalicStyle(style.fontStyle)
}

/**
 * Whether position (`nodeA`, `offsetA`) comes strictly before (`nodeB`, `offsetB`) in document
 * order — the two boundary points of a `Range`, in general, since one is free to sit inside an
 * element the other is only adjacent to. Delegates to a `Range` already correctly handling that,
 * rather than walking the tree by hand.
 */
const isBeforePosition = (doc: Document, nodeA: Node, offsetA: number, nodeB: Node, offsetB: number): boolean => {
  const reference = doc.createRange()

  reference.setStart(nodeA, offsetA)
  reference.collapse(true)

  return reference.comparePoint(nodeB, offsetB) > 0
}

/**
 * The position (`container`, `offset`) reaches into going forward — the same position if it is
 * already inside a text node, or the first text-node position found by descending into whatever
 * sits at `offset` when it is an element boundary instead (an empty element bottoms out where it
 * is, with nothing further to descend into).
 */
const descendForward = (container: Node, offset: number): { node: Node, offset: number } => {
  let current = container
  let currentOffset = offset

  while (current.nodeType !== Node.TEXT_NODE) {
    const child = current.childNodes[currentOffset]

    if (isNil(child)) {
      return { node: current, offset: currentOffset }
    }

    current = child
    currentOffset = 0
  }

  return { node: current, offset: currentOffset }
}

/** The same as {@link descendForward}, but towards the position just before `offset`. */
const descendBackward = (container: Node, offset: number): { node: Node, offset: number } => {
  let current = container
  let currentOffset = offset

  while (current.nodeType !== Node.TEXT_NODE) {
    const child = current.childNodes[currentOffset - 1]

    if (isNil(child)) {
      return { node: current, offset: currentOffset }
    }

    current = child
    currentOffset = child.nodeType === Node.TEXT_NODE ? (child as Text).length : child.childNodes.length
  }

  return { node: current, offset: currentOffset }
}

/** The deepest block-level element containing both `nodeA` and `nodeB`, or `null` when none does
 *  (a bare field with no recognized block structure at all). */
const closestSharedBlock = (nodeA: Node, nodeB: Node, root: HTMLElement): HTMLElement | null => {
  let current: Node | null = nodeA

  while (!isNil(current) && current !== root) {
    if (isBlockElement(current) && current.contains(nodeB)) {
      return current
    }

    current = current.parentNode
  }

  return null
}

/**
 * Removes the empty text nodes among `parent`'s own children. Unlike `normalize()` this neither
 * recurses nor merges: the range boundaries {@link wrapRangeByBlock} still holds may point into a
 * text node anywhere below `parent`, and merging would detach them — as removing an empty one
 * they sit in would, which the caller moves them out of first.
 */
const dropEmptyTextChildren = (parent: Node): void => {
  Array.from(parent.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE && (child as Text).data === '') {
      child.remove()
    }
  })
}

/**
 * Wraps `range` in a `tagName` element, splitting the wrap around every block-level element the
 * range at least partly overlaps without fully containing — a sibling block entirely, or one
 * nested inside the block the range's endpoints share. Wrapping a range spanning such a block in
 * one inline element the ordinary way would nest that block's content inside it, via
 * `extractContents()` preserving the ancestor structure of whatever it spans — markup a browser's
 * HTML parser cannot make sense of on the way back in. A block the range only partly reaches into
 * keeps just the part it actually covers; one entirely inside the range — a nested list sitting
 * between two runs of the same list item, say — is wrapped whole, recursing in case it holds a
 * further nested block of its own.
 *
 * `range` is read once, right away: every mutation below removes something the range's own
 * boundaries can point into, and a live `Range` silently re-anchors itself the moment that
 * happens, so re-reading it partway through would see a boundary this function never set.
 *
 * Returns the last wrapper inserted, or `null` when the range held nothing to wrap — an empty
 * paragraph, or a void element a `b`/`i` may not enclose. The caller places the caret after it,
 * and an element reference survives the repairs that run before the result is committed, which a
 * path worked out here would not.
 */
const wrapRangeByBlock = (doc: Document, root: HTMLElement, range: Range, tagName: string): Element | null => {
  let startContainer = range.startContainer
  let startOffset = range.startOffset
  let endContainer = range.endContainer
  let endOffset = range.endOffset

  // Drops the empty text nodes among `parent`'s children — moving a boundary that sits in one of
  // them to the same position in `parent` first, so it does not come loose with the node. That
  // position is counted in the children that remain, since empty ones before it go as well.
  const settle = (parent: Node): void => {
    const isEmptyText = (node: Node): boolean => node.nodeType === Node.TEXT_NODE && (node as Text).data === ''
    const reanchor = (node: Node, offset: number): { node: Node, offset: number } => {
      if (!isEmptyText(node) || node.parentNode !== parent) {
        return { node, offset }
      }

      const siblings = Array.from(parent.childNodes)

      return { node: parent, offset: siblings.slice(0, siblings.indexOf(node as ChildNode)).filter((sibling) => !isEmptyText(sibling)).length }
    }
    const start = reanchor(startContainer, startOffset)
    const end = reanchor(endContainer, endOffset)

    startContainer = start.node
    startOffset = start.offset
    endContainer = end.node
    endOffset = end.offset
    dropEmptyTextChildren(parent)
  }

  // the leaf positions these boundaries actually reach, used only to test whether a candidate
  // block holds them — an element-boundary range (selecting a whole element, or every child of
  // the field itself) would otherwise never register as "inside" anything
  const startLeaf = descendForward(startContainer, startOffset)
  const endLeaf = descendBackward(endContainer, endOffset)

  const crossedBlocks: HTMLElement[] = []
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      isBlockElement(node) && range.intersectsNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP
  })
  let node = walker.nextNode()

  while (!isNil(node)) {
    const element = node as HTMLElement
    // a block already inside one already collected gets handled when that one recurses into it —
    // and with the walk depth-first, only the block collected last can still contain this one
    const lastCollected = crossedBlocks[crossedBlocks.length - 1]
    const alreadyCovered = !isNil(lastCollected) && lastCollected.contains(element)

    if (!alreadyCovered && !(element.contains(startLeaf.node) && element.contains(endLeaf.node))) {
      crossedBlocks.push(element)
    }

    node = walker.nextNode()
  }

  const wrapDirectly = (target: Range): Element | null => {
    const contents = target.extractContents()

    // nothing there to format: an empty block, or a void element a b/i may not enclose. Putting
    // an empty wrapper in would leave markup the reparse below drops again, and a caret position
    // pointing at a node that no longer exists.
    if (contents.textContent === '') {
      target.insertNode(contents)

      return null
    }

    const wrapper = doc.createElement(tagName)

    wrapper.appendChild(contents)
    target.insertNode(wrapper)

    return wrapper
  }

  if (crossedBlocks.length === 0) {
    // the block both ends already share, if any — using its own edges rather than `range` as it
    // stands keeps a single recognized block (the whole of a one-paragraph field, selected end to
    // end) from having its own element wrapped whole, rather than just the text inside it
    const sharedBlock = closestSharedBlock(startLeaf.node, endLeaf.node, root)
    let scoped = range

    if (!isNil(sharedBlock)) {
      const startBoundary = sharedBlock.contains(startContainer)
        ? { node: startContainer, offset: startOffset }
        : { node: sharedBlock as Node, offset: 0 }
      const endBoundary = sharedBlock.contains(endContainer)
        ? { node: endContainer, offset: endOffset }
        : { node: sharedBlock as Node, offset: sharedBlock.childNodes.length }

      scoped = doc.createRange()
      scoped.setStart(startBoundary.node, startBoundary.offset)
      scoped.setEnd(endBoundary.node, endBoundary.offset)
    }

    const wrapper = wrapDirectly(scoped)

    // extractContents leaves an empty text node behind exactly where mutateWithHistory's own
    // insertHTML earlier did — normalizing drops it, matching what the string round trip through
    // that command produces
    root.normalize()

    return wrapper
  }

  const wrapIfNonEmpty = (startNode: Node, startPos: number, endNode: Node, endPos: number): Element | null => {
    if (!isBeforePosition(doc, startNode, startPos, endNode, endPos)) {
      return null
    }

    const segment = doc.createRange()

    segment.setStart(startNode, startPos)
    segment.setEnd(endNode, endPos)

    // the gap between two blocks is often just the whitespace between their tags — nothing to
    // format, and a wrapper directly between blocks is markup where none belongs
    if (!Array.from(segment.cloneContents().childNodes).some(isRendered)) {
      return null
    }

    return wrapDirectly(segment)
  }

  let lastWrapper: Element | null = null
  let cursorNode: Node = startContainer
  let cursorOffset: number = startOffset
  let endHandled = false

  for (const block of crossedBlocks) {
    const parent = block.parentNode

    if (isNil(parent)) {
      continue
    }

    // The part of the range before reaching this block. The cursor can still be sitting outside
    // `parent` entirely — a whole-field selection starts at the field itself, while the first
    // block crossed may be a list item one level further in — and a segment spanning that gap
    // would extract a partial copy of the container between them. Clamped to `parent`'s own start
    // instead, which collapses the segment away when there was nothing in between to format.
    const beforeStart = parent.contains(cursorNode)
      ? { node: cursorNode, offset: cursorOffset }
      : { node: parent, offset: 0 }
    const before = wrapIfNonEmpty(
      beforeStart.node,
      beforeStart.offset,
      parent,
      Array.prototype.indexOf.call(parent.childNodes, block)
    )

    if (!isNil(before)) {
      lastWrapper = before
    }

    // that wrap can leave an empty text node behind next to `block`, throwing off every index
    // computed against `parent` below — settle it before reading any of them
    settle(parent)

    // the range's own overlap with this block's content: reaching in from the range's own start
    // (or out to its own end) when that boundary sits inside the block, its own full content
    // otherwise — covering both a block only partly reached into and one entirely inside the
    // range, sitting between the range's real endpoints without either landing inside it
    const endsInBlock = block.contains(endContainer)

    if (endsInBlock) {
      endHandled = true
    }

    const startBoundary = block.contains(startContainer)
      ? { node: startContainer, offset: startOffset }
      : { node: block as Node, offset: 0 }
    const endBoundary = endsInBlock
      ? { node: endContainer, offset: endOffset }
      : { node: block as Node, offset: block.childNodes.length }

    const innerRange = doc.createRange()

    innerRange.setStart(startBoundary.node, startBoundary.offset)
    innerRange.setEnd(endBoundary.node, endBoundary.offset)

    if (!innerRange.collapsed) {
      const innerWrapper = wrapRangeByBlock(doc, block, innerRange, tagName)

      if (!isNil(innerWrapper)) {
        lastWrapper = innerWrapper
      }
    }

    settle(parent)
    cursorNode = parent
    cursorOffset = Array.prototype.indexOf.call(parent.childNodes, block) + 1
  }

  // Skipped once the last block's own overlap already reached the range's real end — trying it
  // again here would read a node that block's own wrap already removed from the document. The
  // end is clamped the same way the leading segment's start is: a whole-field selection ends at
  // the field itself, one level out from the container the last block sits in, and a segment
  // spanning that gap would extract a partial copy of it.
  if (!endHandled) {
    const afterEnd = cursorNode.contains(endContainer)
      ? { node: endContainer, offset: endOffset }
      : { node: cursorNode, offset: cursorNode.childNodes.length }
    const after = wrapIfNonEmpty(cursorNode, cursorOffset, afterEnd.node, afterEnd.offset)

    if (!isNil(after)) {
      lastWrapper = after
    }
  }

  root.normalize()

  return lastWrapper
}

export const CustomWysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  ({ value, onChange, disabled, width, height, placeholder }, ref): React.JSX.Element => {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [hasFocus, setHasFocus] = useState(false)
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
    const [codeViewOpen, setCodeViewOpen] = useState(false)
    const inlineLeadToken = useRef(Math.random().toString(36).slice(2))
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

      // an undo of a code-view change brings its lead back along with the content it replaced —
      // removing it here, right as the undo is emitted, is measured not to disturb redo
      dropInlineLead(content, inlineLeadToken.current)

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

      // the field itself is never replaced — a list item sitting directly in it, as source-view
      // HTML can put there, makes the field the list to repair — only its contents are
      if (target === content) {
        range.selectNodeContents(target)
      } else {
        range.selectNode(target)
      }

      selection.removeAllRanges()
      selection.addRange(range)
      doc.execCommand('insertHTML', false, target === content ? draft.innerHTML : draft.outerHTML)
    }

    /**
     * Like {@link mutateWithHistory}, but replaces only the children `from` (inclusive) to `to`
     * (exclusive) of `container`, leaving the container itself in place.
     *
     * What the replaced range *begins* with decides how the browser reinserts: a range starting
     * with a heading or a list keeps that block as a shell and pulls everything that follows it
     * inside — a field's second paragraph ends up nested in its first heading. A range that
     * starts inside a block, or with inline nodes, is written back as given. Replacing one
     * block's own contents, or one run of inline nodes between blocks, therefore never begins with
     * a block. It also keeps the container as a live reference, so a position worked out against
     * the clone resolves against it once committed. One reshaping remains, and is left as it is:
     * an attribute-less div wrapping blocks at the very end of the field is dropped as redundant
     * by the browser, its children staying in place — the wrapper it uses as its own paragraph
     * separator, and nothing a reader can see.
     *
     * `mutate` gets a clone of the span alone — nothing outside it is there to be moved, so the
     * span's own indices cannot drift — and may return where to leave the caret, in terms of that
     * clone. A span the mutation left as it was is not written back at all: that would only add
     * an undo step with nothing in it. Returns the caret position resolved against the live
     * container, if it can still be found there.
     */
    const commitSpan = (
      container: HTMLElement,
      from: number,
      to: number,
      mutate: (draft: HTMLElement) => CaretAnchor | undefined
    ): { node: Node, offset: number | null } | null => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection)) {
        return null
      }

      const doc = content.ownerDocument
      const draft = doc.createElement('div')

      for (let index = from; index < to; index++) {
        draft.appendChild(container.childNodes[index].cloneNode(true))
      }

      const before = draft.innerHTML
      const anchor = mutate(draft)

      if (draft.innerHTML === before) {
        return null
      }

      const anchorNode = isNil(anchor) ? null : 'after' in anchor ? anchor.after : anchor.within
      const anchorPath = isNil(anchorNode) ? null : nodePath(draft, anchorNode)

      const range = doc.createRange()

      range.setStart(container, from)
      range.setEnd(container, to)
      selection.removeAllRanges()
      selection.addRange(range)
      doc.execCommand('insertHTML', false, draft.innerHTML)

      if (isNil(anchor) || isNil(anchorPath) || anchorPath.length === 0) {
        return null
      }

      // the clone's children sit at `from` onwards in the container; should the commit above
      // have reshaped anything on the way in, the path may no longer lead anywhere
      const node = nodeAtPath(container, [anchorPath[0] + from, ...anchorPath.slice(1)])

      return isNil(node) ? null : { node, offset: 'after' in anchor ? null : anchor.offset }
    }

    interface UnitPlan {
      container: HTMLElement
      from: number
      to: number
      startPath: number[]
      startOffset: number
      endPath: number[]
      endOffset: number
    }

    /**
     * Applies `mutate` to the part of the field `range` reaches and commits it in as few, as
     * narrow, spans as the browser handles cleanly — see {@link commitSpan}.
     *
     * The deepest block holding both ends of the range is the container to work in (the field
     * itself when there is none); {@link spansToCommit} splits it into the spans to write back. A
     * container beginning with inline nodes goes back whole: there is no block for the browser to
     * make a shell of, and an inline run written back on its own picks up a stray <br> before the
     * block that follows it.
     *
     * `mutate` runs once per span on a clone of that span, with the range clipped to it and
     * located in the clone, and `locate` finding the clone of any live node within the span. It
     * returns where to leave the caret, if anywhere in particular. Returns the node that position
     * refers to for the last span in document order — the caret ends up there, or at the end of
     * that span when it named none.
     */
    const commitAround = (
      range: Range,
      mutate: (draft: HTMLElement, draftRange: Range, locate: (node: Node) => Node | null) => CaretAnchor | undefined
    ): Node | null => {
      const content = contentRef.current
      const selection = content?.ownerDocument.defaultView?.getSelection()

      if (isNil(content) || isNil(selection)) {
        return null
      }

      const doc = content.ownerDocument
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      const startLeaf = descendForward(startContainer, startOffset)
      const endLeaf = descendBackward(endContainer, endOffset)
      const container = closestSharedBlock(startLeaf.node, endLeaf.node, content) ?? content

      // the range clipped to a span and located as paths — worked out for every unit before
      // anything is committed, since writing one span back detaches the nodes the range's
      // boundaries point into
      const plan = (unitContainer: HTMLElement, from: number, to: number): UnitPlan => {
        const start = isBeforePosition(doc, startContainer, startOffset, unitContainer, from)
          ? { node: unitContainer as Node, offset: from }
          : { node: startContainer, offset: startOffset }
        const end = isBeforePosition(doc, unitContainer, to, endContainer, endOffset)
          ? { node: unitContainer as Node, offset: to }
          : { node: endContainer, offset: endOffset }

        return {
          container: unitContainer,
          from,
          to,
          startPath: nodePath(unitContainer, start.node),
          startOffset: start.offset,
          endPath: nodePath(unitContainer, end.node),
          endOffset: end.offset
        }
      }

      const plans = spansToCommit(container, range).map((span) => plan(span.container, span.from, span.to))

      const commitPlan = (unit: UnitPlan): { node: Node, offset: number | null } | null =>
        commitSpan(unit.container, unit.from, unit.to, (draft) => {
          // a position in the container, as the clone of just its span sees it: the span's first
          // child is the clone's first, and the container itself stands in for the clone
          const inDraft = (path: number[], offset: number): { node: Node | null, offset: number } => path.length === 0
            ? { node: draft, offset: offset - unit.from }
            : { node: nodeAtPath(draft, [path[0] - unit.from, ...path.slice(1)]), offset }
          const locate = (node: Node): Node | null => inDraft(nodePath(unit.container, node), 0).node
          const start = inDraft(unit.startPath, unit.startOffset)
          const end = inDraft(unit.endPath, unit.endOffset)

          if (isNil(start.node) || isNil(end.node)) {
            return undefined
          }

          const draftRange = doc.createRange()

          draftRange.setStart(start.node, start.offset)
          draftRange.setEnd(end.node, end.offset)

          return mutate(draft, draftRange, locate)
        })

      // last to first: writing an inline run back can change how many nodes it holds, which
      // would shift the indices of everything after it
      const [last, ...earlier] = [...plans].reverse()

      if (isNil(last)) {
        return null
      }

      // the node after the last unit's span, held on to while the others are committed: the
      // caret falls back to just before it when the unit yields nothing to place the caret after
      const afterLast: ChildNode | null = last.container.childNodes[last.to] ?? null
      const caret = commitPlan(last)

      earlier.forEach((unit) => { commitPlan(unit) })

      const caretRange = doc.createRange()

      if (!isNil(caret) && !isNil(caret.offset)) {
        caretRange.setStart(caret.node, caret.offset)
      } else if (!isNil(caret)) {
        caretRange.setStartAfter(caret.node)
      } else {
        const afterIndex = isNil(afterLast) ? -1 : Array.prototype.indexOf.call(last.container.childNodes, afterLast)

        caretRange.setStart(last.container, afterIndex >= 0 ? afterIndex : last.container.childNodes.length)
      }

      caretRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caretRange)

      return caret?.node ?? null
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
        // unwrap the whole marked run — a simplification the "basic formatting" scope allows.
        // Committed the same way as a wrap: replacing the live element itself through insertHTML
        // would promote the plain space beside it to &nbsp;, exactly as wrapping used to.
        const markRange = doc.createRange()

        markRange.selectNode(existingMark)
        commitAround(markRange, (draft, _draftRange, locate) => {
          const draftMark = locate(existingMark)

          if (!(draftMark instanceof HTMLElement)) {
            return undefined
          }

          const children = Array.from(draftMark.childNodes)
          const last = children[children.length - 1]

          draftMark.replaceWith(...children)

          if (isNil(last)) {
            return undefined
          }

          if (!(last instanceof Text)) {
            draft.normalize()

            return { after: last }
          }

          // The text set free now sits between text nodes, and all of them come back from the
          // commit as one — so the caret is kept as an offset into that run, measured from the
          // first node of it, which is the one `normalize` keeps.
          let run: Text = last
          let offset = last.length

          while (run.previousSibling instanceof Text) {
            run = run.previousSibling
            offset += run.length
          }

          draft.normalize()

          return { within: run, offset }
        })
      } else if (range.collapsed) {
        // no selection to wrap — let the browser handle "type the next characters marked"
        doc.execCommand(mark)
      } else {
        // Wrapping the selection directly through execCommand risks a browser quirk: replacing a
        // range that sits next to a plain space, or that spans a whole text node, can leave that
        // space — or an empty text node split off in its place — turned into a real &nbsp;, one a
        // reader never typed. Building the wrap on a detached clone with the plain Range API
        // avoids the browser's own insertHTML behaviour entirely; committing the finished result
        // keeps undo and redo reverting and replaying that exact result rather than an
        // intermediate one, and lets the caret return to where the selection was.
        const wrapper = commitAround(range, (draft, draftRange) => {
          const wrapper = wrapRangeByBlock(doc, draft, draftRange, INLINE_MARKS[mark].tag)

          // A list the browser left beside its item rather than inside it does not survive being
          // written back intact. The same repair the stored value already gets is applied to the
          // clone first, so the shape being committed is one the reparse can keep, and it lands
          // in this same undoable step.
          normalizeNestedLists(draft)

          return isNil(wrapper) ? undefined : { after: wrapper }
        })

        // To the browser's typing style, a caret directly after the new element is still inside
        // it, so the rest of the sentence would come out marked as well. Switched off again with
        // the same command the collapsed branch above uses to switch it on — unless the
        // surroundings render the mark by themselves, a heading's weight say, where "off" would
        // mean a span{font-weight:normal} around the next characters rather than plain text.
        if (!isNil(wrapper) && queryState(doc, mark) && !isMarkInherited(wrapper, mark)) {
          doc.execCommand(mark)
        }
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
      setCodeViewOpen(false)

      const content = contentRef.current

      if (isNil(content)) {
        return
      }

      const doc = content.ownerDocument
      const parsed = doc.createElement('div')

      parsed.innerHTML = edited

      // nothing changed: writing it back anyway would add an undo step with nothing in it
      if (parsed.innerHTML === content.innerHTML) {
        return
      }

      focusContent()

      // Written back as one undoable step rather than assigned to the DOM: an assignment is
      // invisible to undo, and leaves the browser's earlier undo entries pointing at nodes that
      // no longer exist. The inline lead goes in front first, whatever the field begins with, so
      // the replaced range never begins with a block the browser would keep as a shell.
      content.insertBefore(createInlineLead(doc, inlineLeadToken.current), content.firstChild)

      mutateWithHistory(content, (draft) => { draft.innerHTML = edited })
      emitChange()
      refreshFormatState()
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
