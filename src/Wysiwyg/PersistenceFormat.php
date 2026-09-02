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

namespace Pimcore\Bundle\WysiwygEditor\Wysiwyg;

enum PersistenceFormat: string
{
    /** Container parameter the bundle's configuration is written to. */
    public const PARAMETER = 'pimcore_wysiwyg_editor.persistence_format';

    case Markdown = 'markdown';
    case Html = 'html';

    public static function default(): self
    {
        return self::Markdown;
    }

    /**
     * @return string[]
     */
    public static function values(): array
    {
        return array_map(static fn (self $case): string => $case->value, self::cases());
    }
}
