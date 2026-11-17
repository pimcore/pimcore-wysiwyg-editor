/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import React, { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Popover, Select, Tooltip } from 'antd'
import { useTranslation } from '@pimcore/studio-ui-bundle/app'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { type FormatState, type InlineMark } from './use-editor-selection'
import { useStickyToolbar } from './sticky-toolbar'
import {
  BlockquoteIcon,
  BoldIcon,
  ClearFormatIcon,
  CodeViewIcon,
  HorizontalRuleIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  IndentIcon,
  OrderedListIcon,
  OutdentIcon,
  PastePlainTextIcon,
  RedoIcon,
  UndoIcon,
  UnorderedListIcon
} from './toolbar-icons'

export interface EditorToolbarProps {
  formatState: FormatState
  onCommand: (command: string, argument?: string) => void
  onToggleMark: (mark: InlineMark) => void
  onIndent: (command: 'indent' | 'outdent') => void
  onInsertLink: (url: string, text: string) => void
  linkPopoverOpen: boolean
  onLinkPopoverOpenChange: (open: boolean) => void
  onOpenCodeView: () => void
  onPasteAsPlainText: () => void
  imagePopoverOpen: boolean
  onImagePopoverOpenChange: (open: boolean) => void
  /** the asset picked to insert, or to replace the selected image with */
  chosenImageAsset?: ImageAsset
  /** asks for an image asset to insert, or to replace the selected image with */
  onChooseImageAsset: () => void
  onApplyImage: (changes: ImageChanges) => void
}

/** A size to give the selected image; a side left out is not set, so the image keeps its proportions on it. */
export interface ImageSize {
  width?: number
  height?: number
}

/** An image asset picked in the element selector. */
export interface ImageAsset {
  id: number
  fullPath: string
  filename: string
  /** a thumbnail of the asset the editor can show */
  previewUrl: string
}

/** What the image popover hands back: the new image, if one was picked, and its details. */
export interface ImageChanges {
  asset?: ImageAsset
  alt: string
  size: ImageSize
}

/** The width an inserted image starts at at most, matching an image dropped from the tree. */
const DEFAULT_IMAGE_WIDTH = 600

const BLOCK_OPTIONS = [
  { value: 'p', labelKey: 'wysiwyg-editor.block.paragraph' },
  { value: 'h1', labelKey: 'wysiwyg-editor.block.heading-1' },
  { value: 'h2', labelKey: 'wysiwyg-editor.block.heading-2' },
  { value: 'h3', labelKey: 'wysiwyg-editor.block.heading-3' },
  { value: 'h4', labelKey: 'wysiwyg-editor.block.heading-4' },
  { value: 'h5', labelKey: 'wysiwyg-editor.block.heading-5' },
  { value: 'h6', labelKey: 'wysiwyg-editor.block.heading-6' }
]

