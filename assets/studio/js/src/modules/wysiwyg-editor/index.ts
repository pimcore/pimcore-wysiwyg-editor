/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
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
