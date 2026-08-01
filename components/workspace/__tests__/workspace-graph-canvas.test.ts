import { zoomIdentity } from 'd3-zoom';
import { describe, expect, it } from 'vitest';

import { graphDragPoint } from '../workspace-graph-canvas';

describe('WorkspaceGraphCanvas drag coordinates', () => {
  it('keeps the grab offset while converting the pointer from screen to graph coordinates once', () => {
    const transform = zoomIdentity.translate(240, 120).scale(2);
    const grabOffset: [number, number] = [-5, 3];

    expect(graphDragPoint(transform, [330, 174], grabOffset)).toEqual([40, 30]);
    expect(graphDragPoint(transform, [370, 214], grabOffset)).toEqual([60, 50]);
  });
});
