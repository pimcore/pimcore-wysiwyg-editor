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
import { fireEvent, render, screen } from '@testing-library/react'
import { EditorToolbar, type EditorToolbarProps } from './editor-toolbar'

const renderToolbar = (overrides: Partial<EditorToolbarProps> = {}): EditorToolbarProps => {
  const props: EditorToolbarProps = {
    formatState: {
      bold: false,
      italic: false,
      unorderedList: false,
      orderedList: false,
      blockquote: false,
      canIndent: false,
      canOutdent: false,
      hasSelection: false
    },
    onCommand: jest.fn(),
    onToggleMark: jest.fn(),
    onIndent: jest.fn(),
    onInsertLink: jest.fn(),
    linkPopoverOpen: false,
    onLinkPopoverOpenChange: jest.fn(),
    onOpenCodeView: jest.fn(),
    onPasteAsPlainText: jest.fn(),
    ...overrides
  }

  render(<EditorToolbar { ...props } />)

  return props
}

describe('EditorToolbar', () => {
  it('pastes as plain text the moment the button is clicked', () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.paste-plain-text' }))

    expect(props.onPasteAsPlainText).toHaveBeenCalledTimes(1)
  })

  it('offers paste as plain text as an action, not as a toggle', () => {
    renderToolbar()

    const button = screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.paste-plain-text' })

    fireEvent.click(button)

    // the attribute's presence alone declares a toggle to assistive technology
    expect(button).not.toHaveAttribute('aria-pressed')
  })

  it('still exposes a formatting button as a toggle', () => {
    renderToolbar()

    expect(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.bold' })).toHaveAttribute('aria-pressed')
  })

  it('inserts a horizontal rule when the button is clicked', () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.horizontal-rule' }))

    expect(props.onCommand).toHaveBeenCalledTimes(1)
    expect(props.onCommand).toHaveBeenCalledWith('insertHorizontalRule', undefined)
  })

  it('offers the horizontal rule as an action, not as a toggle', () => {
    renderToolbar()

    expect(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.horizontal-rule' })).not.toHaveAttribute('aria-pressed')
  })
})
