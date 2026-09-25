/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

import { readClipboardText } from './clipboard'

describe('readClipboardText', () => {
  it('returns the clipboard text when the browser hands it over', async () => {
    const clipboard = { readText: jest.fn().mockResolvedValue('plain words') }

    await expect(readClipboardText(clipboard)).resolves.toBe('plain words')
  })

  it('returns null when the browser offers no clipboard API', async () => {
    await expect(readClipboardText(undefined)).resolves.toBeNull()
  })

  it('returns null when the browser has no readText', async () => {
    await expect(readClipboardText({})).resolves.toBeNull()
  })

  it('returns null when the browser refuses access', async () => {
    const clipboard = { readText: jest.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')) }

    await expect(readClipboardText(clipboard)).resolves.toBeNull()
  })
})
