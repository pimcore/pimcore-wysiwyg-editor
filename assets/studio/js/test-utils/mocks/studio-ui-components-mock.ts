/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
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
