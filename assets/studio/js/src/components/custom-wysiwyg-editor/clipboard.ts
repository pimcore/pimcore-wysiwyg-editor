/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

/**
 * The clipboard's plain-text flavour, or null when the browser will not hand it over.
 *
 * Reading the clipboard is only possible in a secure context, from a user gesture, and after the
 * user has granted it — otherwise the API is missing or rejects. Both cases mean the same to a
 * caller: the text cannot be had this way, so it must tell the user rather than silently do nothing.
 */
export const readClipboardText = async (clipboard: Partial<Pick<Clipboard, 'readText'>> | undefined): Promise<string | null> => {
  if (typeof clipboard?.readText !== 'function') {
    return null
  }

  try {
    return await clipboard.readText()
  } catch {
    return null
  }
}
