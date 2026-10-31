import { useAppStore } from '@/store';
import { useTr } from '@/lib/i18n';
import { GRAPHICS_PRESETS, type GraphicsSettings } from '@/lib/graphics';

export function GraphicsControls() {
  const appearance = useAppStore(s => s.appearance);
  const setAppearance = useAppStore(s => s.setAppearance);
  const reducedMotion = useAppStore(s => s.reducedMotion);
  const setReducedMotion = useAppStore(s => s.setReducedMotion);
  const tr = useTr();
  const graphics = appearance.graphics;
  const patch = (value: Partial<GraphicsSettings>) => setAppearance({ graphics: { ...graphics, ...value } });
  const preset = Object.entries(GRAPHICS_PRESETS).find(([, values]) => Object.entries(values).every(([key, value]) => graphics[key as keyof GraphicsSettings] === value))?.[0];
  return <>
    <section className="settings-section graphics-settings" aria-labelledby="graphics-heading">
      <h3 id="graphics-heading">{tr('Rendering quality', '渲染画质')} <small>{!preset && tr('Custom', '自定义')}</small></h3>
      <p>{tr('Presets change rendering only. Fine-tune each setting below.', '预设只改变渲染效果。下方可逐项微调，不影响动画设置。')}</p>
      <div className="graphics-presets" role="group" aria-label={tr('Rendering presets', '渲染预设')}>
        {(['light', 'balanced', 'full'] as const).map((key, i) => <button key={key} className="settings-choice" aria-pressed={preset === key} onClick={() => patch(GRAPHICS_PRESETS[key])}>
          <span><strong>{[tr('Light', '轻量'), tr('Balanced', '平衡'), tr('Full', '完整效果')][i]}</strong><em>{[tr('No live blur', '关闭实时模糊'), tr('Window glass only · default', '仅窗口毛玻璃 · 默认'), tr('Layered glass and detailed backdrop', '多层玻璃与精细背景')][i]}</em></span>
        </button>)}
      </div>
      <label className="graphics-row"><span><strong>{tr('Glass blur', '毛玻璃强度')}</strong><small>{tr('0 disables live window blur.', '设为 0 关闭窗口实时模糊。')}</small></span><span className="graphics-slider"><input aria-label={tr('Glass blur', '毛玻璃强度')} type="range" min="0" max="48" value={graphics.glassBlur} onChange={e => patch({glassBlur: Number(e.target.value)})} /><output>{graphics.glassBlur}px</output></span></label>
      {([
        ['controlBlur', tr('Control blur', '控件独立模糊'), tr('Extra glass on buttons and search; higher graphics cost.', '按钮和搜索框额外模糊，会增加图形开销。')],
        ['coverBackground', tr('Album backdrop', '封面背景'), tr('Off uses a simple colour field.', '关闭后使用简洁的色彩背景。')],
        ['shadows', tr('Depth shadows', '层次阴影'), tr('Adds depth to surfaces and cards.', '为面板和卡片增加阴影层次。')],
      ] as const).map(([key,label,detail]) => <label className="graphics-row" key={key}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={graphics[key]} onChange={e=>patch({[key]:e.target.checked})} /></label>)}
      <label className="graphics-row"><span><strong>{tr('Backdrop detail', '背景清晰度')}</strong><small>{tr('Only affects the background, never album artwork.', '只影响背景，不降低专辑封面的清晰度。')}</small></span><select aria-label={tr('Backdrop detail', '背景清晰度')} disabled={!graphics.coverBackground} value={graphics.backgroundDetail} onChange={e=>patch({backgroundDetail:e.target.value as 'low'|'high'})}><option value="low">{tr('Low · 128px', '低 · 128px')}</option><option value="high">{tr('High · 512px', '高 · 512px')}</option></select></label>
      <p>{tr('Brief keeps its flat style; glass options apply to Super.', 'Brief 保持平面风格；毛玻璃选项用于 Super。')}</p>
    </section>
    <section className="settings-section graphics-settings" aria-labelledby="animation-heading">
      <h3 id="animation-heading">{tr('Animation', '动画效果')}</h3>
      <div className="graphics-presets" role="group" aria-label={tr('Animation level', '动画档位')}>
        {(['full','reduced','off'] as const).map((level,i)=><button key={level} className="settings-choice" aria-pressed={appearance.animationLevel===level} onClick={()=>{setAppearance({animationLevel:level});setReducedMotion(level!=='full')}}>{[tr('Full', '完整'),tr('Reduced','减弱'),tr('Off','关闭')][i]}</button>)}
      </div>
      <label className="graphics-row"><span><strong>{tr('Background transitions', '背景转场')}</strong><small>{tr('Crossfade when the album changes. Backgrounds stay still between tracks.', '换封面时淡入淡出，平时保持静止。')}</small></span><input type="checkbox" checked={appearance.backgroundTransition} disabled={appearance.animationLevel!=='full'||reducedMotion} onChange={e=>setAppearance({backgroundTransition:e.target.checked})} /></label>
      <label className="graphics-row"><span><strong>{tr('Page transitions', '页面转场')}</strong><small>{tr('Animate navigation between library pages.', '切换资料库页面时使用过渡动画。')}</small></span><input type="checkbox" checked={appearance.pageTransitions} disabled={appearance.animationLevel==='off'} onChange={e=>setAppearance({pageTransitions:e.target.checked})} /></label>
      <p>{tr('System reduced-motion preferences also take priority. Background animations pause when the window is hidden or inactive.', '同时遵循系统减少动态效果偏好；窗口隐藏或失焦时暂停非必要动画。')}</p>
    </section>
  </>;
}
