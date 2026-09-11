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

  describe('with the caret inside an existing link', () => {
    const renderWithLink = (): EditorToolbarProps => renderToolbar({
      linkPopoverOpen: true,
      formatState: {
        bold: false,
        italic: false,
        unorderedList: false,
        orderedList: false,
        blockquote: false,
        canIndent: false,
        canOutdent: false,
        hasSelection: true,
        linkUrl: 'https://old.example'
      }
    })

    it('opens the popover with the current URL filled in', () => {
      renderWithLink()

      expect(screen.getByPlaceholderText('wysiwyg-editor.link.url')).toHaveValue('https://old.example')
    })

    it('exposes the active state to assistive technology, like the other stateful controls', () => {
      renderWithLink()

      expect(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers to update rather than insert, and asks for no link text', () => {
      renderWithLink()

      expect(screen.getByRole('button', { name: 'wysiwyg-editor.link.update' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'wysiwyg-editor.link.insert' })).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('wysiwyg-editor.link.text')).not.toBeInTheDocument()
    })

    it('hands the changed URL back', () => {
      const props = renderWithLink()

      fireEvent.change(screen.getByPlaceholderText('wysiwyg-editor.link.url'), { target: { value: 'https://new.example' } })
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.link.update' }))

      expect(props.onInsertLink).toHaveBeenCalledWith('https://new.example', expect.any(String))
    })
  })

  it('opens the popover empty when the caret is not in a link', () => {
    renderToolbar({ linkPopoverOpen: true })

    expect(screen.getByPlaceholderText('wysiwyg-editor.link.url')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'wysiwyg-editor.link.insert' })).toBeInTheDocument()
  })

  it('reports the link button as not pressed when the caret is not in a link', () => {
    renderToolbar()

    expect(screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.link' })).toHaveAttribute('aria-pressed', 'false')
  })
})
