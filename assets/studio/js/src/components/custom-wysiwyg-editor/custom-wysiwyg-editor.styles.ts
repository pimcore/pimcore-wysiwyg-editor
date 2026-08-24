/**
 * Pimcore
 *
 * This source file is available under following license:
 * - GNU General Public License version 3 (GPLv3)
 *
 *  @copyright  Copyright (c) Pimcore GmbH (http://www.pimcore.org)
 *  @license    http://www.pimcore.org/license     GPLv3
 */

import { createStyles } from 'antd-style'

export const useStyles = createStyles(({ token }) => {
  return {
    wrapper: {
      border: `1px solid ${token.colorBorder}`,
      borderRadius: `${token.borderRadius}px`,
      backgroundColor: token.colorBgContainer,

      '&:focus-within': {
        borderColor: token.colorPrimary,
        boxShadow: `0 0 0 2px ${token.colorPrimaryBg}`
      }
    },

    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '4px',
      padding: '4px',
      borderBottom: `1px solid ${token.colorBorderSecondary}`
    },

    toolbarButtonActive: {
      color: token.colorPrimary,
      backgroundColor: token.controlItemBgActive,

      '&:hover': {
        backgroundColor: `${token.controlItemBgActiveHover} !important`
      }
    },

    toolbarDivider: {
      width: '1px',
      alignSelf: 'stretch',
      margin: '2px 4px',
      backgroundColor: token.colorBorderSecondary
    },

    content: {
      minHeight: '120px',
      padding: '8px 12px',
      outline: 'none',
      overflowWrap: 'break-word',

      '&[data-empty="true"]:before': {
        content: 'attr(data-placeholder)',
        color: token.colorTextPlaceholder,
        pointerEvents: 'none',
        position: 'absolute'
      },

      // Spelled out rather than left to the browser default: the surrounding application resets
      // list styling in places, and without markers and indentation of its own the editor cannot
      // show nesting at all.
      '& ol, & ul': {
        margin: '8px 0',
        paddingInlineStart: '24px'
      },

      '& ol': {
        listStyleType: 'decimal'
      },

      '& ul': {
        listStyleType: 'disc'
      },

      '& li': {
        margin: '2px 0'
      },

      // a nested list sits tight under its item instead of opening a new block
      '& li > ol, & li > ul': {
        margin: '2px 0'
      },

      '& blockquote': {
        margin: '8px 0',
        padding: '4px 12px',
        borderLeft: `3px solid ${token.colorBorder}`,
        color: token.colorTextSecondary
      }
    },

    codeView: {
      '& .cm-editor': {
        minHeight: '360px',
        maxHeight: '60vh',
        border: `1px solid ${token.colorBorder}`,
        borderRadius: `${token.borderRadius}px`
      }
    }
  }
})
