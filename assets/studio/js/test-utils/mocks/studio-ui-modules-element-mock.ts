/**
 * This source file is available under the terms of the
 * Pimcore Open Core License (POCL)
 * Full copyright and license information is available in
 * LICENSE.md which is distributed with this source code.
 *
 *  @copyright  Copyright (c) Pimcore GmbH (https://www.pimcore.com)
 *  @license    Pimcore Open Core License (POCL)
 */


// Mock of the federated `@pimcore/studio-ui-bundle/modules/element` entry point. The element
// selector is a modal of the Studio host; tests read the configuration it was opened with and
// finish it themselves through `elementSelectorMock.finish`.
export enum SelectionType {
  Disabled = 'disabled',
  Single = 'single',
  Multiple = 'multiple'
}

interface FinishEvent {
  items: Array<{ elementType: string, data: Record<string, any> }>
}

interface SelectorConfig {
  onFinish?: (event: FinishEvent) => void
  [key: string]: any
}

export const elementSelectorMock = {
  open: jest.fn(),
  config: undefined as SelectorConfig | undefined,
  finish: (event: FinishEvent): void => {
    elementSelectorMock.config?.onFinish?.(event)
  }
}

export const useElementSelector = (config: SelectorConfig): { open: () => void } => ({
  open: () => {
    elementSelectorMock.config = config
    elementSelectorMock.open(config)
  }
})
