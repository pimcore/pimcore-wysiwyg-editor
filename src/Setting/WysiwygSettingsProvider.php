<?php
declare(strict_types=1);

/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

namespace Pimcore\Bundle\WysiwygEditor\Setting;

use Pimcore\Bundle\StudioBackendBundle\Setting\Provider\SettingsProviderInterface;

/**
 * Hands the configured persistence format to the Studio frontend, which converts between markdown
 * and HTML accordingly.
 *
 * @internal
 */
if (interface_exists(SettingsProviderInterface::class)) {
    final readonly class WysiwygSettingsProvider implements SettingsProviderInterface
    {
        public const SETTING_PERSISTENCE_FORMAT = 'wysiwyg_editor_persistence_format';

        public function __construct(
            private string $persistenceFormat
        ) {
        }

        public function getSettings(): array
        {
            return [
                self::SETTING_PERSISTENCE_FORMAT => $this->persistenceFormat,
            ];
        }
    }
}
