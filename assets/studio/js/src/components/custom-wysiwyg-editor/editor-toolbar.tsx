/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React, { useEffect, useState } from 'react'
import { Button, Input, Popover, Select, Tooltip } from 'antd'
import { useTranslation } from '@pimcore/studio-ui-bundle/app'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { type FormatState, type InlineMark } from './use-editor-selection'
import {
  BlockquoteIcon,
  BoldIcon,
  ClearFormatIcon,
  CodeViewIcon,
  HorizontalRuleIcon,
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
  onToggleMark,
  onIndent,
  onInsertLink,
  linkPopoverOpen,
  onLinkPopoverOpenChange,
  onOpenCodeView,
  onPasteAsPlainText
}: EditorToolbarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { styles, cx } = useStyles()
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')

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
            className={ cx(editsLink && styles.toolbarButtonActive) }
            icon={ <LinkIcon /> }
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
