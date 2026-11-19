export interface GraphDisplaySettings {
  textFadeThreshold: number;
  nodeSize: number;
  linkThickness: number;
  showArrows: boolean;
  showPreview: boolean;
  ambient: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: GraphDisplaySettings = {
  textFadeThreshold: 0.15,
  nodeSize: 1,
  linkThickness: 1,
  showArrows: false,
  showPreview: true,
  ambient: false,
};

export type ExplorationDepth = 1 | 2 | 3;

export interface GraphExploration {
  rootId: string;
  depth: ExplorationDepth;
  path: string[];
}
