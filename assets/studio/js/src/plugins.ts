/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import { type IAbstractPlugin } from '@pimcore/studio-ui-bundle'
import { WysiwygEditorModule } from './modules/wysiwyg-editor'

if (module.hot !== undefined) {
  module.hot.accept()
}

export const WysiwygEditorPlugin: IAbstractPlugin = {
  name: 'pimcore-wysiwyg-editor-plugin',

  onStartup: ({ moduleSystem }): void => {
    moduleSystem.registerModule(WysiwygEditorModule)
  }
}
