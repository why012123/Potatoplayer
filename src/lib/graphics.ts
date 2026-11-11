export type AnimationLevel = 'full' | 'reduced' | 'off';
export interface GraphicsSettings {
  glassBlur: number;
  controlBlur: boolean;
  coverBackground: boolean;
  backgroundDetail: 'low' | 'high';
  shadows: boolean;
}
export const GRAPHICS_PRESETS = {
  light: { glassBlur: 0, controlBlur: false, coverBackground: false, backgroundDetail: 'low', shadows: false },
  balanced: { glassBlur: 20, controlBlur: false, coverBackground: true, backgroundDetail: 'low', shadows: true },
  full: { glassBlur: 38, controlBlur: true, coverBackground: true, backgroundDetail: 'high', shadows: true },
} satisfies Record<string, GraphicsSettings>;
export function normalizeGraphics(value?: Partial<GraphicsSettings>): GraphicsSettings {
  const base = GRAPHICS_PRESETS.balanced;
  return {
    glassBlur: typeof value?.glassBlur === 'number' && Number.isFinite(value.glassBlur) ? Math.max(0, Math.min(48, Math.round(value.glassBlur))) : base.glassBlur,
    controlBlur: typeof value?.controlBlur === 'boolean' ? value.controlBlur : base.controlBlur,
    coverBackground: typeof value?.coverBackground === 'boolean' ? value.coverBackground : base.coverBackground,
    backgroundDetail: value?.backgroundDetail === 'high' ? 'high' : 'low',
    shadows: typeof value?.shadows === 'boolean' ? value.shadows : base.shadows,
  };
}
