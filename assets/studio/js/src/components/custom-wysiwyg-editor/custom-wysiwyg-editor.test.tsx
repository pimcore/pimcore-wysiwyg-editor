/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { messageMock } from '../../../test-utils/mocks/studio-ui-components-mock'
import { settingsMock } from '../../../test-utils/mocks/studio-ui-modules-app-mock'
import { CustomWysiwygEditor } from './custom-wysiwyg-editor'

const PASTE_BUTTON = 'wysiwyg-editor.toolbar.paste-plain-text'
const HORIZONTAL_RULE_BUTTON = 'wysiwyg-editor.toolbar.horizontal-rule'

const MUTATING_COMMANDS = ['insertText', 'insertHorizontalRule', 'insertHTML']

/**
 * jsdom has no execCommand; this stand-in mimics the browser closely enough for the emitted value,
 * and undo/redo, to reflect the edit: every mutating command snapshots the content first and clears
 * anything to redo, 'undo' restores the last snapshot (saving the current state to redo back to),
 * and 'redo' does the reverse — the way the real history the editor relies on would.
 */
const MARK_TAGS: Record<string, string[]> = { bold: ['B', 'STRONG'], italic: ['I', 'EM'] }

const installExecCommand = (content: HTMLElement): jest.Mock => {
  const history: string[] = []
  const future: string[] = []

  // Chrome carries an inline mark over to whatever is typed right after it: a caret directly
  // after a <b> reports bold as active, and a collapsed 'bold' command flips that typing style
  // without touching the document. Measured against Chrome directly.
  const typingStyle: Partial<Record<string, boolean>> = {}

  const inheritsMark = (command: string): boolean => {
    const selection = content.ownerDocument.getSelection()
    const tags = MARK_TAGS[command]

    if (selection === null || selection.rangeCount === 0 || tags === undefined) {
      return false
    }

    const { startContainer, startOffset } = selection.getRangeAt(0)
    let current: Node | null = startContainer.nodeType === Node.TEXT_NODE
      ? startContainer
      : startContainer.childNodes[startOffset - 1] ?? null

    while (current !== null && current !== content) {
      if (tags.includes(current.nodeName)) {
        return true
      }

      current = current.parentNode
    }

    return false
  }

  const queryCommandState = jest.fn((command: string): boolean => typingStyle[command] ?? inheritsMark(command))

  Object.defineProperty(document, 'queryCommandState', { value: queryCommandState, configurable: true })

  const execCommand = jest.fn((command: string, _ui?: boolean, argument?: string) => {
    if (command in MARK_TAGS && content.ownerDocument.getSelection()?.isCollapsed === true) {
      typingStyle[command] = !queryCommandState(command)

      return true
    }

    if (command === 'undo') {
      const previous = history.pop()

      if (previous !== undefined) {
        future.push(content.innerHTML)
        content.innerHTML = previous
      }

      return true
    }

    if (command === 'redo') {
      const next = future.pop()

      if (next !== undefined) {
        history.push(content.innerHTML)
        content.innerHTML = next
      }

      return true
    }

    if (MUTATING_COMMANDS.includes(command)) {
      history.push(content.innerHTML)
      future.length = 0
    }

    if (command === 'insertText' && argument !== undefined) {
      content.append(argument)
    }

    if (command === 'insertHorizontalRule') {
      content.append(content.ownerDocument.createElement('hr'))
    }

    if (command === 'insertHTML' && argument !== undefined) {
      const range = content.ownerDocument.getSelection()?.getRangeAt(0)

      // Reproduces what Chrome actually does, measured against it directly: replacing a
      // selection promotes a plain space immediately beside the result to &nbsp;, to keep that
      // position from collapsing against whatever was just inserted. Only ever the one character
      // on each side, and only when the replaced range did not already cover it. Without this,
      // nothing here would fail if the fix that avoids the behaviour were taken back out.
      // Done before the range is touched: the replacement is the same length, so the range's
      // offsets stay valid, whereas afterwards the boundary nodes have been shortened or split.
      if (range !== undefined) {
        const promote = (node: Node, index: number): void => {
          if (node.nodeType !== Node.TEXT_NODE) {
            return
          }

          const text = node as Text
          const at = index < 0 ? text.data.length + index : index

          if (text.data[at] === ' ') {
            text.data = text.data.slice(0, at) + '\u00a0' + text.data.slice(at + 1)
          }
        }

        // the character just before where the replacement starts, and just after where it ends
        if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
          const previous = range.startContainer.previousSibling

          if (previous !== null) {
            promote(previous, -1)
          }
        } else if (range.startContainer.nodeType === Node.TEXT_NODE) {
          promote(range.startContainer, range.startOffset - 1)
        }

        if (range.endContainer.nodeType === Node.TEXT_NODE) {
          promote(range.endContainer, range.endOffset)
        }
      }

      const template = content.ownerDocument.createElement('template')
      template.innerHTML = argument

      range?.deleteContents()
      range?.insertNode(template.content)
    }

    return true
  })

  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

  return execCommand
}

