/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { EditorToolbar, type EditorToolbarProps } from './editor-toolbar'
import { type FormatState } from './use-editor-selection'

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
    imagePopoverOpen: false,
    onImagePopoverOpenChange: jest.fn(),
    onChooseImageAsset: jest.fn(),
    onApplyImage: jest.fn(),
    ...overrides
  }

  render(<EditorToolbar { ...props } />)

  return props
}

describe('EditorToolbar', () => {
  describe('in a field longer than its scroll container', () => {
    const getToolbar = (): HTMLElement => {
      const toolbar = screen.getByRole('button', { name: 'wysiwyg-editor.toolbar.undo' }).parentElement

      if (toolbar === null) {
        throw new Error('toolbar not found')
      }

      return toolbar
    }

    it('keeps the toolbar at the top edge while the content scrolls', () => {
      renderToolbar()

      const style = getComputedStyle(getToolbar())

      expect(style.position).toBe('sticky')
      expect(style.top).toBe('0px')
    })

    it('paints the toolbar over the content scrolling beneath it', () => {
      renderToolbar()

      const style = getComputedStyle(getToolbar())

      expect(style.backgroundColor).not.toBe('')
      expect(style.backgroundColor).not.toBe('transparent')
      expect(Number(style.zIndex)).toBeGreaterThan(0)
    })
  })

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

  describe('image', () => {
    const IMAGE_BUTTON = 'wysiwyg-editor.toolbar.image'
    const ASSET = { id: 9, fullPath: '/photos/x.jpg', filename: 'x.jpg', previewUrl: '/thumbnail/9' }

    const formatStateWithImage = (image: FormatState['image']): FormatState => ({
      bold: false,
      italic: false,
      unorderedList: false,
      orderedList: false,
      blockquote: false,
      canIndent: false,
      canOutdent: false,
      hasSelection: true,
      image
    })

    const widthField = (): HTMLElement => screen.getByRole('spinbutton', { name: 'wysiwyg-editor.image.width' })
    const heightField = (): HTMLElement => screen.getByRole('spinbutton', { name: 'wysiwyg-editor.image.height' })
    const typeInto = (field: HTMLElement, value: string): void => {
      fireEvent.change(field, { target: { value } })
    }

    it('starts by picking an image when none is selected', () => {
      const props = renderToolbar()

      fireEvent.click(screen.getByRole('button', { name: IMAGE_BUTTON }))

      expect(props.onChooseImageAsset).toHaveBeenCalledTimes(1)
      expect(props.onImagePopoverOpenChange).not.toHaveBeenCalled()
    })

    it('opens the popover for a selected image instead of picking another one', () => {
      const props = renderToolbar({ formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 }) })

      fireEvent.click(screen.getByRole('button', { name: IMAGE_BUTTON }))

      expect(props.onImagePopoverOpenChange).toHaveBeenCalledWith(true)
      expect(props.onChooseImageAsset).not.toHaveBeenCalled()
    })

    it('opens with the size the image is shown at', () => {
      renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      expect(widthField()).toHaveValue(600)
      expect(heightField()).toHaveValue(400)
      expect(screen.getByRole('checkbox', { name: 'wysiwyg-editor.image.keep-proportions' })).toBeChecked()
    })

    it('opens with the alternative text of the selected image and a preview of it', () => {
      renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ src: '/thumbnail/3', alt: 'Stage', width: 600, height: 400, aspectRatio: 1.5 })
      })

      expect(screen.getByRole('textbox', { name: 'wysiwyg-editor.image.alt' })).toHaveValue('Stage')
      expect(document.querySelector('img')).toHaveAttribute('src', '/thumbnail/3')
      expect(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' })).toBeInTheDocument()
    })

    it('stays closed when no image is selected or picked, even if asked to open', () => {
      renderToolbar({ imagePopoverOpen: true })

      expect(screen.queryByRole('spinbutton', { name: 'wysiwyg-editor.image.width' })).not.toBeInTheDocument()
    })

    it('follows a changed width with the height while keeping the proportions', () => {
      renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      typeInto(widthField(), '300')

      expect(heightField()).toHaveValue(200)
    })

    it('follows a changed height with the width while keeping the proportions', () => {
      renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      typeInto(heightField(), '100')

      expect(widthField()).toHaveValue(150)
    })

    it('hands back only the width while keeping the proportions, so the height follows the image', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      typeInto(widthField(), '300')
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' }))

      expect(props.onApplyImage).toHaveBeenCalledWith({ asset: undefined, alt: '', size: { width: 300 } })
      expect(props.onImagePopoverOpenChange).toHaveBeenCalledWith(false)
    })

    it('hands back both sides as entered once the proportions are released', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      fireEvent.click(screen.getByRole('checkbox', { name: 'wysiwyg-editor.image.keep-proportions' }))
      typeInto(widthField(), '300')
      typeInto(heightField(), '300')
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' }))

      expect(props.onApplyImage).toHaveBeenCalledWith(expect.objectContaining({ size: { width: 300, height: 300 } }))
    })

    it('hands back no size at all when both fields are cleared', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      typeInto(widthField(), '')
      typeInto(heightField(), '')
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' }))

      expect(props.onApplyImage).toHaveBeenCalledWith(expect.objectContaining({ size: {} }))
    })

    it('cannot keep proportions it does not know, and then stores both sides as entered', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600 })
      })

      const checkbox = screen.getByRole('checkbox', { name: 'wysiwyg-editor.image.keep-proportions' })

      expect(checkbox).toBeDisabled()
      expect(checkbox).not.toBeChecked()

      typeInto(heightField(), '200')
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' }))

      expect(props.onApplyImage).toHaveBeenCalledWith(expect.objectContaining({ size: { width: 600, height: 200 } }))
    })

    it('hands back the changed alternative text', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ alt: 'old', width: 600, height: 400, aspectRatio: 1.5 })
      })

      typeInto(screen.getByRole('textbox', { name: 'wysiwyg-editor.image.alt' }), ' Stage at night ')
      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.apply' }))

      expect(props.onApplyImage).toHaveBeenCalledWith(expect.objectContaining({ alt: 'Stage at night' }))
    })

    it('offers to pick another image for the selected one', () => {
      const props = renderToolbar({
        imagePopoverOpen: true,
        formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
      })

      fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.choose-other' }))

      expect(props.onChooseImageAsset).toHaveBeenCalledTimes(1)
    })

    describe('with an image picked to insert', () => {
      const loadPreview = (naturalWidth: number, naturalHeight: number): void => {
        const preview = document.querySelector('img')

        if (preview === null) {
          throw new Error('preview not found')
        }

        Object.defineProperty(preview, 'naturalWidth', { value: naturalWidth })
        Object.defineProperty(preview, 'naturalHeight', { value: naturalHeight })
        fireEvent.load(preview)
      }

      it('shows the picked image and starts with its file name as alternative text', () => {
        renderToolbar({ imagePopoverOpen: true, chosenImageAsset: ASSET })

        expect(document.querySelector('img')).toHaveAttribute('src', '/thumbnail/9')
        expect(screen.getByRole('textbox', { name: 'wysiwyg-editor.image.alt' })).toHaveValue('x.jpg')
        expect(screen.getByRole('button', { name: 'wysiwyg-editor.image.insert' })).toBeInTheDocument()
      })

      it('starts at the image\'s own size once it has loaded', () => {
        renderToolbar({ imagePopoverOpen: true, chosenImageAsset: ASSET })

        loadPreview(400, 200)

        expect(widthField()).toHaveValue(400)
        expect(heightField()).toHaveValue(200)
      })

      it('starts no wider than a dropped image, keeping the proportions', () => {
        renderToolbar({ imagePopoverOpen: true, chosenImageAsset: ASSET })

        loadPreview(1200, 800)

        expect(widthField()).toHaveValue(600)
        expect(heightField()).toHaveValue(400)
      })

      it('hands back the picked image with its details', () => {
        const props = renderToolbar({ imagePopoverOpen: true, chosenImageAsset: ASSET })

        loadPreview(1200, 800)
        typeInto(widthField(), '300')
        fireEvent.click(screen.getByRole('button', { name: 'wysiwyg-editor.image.insert' }))

        expect(props.onApplyImage).toHaveBeenCalledWith({ asset: ASSET, alt: 'x.jpg', size: { width: 300 } })
        expect(props.onImagePopoverOpenChange).toHaveBeenCalledWith(false)
      })

      it('follows the picked file\'s proportions when it replaces the selected image', () => {
        renderToolbar({
          imagePopoverOpen: true,
          chosenImageAsset: ASSET,
          formatState: formatStateWithImage({ width: 600, height: 400, aspectRatio: 1.5 })
        })

        loadPreview(300, 300)

        expect(widthField()).toHaveValue(600)
        expect(heightField()).toHaveValue(600)
      })
    })
  })
})
