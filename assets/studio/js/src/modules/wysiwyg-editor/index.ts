/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import { type AbstractModule, container } from '@pimcore/studio-ui-bundle'
import { serviceIds } from '@pimcore/studio-ui-bundle/app'
import { type ComponentRegistry, componentConfig } from '@pimcore/studio-ui-bundle/modules/app'
import { CustomWysiwygEditor } from '../../components/custom-wysiwyg-editor/custom-wysiwyg-editor'

export const WysiwygEditorModule: AbstractModule = {
  onInit: (): void => {
    const componentRegistry = container.get<ComponentRegistry>(serviceIds['App/ComponentRegistry/ComponentRegistry'])

    componentRegistry.override({
      component: CustomWysiwygEditor,
      name: componentConfig.wysiwyg.editor.name
    })
  }
}