export const EditorToolbar = ({
  formatState,
  onCommand,
  onToggleMark,
  onIndent,
  onInsertLink,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  onOpenCodeView,
  onPasteAsPlainText,
  imagePopoverOpen,
  onImagePopoverOpenChange,
  chosenImageAsset,
  onChooseImageAsset,
  onApplyImage
}: EditorToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { styles, cx } = useStyles()
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [imageWidth, setImageWidth] = useState<number | null>(null)
  const [imageHeight, setImageHeight] = useState<number | null>(null)
  const [keepProportions, setKeepProportions] = useState(true)
  const [imageAlt, setImageAlt] = useState('')
  // the proportions of the image file shown in the popover, once it has loaded
  const [previewRatio, setPreviewRatio] = useState<number | undefined>(undefined)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useStickyToolbar(toolbarRef)

  // the caret sits in a link, so the popover changes that link rather than adding one
  const editsLink = formatState.linkUrl !== undefined

  // the fields start from the link under the caret each time the popover opens, otherwise a link
  // could only be changed by retyping its address in the source view
  useEffect(() => {
    if (linkPopoverOpen) {
      setLinkUrl(formatState.linkUrl ?? '')
      setLinkText('')
    }
  }, [linkPopoverOpen, formatState.linkUrl])

  const image = formatState.image
  // an image is selected, so the popover changes it rather than inserting one
  const editsImage = image !== undefined
  // a newly picked file brings its own proportions, which are known once its preview has loaded
  const aspectRatio = previewRatio ?? (chosenImageAsset === undefined ? image?.aspectRatio : undefined)
  // proportions the image's own size does not reveal cannot be kept
  const keepsProportions = keepProportions && aspectRatio !== undefined
  const imagePopoverShown = imagePopoverOpen && (editsImage || chosenImageAsset !== undefined)

  // The fields start from the selected image each time the popover opens, or empty for an image
  // about to be inserted. The image is read only then, so changing the fields does not jump back to
  // the selection's state.
  useEffect(() => {
    if (!imagePopoverShown) {
      return
    }

    setPreviewRatio(undefined)
    setKeepProportions(true)

    if (image !== undefined) {
      setImageWidth(image.width ?? null)
      setImageHeight(image.height ?? null)
      setImageAlt(image.alt ?? '')
    } else {
      setImageWidth(null)
      setImageHeight(null)
      setImageAlt(chosenImageAsset?.filename ?? '')
    }
  }, [imagePopoverShown, chosenImageAsset])

  /**
   * A newly picked image starts at its own size, up to the width a dropped image gets; one replacing
   * the selected image keeps the width it is shown at and follows the new file's proportions.
   */
  const handlePreviewLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth, naturalHeight } = event.currentTarget

    if (chosenImageAsset === undefined || naturalWidth <= 0 || naturalHeight <= 0) {
      return
    }

    const ratio = naturalWidth / naturalHeight
    const width = imageWidth ?? (editsImage ? null : Math.min(naturalWidth, DEFAULT_IMAGE_WIDTH))

    setPreviewRatio(ratio)

    if (width !== null && keepProportions) {
      setImageWidth(width)
      setImageHeight(Math.max(1, Math.round(width / ratio)))
    }
  }

  const toPixels = (value: string): number | null => {
    const pixels = Math.round(Number(value))

    return value.trim() !== '' && Number.isFinite(pixels) && pixels > 0 ? pixels : null
  }

  const handleImageWidthChange = (value: string): void => {
    const width = toPixels(value)
    const ratio = aspectRatio

    setImageWidth(width)

    if (keepsProportions && width !== null && ratio !== undefined) {
      setImageHeight(Math.max(1, Math.round(width / ratio)))
    }
  }

  const handleImageHeightChange = (value: string): void => {
    const height = toPixels(value)
    const ratio = aspectRatio

    setImageHeight(height)

    if (keepsProportions && height !== null && ratio !== undefined) {
      setImageWidth(Math.max(1, Math.round(height * ratio)))
    }
  }

  /**
   * With the proportions kept, only one side is stored and the other follows from the image
   * itself — both on the page and in the thumbnail Pimcore generates from it, which scales by that
   * side instead of resizing to a box. Empty fields drop the size altogether.
   */
  const handleApplyImage = (): void => {
    const size: ImageSize = {}

    if (keepsProportions && imageWidth !== null) {
      size.width = imageWidth
    } else if (keepsProportions && imageHeight !== null) {
      size.height = imageHeight
    } else {
      size.width = imageWidth ?? undefined
      size.height = imageHeight ?? undefined
    }

    onApplyImage({ asset: chosenImageAsset, alt: imageAlt.trim(), size })
    onImagePopoverOpenChange(false)
  }

  // keep the contentEditable selection alive while clicking toolbar controls
  const preventFocusSteal = (event: React.MouseEvent): void => {
    event.preventDefault()
  }

  const handleInsertLink = (): void => {
    if (linkUrl.trim() === '') {
      return
    }

    onInsertLink(linkUrl.trim(), linkText.trim() !== '' ? linkText.trim() : linkUrl.trim())
    setLinkUrl('')
    setLinkText('')
    onLinkPopoverOpenChange(false)
  }

  // `active` is only passed for a toggle: the mere presence of aria-pressed declares one to
  // assistive technology, so an action button must not carry it at all
  const toolbarButton = (
    icon: React.ReactNode,
    tooltip: string,
    onClick: () => void,
    active?: boolean,
    disabled = false
  ): React.JSX.Element => (
    <Tooltip title={ tooltip }>
      <Button
        aria-label={ tooltip }
        aria-pressed={ active }
        className={ cx(active === true && styles.toolbarButtonActive) }
        disabled={ disabled }
        icon={ icon }
        onClick={ onClick }
        onMouseDown={ preventFocusSteal }
        size="small"
        type="text"
      />
    </Tooltip>
  )

  const formatButton = (
    icon: React.ReactNode,
    tooltip: string,
    command: string,
    active?: boolean,
    argument?: string
  ): React.JSX.Element => toolbarButton(icon, tooltip, () => { onCommand(command, argument) }, active)

  const blockValue = BLOCK_OPTIONS.some((option) => option.value === formatState.block)
    ? formatState.block
    : undefined

  return (
    <div
      className={ styles.toolbar }
      onMouseDown={ preventFocusSteal }
      ref={ toolbarRef }
    >
      { toolbarButton(<UndoIcon />, t('wysiwyg-editor.toolbar.undo'), () => { onCommand('undo') }) }
      { toolbarButton(<RedoIcon />, t('wysiwyg-editor.toolbar.redo'), () => { onCommand('redo') }) }

      <div className={ styles.toolbarDivider } />

      <Select
        onChange={ (value: string) => { onCommand('formatBlock', value) } }
        options={ BLOCK_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) })) }
        placeholder={ t('wysiwyg-editor.toolbar.block-format') }
        popupMatchSelectWidth={ false }
        size="small"
        value={ blockValue }
        variant="borderless"
      />

      <div className={ styles.toolbarDivider } />

      { toolbarButton(<BoldIcon />, t('wysiwyg-editor.toolbar.bold'), () => { onToggleMark('bold') }, formatState.bold) }
      { toolbarButton(<ItalicIcon />, t('wysiwyg-editor.toolbar.italic'), () => { onToggleMark('italic') }, formatState.italic) }

      <div className={ styles.toolbarDivider } />

      { formatButton(<UnorderedListIcon />, t('wysiwyg-editor.toolbar.unordered-list'), 'insertUnorderedList', formatState.unorderedList) }
      { formatButton(<OrderedListIcon />, t('wysiwyg-editor.toolbar.ordered-list'), 'insertOrderedList', formatState.orderedList) }
      { toolbarButton(<IndentIcon />, t('wysiwyg-editor.toolbar.indent'), () => { onIndent('indent') }, undefined, !formatState.canIndent) }
      { toolbarButton(<OutdentIcon />, t('wysiwyg-editor.toolbar.outdent'), () => { onIndent('outdent') }, undefined, !formatState.canOutdent) }
      { formatButton(<BlockquoteIcon />, t('wysiwyg-editor.toolbar.blockquote'), 'formatBlock', formatState.blockquote, 'blockquote') }
      { formatButton(<HorizontalRuleIcon />, t('wysiwyg-editor.toolbar.horizontal-rule'), 'insertHorizontalRule') }

      <div className={ styles.toolbarDivider } />

      <Popover
        content={
          // The popover renders in a portal, but React still bubbles its events through the React
          // tree - so without this the toolbar's preventDefault below reaches these inputs and they
          // can never take focus, leaving the fields impossible to type into.
          <div
            className={ styles.linkPopover }
            onMouseDown={ (event) => { event.stopPropagation() } }
          >
            <Input
              autoFocus
              onChange={ (event) => { setLinkUrl(event.target.value) } }
              onPressEnter={ handleInsertLink }
              placeholder={ t('wysiwyg-editor.link.url') }
              size="small"
              value={ linkUrl }
            />
            { !formatState.hasSelection && !editsLink && (
              <Input
                onChange={ (event) => { setLinkText(event.target.value) } }
                onPressEnter={ handleInsertLink }
                placeholder={ t('wysiwyg-editor.link.text') }
                size="small"
                value={ linkText }
              />
            ) }
            <div className={ styles.linkPopoverActions }>
              <Button
                disabled={ linkUrl.trim() === '' }
                onClick={ handleInsertLink }
                size="small"
                type="primary"
              >
                { t(editsLink ? 'wysiwyg-editor.link.update' : 'wysiwyg-editor.link.insert') }
              </Button>
            </div>
          </div>
        }
        onOpenChange={ onLinkPopoverOpenChange }
        open={ linkPopoverOpen }
        trigger="click"
      >
        <Tooltip title={ t('wysiwyg-editor.toolbar.link') }>
          <Button
            aria-label={ t('wysiwyg-editor.toolbar.link') }
            aria-pressed={ editsLink }
            className={ cx(editsLink && styles.toolbarButtonActive) }
            icon={ <LinkIcon /> }
            size="small"
            type="text"
          />
        </Tooltip>
      </Popover>

      <Popover
        content={
          // stops the toolbar's preventDefault from reaching the fields, as for the link popover
          <div
            className={ styles.linkPopover }
            onMouseDown={ (event) => { event.stopPropagation() } }
          >
            <img
              alt=""
              className={ styles.imagePreview }
              onLoad={ handlePreviewLoad }
              src={ chosenImageAsset?.previewUrl ?? image?.src }
            />
            <Button
              onClick={ onChooseImageAsset }
              size="small"
            >
              { t('wysiwyg-editor.image.choose-other') }
            </Button>
            <Input
              aria-label={ t('wysiwyg-editor.image.alt') }
              onChange={ (event) => { setImageAlt(event.target.value) } }
              onPressEnter={ handleApplyImage }
              placeholder={ t('wysiwyg-editor.image.alt') }
              size="small"
              value={ imageAlt }
            />
            <Input
              addonAfter="px"
              aria-label={ t('wysiwyg-editor.image.width') }
              autoFocus
              min={ 1 }
              onChange={ (event) => { handleImageWidthChange(event.target.value) } }
              onPressEnter={ handleApplyImage }
              placeholder={ t('wysiwyg-editor.image.width') }
              size="small"
              step={ 1 }
              type="number"
              value={ imageWidth ?? '' }
            />
            <Input
              addonAfter="px"
              aria-label={ t('wysiwyg-editor.image.height') }
              min={ 1 }
              onChange={ (event) => { handleImageHeightChange(event.target.value) } }
              onPressEnter={ handleApplyImage }
              placeholder={ t('wysiwyg-editor.image.height') }
              size="small"
              step={ 1 }
              type="number"
              value={ imageHeight ?? '' }
            />
            <Checkbox
              checked={ keepsProportions }
              disabled={ aspectRatio === undefined }
              onChange={ (event) => { setKeepProportions(event.target.checked) } }
            >
              { t('wysiwyg-editor.image.keep-proportions') }
            </Checkbox>
            <div className={ styles.linkPopoverActions }>
              <Button
                onClick={ handleApplyImage }
                size="small"
                type="primary"
              >
                { t(editsImage ? 'wysiwyg-editor.image.apply' : 'wysiwyg-editor.image.insert') }
              </Button>
            </div>
          </div>
        }
        onOpenChange={ (open) => {
          // with no image selected, the button starts by picking one, the way the classic editors'
          // image dialogs start from the image's source
          if (open && !editsImage && chosenImageAsset === undefined) {
            onChooseImageAsset()
          } else {
            onImagePopoverOpenChange(open)
          }
        } }
        open={ imagePopoverShown }
        trigger="click"
      >
        <Tooltip title={ t('wysiwyg-editor.toolbar.image') }>
          <Button
            aria-label={ t('wysiwyg-editor.toolbar.image') }
            icon={ <ImageIcon /> }
            size="small"
            type="text"
          />
        </Tooltip>
      </Popover>

      <div className={ styles.toolbarDivider } />

      { formatButton(<ClearFormatIcon />, t('wysiwyg-editor.toolbar.remove-format'), 'removeFormat') }
      { toolbarButton(<PastePlainTextIcon />, t('wysiwyg-editor.toolbar.paste-plain-text'), onPasteAsPlainText) }
      { toolbarButton(<CodeViewIcon />, t('wysiwyg-editor.toolbar.code-view'), onOpenCodeView) }
    </div>
  )
}
