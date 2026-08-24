/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React, { useState } from 'react'
import { Button, Input, Popover, Select, Space, Tooltip } from 'antd'
import { useTranslation } from '@pimcore/studio-ui-bundle/app'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { type FormatState } from './use-editor-selection'
import {
  BlockquoteIcon,
  BoldIcon,
  ClearFormatIcon,
  CodeViewIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  RedoIcon,
  UndoIcon,
  UnorderedListIcon
} from './toolbar-icons'

export interface EditorToolbarProps {
  formatState: FormatState
  onCommand: (command: string, argument?: string) => void
  onInsertLink: (url: string, text: string) => void
  linkPopoverOpen: boolean
  onLinkPopoverOpenChange: (open: boolean) => void
  onOpenCodeView: () => void
}

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
  onInsertLink,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  onOpenCodeView
}: EditorToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { styles, cx } = useStyles()
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

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

  const toolbarButton = (
    icon: React.ReactNode,
    tooltip: string,
    onClick: () => void,
    active = false
  ): React.JSX.Element => (
    <Tooltip title={ tooltip }>
      <Button
        aria-label={ tooltip }
        aria-pressed={ active }
        className={ cx(active && styles.toolbarButtonActive) }
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
    active = false,
    argument?: string
  ): React.JSX.Element => toolbarButton(icon, tooltip, () => { onCommand(command, argument) }, active)

  const blockValue = BLOCK_OPTIONS.some((option) => option.value === formatState.block)
    ? formatState.block
    : undefined

  return (
    <div
      className={ styles.toolbar }
      onMouseDown={ preventFocusSteal }
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

      { formatButton(<BoldIcon />, t('wysiwyg-editor.toolbar.bold'), 'bold', formatState.bold) }
      { formatButton(<ItalicIcon />, t('wysiwyg-editor.toolbar.italic'), 'italic', formatState.italic) }

      <div className={ styles.toolbarDivider } />

      { formatButton(<UnorderedListIcon />, t('wysiwyg-editor.toolbar.unordered-list'), 'insertUnorderedList', formatState.unorderedList) }
      { formatButton(<OrderedListIcon />, t('wysiwyg-editor.toolbar.ordered-list'), 'insertOrderedList', formatState.orderedList) }
      { formatButton(<BlockquoteIcon />, t('wysiwyg-editor.toolbar.blockquote'), 'formatBlock', formatState.blockquote, 'blockquote') }

      <div className={ styles.toolbarDivider } />

      <Popover
        content={
          <Space direction="vertical">
            <Input
              onChange={ (event) => { setLinkUrl(event.target.value) } }
              onPressEnter={ handleInsertLink }
              placeholder={ t('wysiwyg-editor.link.url') }
              size="small"
              value={ linkUrl }
            />
            <Input
              onChange={ (event) => { setLinkText(event.target.value) } }
              onPressEnter={ handleInsertLink }
              placeholder={ t('wysiwyg-editor.link.text') }
              size="small"
              value={ linkText }
            />
            <Button
              onClick={ handleInsertLink }
              size="small"
              type="primary"
            >
              { t('wysiwyg-editor.link.insert') }
            </Button>
          </Space>
        }
        onOpenChange={ onLinkPopoverOpenChange }
        open={ linkPopoverOpen }
        trigger="click"
      >
        <Tooltip title={ t('wysiwyg-editor.toolbar.link') }>
          <Button
            aria-label={ t('wysiwyg-editor.toolbar.link') }
            icon={ <LinkIcon /> }
            size="small"
            type="text"
          />
        </Tooltip>
      </Popover>

      <div className={ styles.toolbarDivider } />

      { formatButton(<ClearFormatIcon />, t('wysiwyg-editor.toolbar.remove-format'), 'removeFormat') }
      { toolbarButton(<CodeViewIcon />, t('wysiwyg-editor.toolbar.code-view'), onOpenCodeView) }
    </div>
  )
}
