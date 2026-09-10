/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

// Mock of the federated `@pimcore/studio-ui-bundle/modules/app` entry point. Tests that need a
// particular setting assign it on this object before rendering.
export const settingsMock: Record<string, unknown> = {}

export const useSettings = (): Record<string, unknown> => settingsMock
