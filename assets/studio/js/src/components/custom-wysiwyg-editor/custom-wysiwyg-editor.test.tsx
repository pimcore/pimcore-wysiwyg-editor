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
const installExecCommand = (content: HTMLElement): jest.Mock => {
  const history: string[] = []
  const future: string[] = []

  const execCommand = jest.fn((command: string, _ui?: boolean, argument?: string) => {
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
})