const installClipboard = (readText: (() => Promise<string>) | undefined): void => {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: readText === undefined ? undefined : { readText },
    configurable: true
  })
}

const renderEditor = (value = '<p>kept</p>'): { onChange: jest.Mock, content: HTMLElement } => {
  const onChange = jest.fn()
  const { container } = render(
    <CustomWysiwygEditor
      onChange={ onChange }
      value={ value }
    />
  )
  const content = container.querySelector('[contenteditable]')

  if (!(content instanceof HTMLElement)) {
    throw new Error('editor content not rendered')
  }

  // the toolbar only appears while the field is being worked on
  act(() => { fireEvent.focus(content) })

  return { onChange, content }
}

describe('CustomWysiwygEditor paste as plain text', () => {
  beforeEach(() => {
    settingsMock.wysiwyg_editor_persistence_format = 'html'
    messageMock.warning.mockClear()
  })

  it('inserts the clipboard text into the content when the button is clicked', async () => {
    installClipboard(async () => 'from word')
    const { onChange, content } = renderEditor()
    const execCommand = installExecCommand(content)

    fireEvent.click(screen.getByRole('button', { name: PASTE_BUTTON }))

    await waitFor(() => { expect(execCommand).toHaveBeenCalledWith('insertText', false, 'from word') })
    expect(onChange).toHaveBeenLastCalledWith('<p>kept</p>from word')
    expect(messageMock.warning).not.toHaveBeenCalled()
  })

  it('tells the user when the browser withholds the clipboard', async () => {
    installClipboard(async () => { throw new DOMException('denied', 'NotAllowedError') })
    const { onChange, content } = renderEditor()
    const execCommand = installExecCommand(content)

    fireEvent.click(screen.getByRole('button', { name: PASTE_BUTTON }))

    await waitFor(() => {
      expect(messageMock.warning).toHaveBeenCalledWith('wysiwyg-editor.toolbar.paste-plain-text-unavailable')
    })
    expect(execCommand).not.toHaveBeenCalledWith('insertText', expect.anything(), expect.anything())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves the content alone when the clipboard is empty', async () => {
    installClipboard(async () => '')
    const { onChange, content } = renderEditor()
    const execCommand = installExecCommand(content)
    const clipboard = window.navigator.clipboard as unknown as { readText: () => Promise<string> }
    const readText = jest.spyOn(clipboard, 'readText')

    fireEvent.click(screen.getByRole('button', { name: PASTE_BUTTON }))

    await waitFor(() => { expect(readText).toHaveBeenCalled() })
    expect(execCommand).not.toHaveBeenCalledWith('insertText', expect.anything(), expect.anything())
    expect(onChange).not.toHaveBeenCalled()
    expect(messageMock.warning).not.toHaveBeenCalled()
  })
})

