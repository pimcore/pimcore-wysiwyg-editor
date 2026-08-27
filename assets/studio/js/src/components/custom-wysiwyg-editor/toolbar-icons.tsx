/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import React from 'react'

interface ToolbarIconProps {
  children: React.ReactNode
}

const ToolbarIcon = ({ children }: ToolbarIconProps): React.JSX.Element => (
  <svg
    fill="none"
    height="14"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    style={ { display: 'block' } }
    viewBox="0 0 24 24"
    width="14"
  >
    { children }
  </svg>
)

export const BoldIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </ToolbarIcon>
)

export const ItalicIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <line x1="19" x2="10" y1="4" y2="4" />
    <line x1="14" x2="5" y1="20" y2="20" />
    <line x1="15" x2="9" y1="4" y2="20" />
  </ToolbarIcon>
)

export const UnorderedListIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <line x1="9" x2="21" y1="6" y2="6" />
    <line x1="9" x2="21" y1="12" y2="12" />
    <line x1="9" x2="21" y1="18" y2="18" />
    <line x1="4" x2="4.01" y1="6" y2="6" />
    <line x1="4" x2="4.01" y1="12" y2="12" />
    <line x1="4" x2="4.01" y1="18" y2="18" />
  </ToolbarIcon>
)

export const OrderedListIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M11 6h9" />
    <path d="M11 12h9" />
    <path d="M11 18h9" />
    <path d="M4 16a2 2 0 1 1 4 0c0 .591-.5 1-1 1.5L4 20h4" />
    <path d="M6 10V4L4 6" />
  </ToolbarIcon>
)

export const IndentIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <polyline points="3 8 7 12 3 16" />
    <line x1="21" x2="11" y1="6" y2="6" />
    <line x1="21" x2="11" y1="12" y2="12" />
    <line x1="21" x2="11" y1="18" y2="18" />
  </ToolbarIcon>
)

export const OutdentIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <polyline points="7 8 3 12 7 16" />
    <line x1="21" x2="11" y1="6" y2="6" />
    <line x1="21" x2="11" y1="12" y2="12" />
    <line x1="21" x2="11" y1="18" y2="18" />
  </ToolbarIcon>
)

export const BlockquoteIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M9 9h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8.5a2 2 0 0 1 2-2" />
    <path d="M3 9h1a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5a2 2 0 0 1 2-2" />
    <path d="M15 11h6" />
    <path d="M15 7h6" />
    <path d="M3 15h18" />
    <path d="M3 19h18" />
  </ToolbarIcon>
)

export const LinkIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </ToolbarIcon>
)

export const ClearFormatIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M17 15l4 4" />
    <path d="M21 15l-4 4" />
    <path d="M7 6V5h11v1" />
    <path d="M7 19h4" />
    <path d="M13 5L9 19" />
  </ToolbarIcon>
)

export const UndoIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </ToolbarIcon>
)

export const RedoIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </ToolbarIcon>
)

export const PastePlainTextIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <rect height="4" rx="1" width="8" x="8" y="2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6" />
    <path d="M12 12v6" />
  </ToolbarIcon>
)

export const CodeViewIcon = (): React.JSX.Element => (
  <ToolbarIcon>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </ToolbarIcon>
)
