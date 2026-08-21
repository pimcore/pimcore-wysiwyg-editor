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
import {
  BlockquoteIcon,
  BoldIcon,
  ClearFormatIcon,
  CodeViewIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  UnorderedListIcon
} from './toolbar-icons'

export interface EditorToolbarProps {
  onCommand: (command: string, argument?: string) => void
  onInsertLink: (url: string, text: string) => void
  codeView: boolean
  onToggleCodeView: () => void
}

const BLOCK_OPTIONS = [
  { value: 'p', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' }
]

export const EditorToolbar = ({ onCommand, onInsertLink, codeView, onToggleCodeView }: EditorToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { styles } = useStyles()
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
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
    setLinkPopoverOpen(false)
  }

  const formatButton = (icon: React.ReactNode, tooltip: string, command: string, argument?: string): React.JSX.Element => (
    <Tooltip title={ tooltip }>
      <Button
        aria-label={ tooltip }
        disabled={ codeView }
        icon={ icon }
        onClick={ () => { onCommand(command, argument) } }
        onMouseDown={ preventFocusSteal }
        size="small"
        type="text"
      />
    </Tooltip>
  )

  return (
    <div
      className={ styles.toolbar }
      onMouseDown={ preventFocusSteal }
    >
      <Select
        disabled={ codeView }
        onChange={ (value: string) => { onCommand('formatBlock', value) } }
        options={ BLOCK_OPTIONS }
        placeholder={ t('wysiwyg-editor.toolbar.block-format') }
        popupMatchSelectWidth={ false }
        size="small"
        value={ undefined }
        variant="borderless"
      />

      <div className={ styles.toolbarDivider } />

      { formatButton(<BoldIcon />, t('wysiwyg-editor.toolbar.bold'), 'bold') }
      { formatButton(<ItalicIcon />, t('wysiwyg-editor.toolbar.italic'), 'italic') }

      <div className={ styles.toolbarDivider } />

      { formatButton(<UnorderedListIcon />, t('wysiwyg-editor.toolbar.unordered-list'), 'insertUnorderedList') }
      { formatButton(<OrderedListIcon />, t('wysiwyg-editor.toolbar.ordered-list'), 'insertOrderedList') }
      { formatButton(<BlockquoteIcon />, t('wysiwyg-editor.toolbar.blockquote'), 'formatBlock', 'blockquote') }

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
        onOpenChange={ setLinkPopoverOpen }
        open={ linkPopoverOpen && !codeView }
        trigger="click"
      >
        <Tooltip title={ t('wysiwyg-editor.toolbar.link') }>
          <Button
            aria-label={ t('wysiwyg-editor.toolbar.link') }
            disabled={ codeView }
            icon={ <LinkIcon /> }
            size="small"
            type="text"
          />
        </Tooltip>
      </Popover>

      <div className={ styles.toolbarDivider } />

      { formatButton(<ClearFormatIcon />, t('wysiwyg-editor.toolbar.remove-format'), 'removeFormat') }

      <Tooltip title={ t('wysiwyg-editor.toolbar.code-view') }>
        <Button
          aria-label={ t('wysiwyg-editor.toolbar.code-view') }
          icon={ <CodeViewIcon /> }
          onClick={ onToggleCodeView }
          onMouseDown={ preventFocusSteal }
          size="small"
          type={ codeView ? 'primary' : 'text' }
        />
      </Tooltip>
    </div>
  )
}
