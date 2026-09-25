/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
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