describe('CustomWysiwygEditor horizontal rule', () => {
  it('inserts a rule through the browser command and emits the new value', () => {
    const { onChange, content } = renderEditor()
    const execCommand = installExecCommand(content)

    fireEvent.click(screen.getByRole('button', { name: HORIZONTAL_RULE_BUTTON }))

    expect(execCommand).toHaveBeenCalledWith('insertHorizontalRule', false, undefined)
    expect(onChange).toHaveBeenLastCalledWith('<p>kept</p><hr>')
  })
})

describe('CustomWysiwygEditor existing link', () => {
  /** Puts the caret into `node` and lets the selection hook notice, as a click in the browser would. */
  const placeCaretIn = (node: Node): void => {
    const range = document.createRange()
    range.setStart(node, 1)
    range.collapse(true)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    act(() => { document.dispatchEvent(new Event('selectionchange')) })
  }

  it('changes the link the caret sits in instead of inserting a second one', () => {
    const { onChange, content } = renderEditor(
      '<p>see <a href="https://old.example" pimcore_id="12" pimcore_type="document">orf</a></p>'
    )
    installExecCommand(content)
    const anchor = content.querySelector('a')

    if (anchor?.firstChild == null) {
      throw new Error('link not rendered')
    }

    placeCaretIn(anchor.firstChild)
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' }))

    const url = screen.getByPlaceholderText('wysiwyg-editor.link.url')
    expect(url).toHaveValue('https://old.example')

    fireEvent.change(url, { target: { value: 'https://new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.link.update' }))

    // the element attributes would make Pimcore rewrite the URL back to that element on output
    expect(onChange).toHaveBeenLastCalledWith('<p>see <a href="https://new.example">orf</a></p>')
  })

  it('undoes a link update back to the original address and Pimcore attributes', () => {
    const { content } = renderEditor(
      '<p>see <a href="https://old.example" pimcore_id="12" pimcore_type="document">orf</a></p>'
    )
    installExecCommand(content)
    const anchor = content.querySelector('a')

    if (anchor?.firstChild == null) {
      throw new Error('link not rendered')
    }

    placeCaretIn(anchor.firstChild)
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' }))
    fireEvent.change(screen.getByPlaceholderText('wysiwyg-editor.link.url'), { target: { value: 'https://new.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.link.update' }))

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.undo' }))

    const restored = content.querySelector('a')
    expect(restored).toHaveAttribute('href', 'https://old.example')
    expect(restored).toHaveAttribute('pimcore_id', '12')
    expect(restored).toHaveAttribute('pimcore_type', 'document')
  })

  it('keeps an element link intact when its address is confirmed unchanged', () => {
    const { onChange, content } = renderEditor(
      '<p>see <a href="https://old.example" pimcore_id="12" pimcore_type="document">orf</a></p>'
    )
    installExecCommand(content)
    const anchor = content.querySelector('a')

    if (anchor?.firstChild == null) {
      throw new Error('link not rendered')
    }

    placeCaretIn(anchor.firstChild)
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' }))
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.link.update' }))

    // the reference to the element is what Pimcore tracks; confirming the address must not lose it
    expect(content.querySelector('a')).toHaveAttribute('pimcore_id', '12')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not take a caret placed just before a link for a caret inside it', () => {
    const { content } = renderEditor('<p><a href="https://old.example">orf</a> and more</p>')
    installExecCommand(content)
    const paragraph = content.querySelector('p')

    if (paragraph == null) {
      throw new Error('content not rendered')
    }

    // offset 0 of the paragraph: before its first child, which is the link
    const range = document.createRange()
    range.setStart(paragraph, 0)
    range.collapse(true)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    act(() => { document.dispatchEvent(new Event('selectionchange')) })

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' }))

    expect(screen.getByPlaceholderText('wysiwyg-editor.link.url')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'wysiwyg-editor.link.insert' })).toBeInTheDocument()
  })

  it('treats a selection that runs out of the link as new text to link, not as that link', () => {
    const { content } = renderEditor('<p><a href="https://old.example">orf</a> and more</p>')
    installExecCommand(content)
    const anchorText = content.querySelector('a')?.firstChild
    const trailingText = content.querySelector('p')?.lastChild

    if (anchorText == null || trailingText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(anchorText, 1)
    range.setEnd(trailingText, 4)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    act(() => { document.dispatchEvent(new Event('selectionchange')) })

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' }))

    expect(screen.getByPlaceholderText('wysiwyg-editor.link.url')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'wysiwyg-editor.link.insert' })).toBeInTheDocument()
  })
})

