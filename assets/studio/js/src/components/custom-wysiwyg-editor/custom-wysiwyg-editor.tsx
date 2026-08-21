/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { type WysiwygEditorRef, type WysiwygProps } from '@pimcore/studio-ui-bundle/modules/wysiwyg'
import { CodeEditor, type DragAndDropInfo } from '@pimcore/studio-ui-bundle/components'
import { escapeHtml, pasteHtmlAtCaret, toCssDimension } from '@pimcore/studio-ui-bundle/utils'
import { isNil } from 'lodash'
import { useStyles } from './custom-wysiwyg-editor.styles'
import { EditorToolbar } from './editor-toolbar'

const LINKABLE_DOCUMENT_TYPES = ['page', 'hardlink', 'link']

export const CustomWysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  ({ value, onChange, disabled, width, height, placeholder }, ref): React.JSX.Element => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [codeView, setCodeView] = useState(false)
    const { styles } = useStyles()

    const valueIsEmpty = isNil(value) || value.trim() === '' || value === '<p></p>' || value === '<br>'

    useImperativeHandle(ref, (): WysiwygEditorRef => ({
      onDrop: (info: DragAndDropInfo): void => {
        handleElementDrop(info)
      }
    }))

    useEffect(() => {
      if (!codeView && !isNil(contentRef.current) && contentRef.current.innerHTML !== (value ?? '')) {
        contentRef.current.innerHTML = value ?? ''
      }
    }, [value, codeView])

    const emitChange = (): void => {
      if (!isNil(contentRef.current)) {
        onChange?.(contentRef.current.innerHTML)
      }
    }

    const handleInput = (): void => {
      emitChange()
    }

    const focusContent = (): void => {
      const content = contentRef.current
      if (isNil(content)) {
        return
      }

      content.focus()

      const selection = window.getSelection()
      const caretIsInside = !isNil(selection) &&
        selection.rangeCount > 0 &&
        content.contains(selection.getRangeAt(0).commonAncestorContainer)

      if (!caretIsInside && !isNil(selection)) {
        const range = document.createRange()
        range.selectNodeContents(content)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }

    const handleCommand = (command: string, argument?: string): void => {
      if (disabled === true || codeView) {
        return
      }

      focusContent()
      // deliberately kept on the deprecated-but-universal execCommand API to stay dependency-free
      document.execCommand(command, false, argument)
      emitChange()
    }

    const insertHtml = (html: string): void => {
      if (disabled === true || codeView) {
        return
      }

      focusContent()
      pasteHtmlAtCaret(html, window)
      emitChange()
    }

    const handleInsertLink = (url: string, text: string): void => {
      insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`)
    }

    const handleElementDrop = (info: DragAndDropInfo): void => {
      if (disabled === true || codeView) {
        return
      }

      const data = info.data
      if (isNil(data?.id) || isNil(data?.fullPath)) {
        return
      }

      if (info.type === 'document' && !LINKABLE_DOCUMENT_TYPES.includes(String(data.type))) {
        return
      }

      const pimcoreType = info.type === 'data-object' ? 'object' : info.type

      const selection = window.getSelection()
      const selectedText = !isNil(selection) &&
        !isNil(contentRef.current) &&
        selection.rangeCount > 0 &&
        contentRef.current.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.toString()
        : ''

      const linkText = selectedText !== '' ? selectedText : String(data.key ?? data.fullPath)

      insertHtml(
        `<a href="${escapeHtml(String(data.fullPath))}" pimcore_id="${escapeHtml(String(data.id))}" pimcore_type="${escapeHtml(pimcoreType)}">${escapeHtml(linkText)}</a>`
      )
    }

    const handleToggleCodeView = (): void => {
      setCodeView((current) => !current)
    }

    return (
      <div
        className={ styles.wrapper }
        style={ { maxWidth: toCssDimension(width) } }
      >
        <EditorToolbar
          codeView={ codeView }
          onCommand={ handleCommand }
          onInsertLink={ handleInsertLink }
          onToggleCodeView={ handleToggleCodeView }
        />

        { codeView
          ? (
            <div className={ styles.codeView }>
              <CodeEditor
                onChange={ (newValue: string) => { onChange?.(newValue) } }
                preset="html"
                readOnly={ disabled }
                value={ value ?? '' }
              />
            </div>
            )
          : (
            <div
              className={ styles.content }
              contentEditable={ disabled !== true }
              data-empty={ valueIsEmpty }
              data-placeholder={ placeholder }
              onInput={ handleInput }
              ref={ contentRef }
              style={ { minHeight: toCssDimension(height) } }
            />
            ) }
      </div>
    )
  }
)

CustomWysiwygEditor.displayName = 'CustomWysiwygEditor'

export default CustomWysiwygEditor
