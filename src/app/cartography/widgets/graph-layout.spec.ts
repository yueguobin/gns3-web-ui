import { select } from 'd3-selection';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectionManager } from '../managers/selection-manager';
import { MapLabel } from '../models/map/map-label';
import { MapNode } from '../models/map/map-node';
import { SVGSelection } from '../models/types';
import { GraphLayout } from './graph-layout';

describe('GraphLayout selection highlights', () => {
  let graphLayout: GraphLayout;
  let selectionManager: SelectionManager;
  let view: SVGSelection;
  let label: MapLabel;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    graphLayout = new GraphLayout(null, null, null, null, null, null, selectionManager);

    view = select(document.createElementNS('http://www.w3.org/2000/svg', 'svg')) as SVGSelection;
    const canvas = view.append('g').attr('class', 'canvas');
    view.append('defs');

    label = Object.assign(new MapLabel(), { id: 'label-1', nodeId: 'node-1' });
    canvas.append('rect').datum(label).attr('class', 'label_selection').attr('visibility', 'hidden');
  });

  it('should highlight a hostname as soon as its parent node is selected', () => {
    const node = Object.assign(new MapNode(), { id: 'node-1' });
    selectionManager.setSelected([node]);

    graphLayout.updateSelectionHighlights(view);

    expect(view.select('rect.label_selection').attr('visibility')).toBe('visible');
  });

  it('should keep directly selected labels highlighted', () => {
    selectionManager.setSelected([label]);

    graphLayout.updateSelectionHighlights(view);

    expect(view.select('rect.label_selection').attr('visibility')).toBe('visible');
  });

  it('should hide a hostname when neither it nor its parent node is selected', () => {
    graphLayout.updateSelectionHighlights(view);

    expect(view.select('rect.label_selection').attr('visibility')).toBe('hidden');
  });
});
