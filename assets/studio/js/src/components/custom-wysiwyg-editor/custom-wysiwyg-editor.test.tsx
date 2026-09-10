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

/** jsdom has no execCommand; this stand-in mimics the browser so the emitted value reflects the edit. */
const installExecCommand = (content: HTMLElement): jest.Mock => {
  const execCommand = jest.fn((command: string, _ui?: boolean, argument?: string) => {
    if (command === 'insertText' && argument !== undefined) {
      content.append(argument)
    }

    if (command === 'insertHorizontalRule') {
      content.append(content.ownerDocument.createElement('hr'))
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

const renderEditor = (): { onChange: jest.Mock, content: HTMLElement } => {
  const onChange = jest.fn()
  const { container } = render(
    <CustomWysiwygEditor
      onChange={ onChange }
      value="<p>kept</p>"
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
