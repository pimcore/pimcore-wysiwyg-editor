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
import { Modal } from 'antd'
import { CodeEditor } from '@pimcore/studio-ui-bundle/components'
import { useTranslation } from '@pimcore/studio-ui-bundle/app'
import { useStyles } from './custom-wysiwyg-editor.styles'

export interface CodeViewModalProps {
  open: boolean
  value: string
  readOnly?: boolean
  onCancel: () => void
  onApply: (value: string) => void
}

export const CodeViewModal = ({ open, value, readOnly = false, onCancel, onApply }: CodeViewModalProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { styles } = useStyles()
  const [draft, setDraft] = useState(value)

  // the modal edits a draft so cancelling leaves the field untouched
  useEffect(() => {
    if (open) {
      setDraft(value)
    }
  }, [open, value])

  return (
    <Modal
      cancelText={ t('wysiwyg-editor.code-view.cancel') }
      destroyOnClose
      okButtonProps={ { disabled: readOnly } }
      okText={ t('wysiwyg-editor.code-view.apply') }
      onCancel={ onCancel }
      onOk={ () => { onApply(draft) } }
      open={ open }
      title={ t('wysiwyg-editor.code-view.title') }
      width={ 800 }
    >
      <div className={ styles.codeView }>
        <CodeEditor
          lineWrapping
          onChange={ setDraft }
          preset="html"
          readOnly={ readOnly }
          value={ draft }
        />
      </div>
    </Modal>
  )
}
