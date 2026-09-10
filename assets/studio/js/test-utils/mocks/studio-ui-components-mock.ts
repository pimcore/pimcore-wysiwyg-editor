/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

// Mock of the federated `@pimcore/studio-ui-bundle/components` entry point. Messages are recorded
// instead of shown, so tests can assert what the user would have been told.
export const messageMock = {
  info: jest.fn(),
  success: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}

export const useMessage = (): typeof messageMock => messageMock

export const createImageThumbnailUrl = (assetId: number): string => `/thumbnail/${assetId}`

export const CodeEditor = (): null => null
