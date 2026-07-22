import { select } from 'd3-selection';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionEventSource } from '../events/selection-event-source';
import { Context } from '../models/context';
import { SVGSelection } from '../models/types';
import { SelectionTool } from './selection-tool';

describe('SelectionTool context menu', () => {
  let svg: SVGSelection;
  let tool: SelectionTool;

  beforeEach(() => {
    const context = {
      transformation: { x: 0, y: 0, k: 1 },
      getZeroZeroTransformationPoint: () => ({ x: 0, y: 0 }),
    } as Context;
    const selectionEventSource = { selected: new Subject() } as SelectionEventSource;
    svg = select(document.createElementNS('http://www.w3.org/2000/svg', 'svg')) as SVGSelection;
    svg.append('g').attr('class', 'canvas');
    tool = new SelectionTool(context, selectionEventSource);
  });

  it('should emit only for an actual right-click while enabled', () => {
    const listener = vi.fn();
    tool.contextMenuOpened.subscribe(listener);
    tool.setEnabled(true);
    tool.draw(svg, null);

    const event = new MouseEvent('mousedown', { button: 2 });
    svg.node().dispatchEvent(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('should prevent the browser context menu while enabled', () => {
    tool.setEnabled(true);
    tool.draw(svg, null);
    const event = new MouseEvent('contextmenu', { cancelable: true });

    svg.node().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('should remove its mouse handlers when disabled', () => {
    const listener = vi.fn();
    tool.contextMenuOpened.subscribe(listener);
    tool.setEnabled(true);
    tool.draw(svg, null);
    tool.setEnabled(false);
    tool.draw(svg, null);

    const mouseDown = new MouseEvent('mousedown', { button: 2 });
    const contextMenu = new MouseEvent('contextmenu', { cancelable: true });
    svg.node().dispatchEvent(mouseDown);
    svg.node().dispatchEvent(contextMenu);

    expect(listener).not.toHaveBeenCalled();
    expect(contextMenu.defaultPrevented).toBe(false);
  });
});
