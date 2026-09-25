/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */

// Mock of the federated `@pimcore/studio-ui-bundle/app` entry point. `t` echoes the key back so
// tests assert against translation keys rather than a locale's wording.
export const useTranslation = (): { t: (key: string) => string } => ({
  t: (key: string) => key
})
