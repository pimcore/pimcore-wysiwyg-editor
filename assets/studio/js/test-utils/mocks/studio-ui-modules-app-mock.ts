/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

// Mock of the federated `@pimcore/studio-ui-bundle/modules/app` entry point. Tests that need a
// particular setting assign it on this object before rendering.
export const settingsMock: Record<string, unknown> = {}

export const useSettings = (): Record<string, unknown> => settingsMock