describe('CustomWysiwygEditor nested numbering', () => {
  /** The rules antd-style injects for the editor, as one string. */
  const injectedCss = (): string =>
    Array.from(document.querySelectorAll('style')).map((style) => style.textContent ?? '').join('\n')

  it('numbers a nested ordered list by its parent item, as 1.1 rather than 1', () => {
    renderEditor('<ol><li>list<ol><li>item 1</li><li>item 2</li></ol></li></ol>')

    // the browser restarts every list at 1; the marker of a nested item has to carry its parents
    expect(injectedCss()).toMatch(/ol ol\s*>\s*li::marker\s*\{[^}]*counters\(list-item,\s*"\."\)/)
  })

  it('leaves the top level with a plain number and a dot', () => {
    renderEditor('<ol><li>list</li></ol>')

    expect(injectedCss()).not.toMatch(/(^|[^l] )ol\s*>\s*li::marker\s*\{[^}]*counters\(/)
  })
})

describe('CustomWysiwygEditor bold next to whitespace', () => {
  it('bolds the whole field without picking up a stray nbsp at either edge', () => {
    const { onChange, content } = renderEditor('<p>TEXT</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    // the entire text of the field, exactly as reported: nothing precedes or follows it
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, textNode.textContent?.length ?? 0)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p><b>TEXT</b></p>')
  })

  it('leaves real surrounding text, and any nbsp already there, untouched', () => {
    const { onChange, content } = renderEditor('<p>\u00a0TEXT more</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    // only "TEXT" is selected: real content — the leading nbsp and the trailing " more" — stays
    // on both sides, matching the reported case that already worked
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.setEnd(textNode, 5)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // .innerHTML serializes the literal nbsp character above as the &nbsp; entity text
    expect(onChange).toHaveBeenLastCalledWith('<p>&nbsp;<b>TEXT</b> more</p>')
  })

  it('cleans up only the side that touches the edge of the field', () => {
    const { onChange, content } = renderEditor('<p>TEXT more</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    // starts at the very beginning of the field, but real text follows the selection
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 4)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p><b>TEXT</b> more</p>')
  })

  it('leaves an ordinary partial selection within a longer sentence untouched', () => {
    const { onChange, content } = renderEditor('<p>some TEXT here</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 5)
    range.setEnd(textNode, 9)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p>some <b>TEXT</b> here</p>')
  })

  it('preserves an existing nbsp when the selection boundary is a whole element, not a text offset', () => {
    const { onChange, content } = renderEditor('<p><a href="https://example.com">Link</a> </p>')
    installExecCommand(content)
    const anchor = content.querySelector('a')

    if (anchor == null) {
      throw new Error('link not rendered')
    }

    // selecting the whole <a> gives a range whose boundary is a child-node index into <p>, not a
    // character offset into a text node
    const range = document.createRange()
    range.selectNode(anchor)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // .innerHTML serializes the pre-existing nbsp character as the &nbsp; entity text
    expect(onChange).toHaveBeenLastCalledWith('<p><b><a href="https://example.com">Link</a></b>&nbsp;</p>')
  })

  it('keeps the corrected spacing through both an undo and a following redo', () => {
    const { content } = renderEditor('<p>Before Bold After</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))
    expect(content.innerHTML).toBe('<p>Before <b>Bold</b> After</p>')

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.undo' }))
    expect(content.innerHTML).toBe('<p>Before Bold After</p>')

    // the correction is part of the one step undo just reverted, not a separate step layered on
    // top of it — so redo replays that same corrected result, never the browser's raw one
    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.redo' }))
    expect(content.innerHTML).toBe('<p>Before <b>Bold</b> After</p>')
  })

  it('leaves the caret right after the bolded word, not at the end of the field', () => {
    const { content } = renderEditor('<p>Before Bold After</p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    const after = document.getSelection()
    const afterRange = after?.rangeCount === 1 ? after.getRangeAt(0) : null
    const bold = content.querySelector('b')

    expect(afterRange?.collapsed).toBe(true)
    // right after the <b> element itself, inside the <p> — not inside the "After" text node.
    // <p>'s children are ["Before ", <b>, " After"]; offset 2 sits right after the <b> at index 1
    expect(afterRange?.startContainer).toBe(bold?.parentNode)
    expect(afterRange?.startOffset).toBe(2)
  })

  it('bolds a selection spanning two paragraphs as one run per paragraph', () => {
    const { onChange, content } = renderEditor('<p>First paragraph text</p><p>Second paragraph text</p>')
    installExecCommand(content)
    const paragraphs = content.querySelectorAll('p')
    const firstText = paragraphs[0].firstChild
    const secondText = paragraphs[1].firstChild

    if (firstText == null || secondText == null) {
      throw new Error('content not rendered')
    }

    // "paragraph text" through "Second" — crossing the boundary between the two blocks
    const range = document.createRange()
    range.setStart(firstText, 6)
    range.setEnd(secondText, 6)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // one <b> per paragraph, each holding only that paragraph's part of the selection; nothing
    // outside the original two paragraphs, and no block content nested inside either <b>
    expect(onChange).toHaveBeenLastCalledWith(
      '<p>First <b>paragraph text</b></p><p><b>Second</b> paragraph text</p>'
    )
  })

  it('bolds every paragraph independently when the whole field is selected', () => {
    const { onChange, content } = renderEditor('<p>First</p><p>Second</p>')
    installExecCommand(content)

    const range = document.createRange()
    range.selectNodeContents(content)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p><b>First</b></p><p><b>Second</b></p>')
  })

  it('bolds only the text of a single selected paragraph, not the paragraph element itself', () => {
    const { onChange, content } = renderEditor('<p>Only</p>')
    installExecCommand(content)

    const range = document.createRange()
    range.selectNodeContents(content)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p><b>Only</b></p>')
  })

  it('bolds across two div blocks the same way as two paragraphs', () => {
    const { onChange, content } = renderEditor('<div>First</div><div>Second</div>')
    installExecCommand(content)
    const divs = content.querySelectorAll('div')
    const firstText = divs[0].firstChild
    const secondText = divs[1].firstChild

    if (firstText == null || secondText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(firstText, 2)
    range.setEnd(secondText, 3)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<div>Fi<b>rst</b></div><div><b>Sec</b>ond</div>')
  })

  it('bolds each list item independently when the whole field is a list', () => {
    const { onChange, content } = renderEditor('<ul><li>one</li><li>two</li></ul>')
    installExecCommand(content)

    const range = document.createRange()
    range.selectNodeContents(content)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<ul><li><b>one</b></li><li><b>two</b></li></ul>')
  })

  it('does nothing, and does not throw, when the selection holds no text to format', () => {
    const { onChange, content } = renderEditor('<p></p>')
    installExecCommand(content)
    const paragraph = content.querySelector('p')

    if (paragraph == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))
    }).not.toThrow()

    expect(content.querySelector('b')).toBeNull()
  })

  it('does not throw when a void element is all that is selected', () => {
    const { content } = renderEditor('<p>text</p><hr>')
    const execCommand = installExecCommand(content)
    const rule = content.querySelector('hr')

    if (rule == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.selectNode(rule)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))
    }).not.toThrow()
    // nothing was marked, so there is no typing style to switch back off either
    expect(execCommand).not.toHaveBeenCalledWith('bold')
  })

  it('leaves a list the browser left inside a paragraph intact when bolding elsewhere', () => {
    // the shape execCommand('insertUnorderedList') produces from several paragraphs at once;
    // committing the whole field would orphan the list items were the draft not repaired first
    const { onChange, content } = renderEditor('<p><ul><li>one</li><li>two</li></ul></p><p>after</p>')
    installExecCommand(content)
    const lastParagraph = content.querySelectorAll('p')[content.querySelectorAll('p').length - 1]
    const afterText = lastParagraph?.firstChild

    if (afterText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(afterText, 0)
    range.setEnd(afterText, 5)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    const emitted = (onChange.mock.calls[onChange.mock.calls.length - 1] as [string])[0]

    // both items still inside the list, none orphaned next to it
    expect(emitted).toContain('<li>one</li>')
    expect(emitted).toContain('<li>two</li>')
    expect(emitted).toContain('<b>after</b>')
    expect(emitted.match(/<li>/g)).toHaveLength(2)
  })

  it('keeps a selection crossing two table cells inside each cell', () => {
    const { onChange, content } = renderEditor('<table><tbody><tr><td>one</td><td>two</td></tr></tbody></table>')
    installExecCommand(content)
    const cells = content.querySelectorAll('td')
    const firstText = cells[0].firstChild
    const secondText = cells[1].firstChild

    if (firstText == null || secondText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(firstText, 1)
    range.setEnd(secondText, 2)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // a table only ever reaches the field through the code view, so it is not a structure the
    // toolbar builds — but formatting across it must still not put a cell or row inside a <b>
    expect(onChange).toHaveBeenLastCalledWith(
      '<table><tbody><tr><td>o<b>ne</b></td><td><b>tw</b>o</td></tr></tbody></table>'
    )
  })

  it('keeps a selection crossing a paragraph and a pre inside each of them', () => {
    const { onChange, content } = renderEditor('<p>text</p><pre>code</pre>')
    installExecCommand(content)
    const paragraphText = content.querySelector('p')?.firstChild
    const preText = content.querySelector('pre')?.firstChild

    if (paragraphText == null || preText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(paragraphText, 2)
    range.setEnd(preText, 2)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<p>te<b>xt</b></p><pre><b>co</b>de</pre>')
  })

  it('bolds around a nested list sitting inside the same list item as both ends of the selection', () => {
    const { onChange, content } = renderEditor('<ul><li>before<ul><li>child</li></ul>after</li></ul>')
    installExecCommand(content)
    const outerLi = content.querySelector('li')
    const beforeText = outerLi?.firstChild
    const afterText = outerLi?.lastChild

    if (beforeText == null || afterText == null || afterText.textContent == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(beforeText, 0)
    range.setEnd(afterText, afterText.textContent.length)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // "before" and "after" each get their own <b>, and the nested list keeps its own structure —
    // "child" bolded inside it, rather than the whole <ul> ending up nested inside a <b>
    expect(onChange).toHaveBeenLastCalledWith(
      '<ul><li><b>before</b><ul><li><b>child</b></li></ul><b>after</b></li></ul>'
    )
  })
})

describe('CustomWysiwygEditor typing after a fresh mark', () => {
  const selectWord = (content: HTMLElement, blockSelector: string): void => {
    const textNode = content.querySelector(blockSelector)?.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  it.each([
    ['bold', 'b'],
    ['italic', 'i']
  ])('keeps what is typed right after a word just made %s plain', (mark, tag) => {
    const { content } = renderEditor('<p>Before Bold</p>')
    const execCommand = installExecCommand(content)
    selectWord(content, 'p')

    fireEvent.click(screen.getByRole('button', { name: `wysiwyg-editor.toolbar.${mark}` }))

    expect(content.innerHTML).toBe(`<p>Before <${tag}>Bold</${tag}></p>`)
    // the browser would carry the mark on to the next characters typed, turning the rest of the
    // sentence bold as well — the editor switches that typing style off again right away
    expect(execCommand).toHaveBeenLastCalledWith(mark)
    expect(document.queryCommandState(mark)).toBe(false)
  })

  it('leaves the typing style alone inside a heading that is bold by itself', () => {
    const style = document.createElement('style')
    style.textContent = 'h2 { font-weight: 700; }'
    document.head.appendChild(style)

    try {
      const { content } = renderEditor('<h2>Before Bold After</h2>')
      const execCommand = installExecCommand(content)
      const heading = content.querySelector('h2')

      if (heading == null) {
        throw new Error('content not rendered')
      }

      // the guard reads the computed style, so the rule above has to have reached the heading
      expect(getComputedStyle(heading).fontWeight).toBe('700')
      selectWord(content, 'h2')

      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

      expect(content.innerHTML).toBe('<h2>Before <b>Bold</b> After</h2>')
      // "off" here would not mean plain: the browser would wrap the next characters in a
      // span{font-weight:normal} to get below the heading's own weight
      expect(execCommand).not.toHaveBeenCalledWith('bold')
    } finally {
      style.remove()
    }
  })
})

describe('CustomWysiwygEditor commit granularity', () => {
  const select = (content: HTMLElement, startSelector: string, startOffset: number, endSelector: string, endOffset: number): void => {
    const startNode = content.querySelector(startSelector)?.firstChild
    const endNode = content.querySelector(endSelector)?.firstChild

    if (startNode == null || endNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const committedHtml = (execCommand: jest.Mock): string[] =>
    (execCommand.mock.calls as Array<[string, boolean?, string?]>)
      .filter(([command]) => command === 'insertHTML')
      .map(([, , argument]) => argument ?? '')

  // Writing the whole field back is what the browser mangles: a field beginning with a heading or
  // a list keeps that block as a shell and pulls everything after it inside. jsdom does not do
  // that, so these pin down what gets written back rather than the mangled result.
  it('writes back only the block the selection sits in, never the field around it', () => {
    const { onChange, content } = renderEditor('<h1>Test</h1><div>Test</div><div>Before Bold After</div>')
    const execCommand = installExecCommand(content)
    select(content, 'div:last-child', 7, 'div:last-child', 11)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<h1>Test</h1><div>Test</div><div>Before <b>Bold</b> After</div>')
    expect(committedHtml(execCommand)).toEqual(['Before <b>Bold</b> After'])
  })

  it('writes each paragraph back on its own when the selection spans two of them', () => {
    const { onChange, content } = renderEditor('<h1>Title</h1><p>First</p><p>Second</p>')
    const execCommand = installExecCommand(content)
    select(content, 'p', 0, 'p:last-child', 6)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<h1>Title</h1><p><b>First</b></p><p><b>Second</b></p>')
    // last paragraph first, so the earlier one's position is still what it was when measured
    expect(committedHtml(execCommand)).toEqual(['<b>Second</b>', '<b>First</b>'])
  })

  it('writes a run of inline nodes after a block back on its own', () => {
    const { onChange, content } = renderEditor('<h1>Title</h1>Before Bold After')
    const execCommand = installExecCommand(content)
    const textNode = content.querySelector('h1')?.nextSibling

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<h1>Title</h1>Before <b>Bold</b> After')
    expect(committedHtml(execCommand)).toEqual(['Before <b>Bold</b> After'])
  })

  it('writes the whole field back when it holds no block at all', () => {
    const { onChange, content } = renderEditor('Before Bold After')
    const execCommand = installExecCommand(content)
    const textNode = content.firstChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('Before <b>Bold</b> After')
    expect(committedHtml(execCommand)).toEqual(['Before <b>Bold</b> After'])
  })

  it('keeps the caret after the last bolded word when the selection spans blocks', () => {
    const { content } = renderEditor('<h1>Title</h1><p>First</p><p>Second</p>')
    installExecCommand(content)
    select(content, 'p', 0, 'p:last-child', 6)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    const after = document.getSelection()?.getRangeAt(0)
    const lastBold = content.querySelectorAll('b')[1]

    expect(after?.collapsed).toBe(true)
    expect(after?.startContainer).toBe(lastBold.parentNode)
    expect(after?.startOffset).toBe(1)
  })

  it('splits a shared block that itself begins with a block into units, never writing it back whole', () => {
    const { onChange, content } = renderEditor('<div><h1>Title</h1><p>First</p><p>Second</p></div>')
    const execCommand = installExecCommand(content)
    select(content, 'p', 0, 'p:last-child', 6)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(onChange).toHaveBeenLastCalledWith('<div><h1>Title</h1><p><b>First</b></p><p><b>Second</b></p></div>')
    expect(committedHtml(execCommand)).toEqual(['<b>Second</b>', '<b>First</b>'])
  })

  it('unwraps an existing mark through the enclosing block rather than replacing the element itself', () => {
    const { onChange, content } = renderEditor('<p>Before <b>Bold</b> After</p>')
    const execCommand = installExecCommand(content)
    const boldText = content.querySelector('b')?.firstChild

    if (boldText == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(boldText, 2)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    // replacing the <b> itself would sit the replacement between two plain spaces, and the
    // browser would promote them — the stub reproduces that, so the plain spaces prove the route
    expect(onChange).toHaveBeenLastCalledWith('<p>Before Bold After</p>')
    expect(committedHtml(execCommand)).toEqual(['Before Bold After'])
  })

  it('formats text inside a paragraph the browser left a list in by writing back only that text', () => {
    // <p><ul> cannot come out of the HTML parser, which closes the paragraph first; it only ever
    // arises from DOM operations, as execCommand('insertUnorderedList') performs them
    const { onChange, content } = renderEditor('<p>Before Bold After</p>')
    const execCommand = installExecCommand(content)
    const paragraph = content.querySelector('p')
    const list = document.createElement('ul')
    list.innerHTML = '<li>x</li>'
    paragraph?.insertBefore(list, paragraph.firstChild)
    const textNode = paragraph?.lastChild

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 7)
    range.setEnd(textNode, 11)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    expect(committedHtml(execCommand)).toEqual(['Before <b>Bold</b> After'])
    // the list is left where the browser put it in the live field (the stored value is repaired
    // separately); the written-back span never began with it
    expect(onChange).toHaveBeenLastCalledWith('<ul><li>x</li></ul><p>Before <b>Bold</b> After</p>')
    expect(content.innerHTML).toBe('<p><ul><li>x</li></ul>Before <b>Bold</b> After</p>')
  })

  it('leaves the caret at the end of the last selected block even when it held nothing to wrap', () => {
    const { content } = renderEditor('<p>text</p><p></p>')
    installExecCommand(content)
    const textNode = content.querySelector('p')?.firstChild
    const emptyParagraph = content.querySelectorAll('p')[1]

    if (textNode == null) {
      throw new Error('content not rendered')
    }

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(emptyParagraph, 0)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' }))

    const after = document.getSelection()?.getRangeAt(0)

    expect(content.innerHTML).toBe('<p><b>text</b></p><p></p>')
    expect(after?.collapsed).toBe(true)
    expect(after?.startContainer).toBe(emptyParagraph)
    expect(after?.startOffset).toBe(0)
  })
})
