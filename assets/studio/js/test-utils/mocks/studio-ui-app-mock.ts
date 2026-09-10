/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

// Mock of the federated `@pimcore/studio-ui-bundle/app` entry point. `t` echoes the key back so
// tests assert against translation keys rather than a locale's wording.
export const useTranslation = (): { t: (key: string) => string } => ({
  t: (key: string) => key
})
