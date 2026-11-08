import { Screen } from '../../../platform/ui';
import { useHum } from '../context';
import { noteName } from '../domain/dsp';
import { DEFAULT_SESSION, SETTING_SESSION, type SessionSettings } from '../domain/session';
import { toneLabel } from '../domain/sites';
import { currentTones } from '../domain/tones';

const REST_CHOICES = [0, 60, 120, 180, 300];

function Stepper({ label, value, unit, min, max, onChange }: { label: string; value: number; unit: string; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div class="setting-row">
      <span>{label}</span>
      <div class="stepper">
        <button type="button" class="round small" aria-label={`${label}を減らす`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span class="stepper-value">{`${value}${unit}`}</span>
        <button type="button" class="round small" aria-label={`${label}を増やす`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          ＋
        </button>
      </div>
    </div>
  );
}

export function PlanSettings() {
  const { events, settings, setSetting, go } = useHum();
  const current: SessionSettings = { ...DEFAULT_SESSION, ...(settings[SETTING_SESSION] as Partial<SessionSettings> | undefined) };
  const update = (patch: Partial<SessionSettings>) => {
    const next = { ...current, ...patch };
    // 短セットと連続型の切り替えは、そのまま「いつもの」と「連続型」のメニューを選ぶことにする。
    if (patch.preset) next.programId = patch.preset === 'continuous' ? 'continuous' : 'simple';
    return setSetting(SETTING_SESSION, next);
  };

  const tones = currentTones(events);
  const rank = (id: string) => {
    const index = current.order.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const ordered = [...tones].sort((a, b) => rank(a.toneId) - rank(b.toneId));
  const move = (index: number, delta: number) => {
    const ids = ordered.map((t) => t.toneId);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void update({ order: ids });
  };
  const toggle = (id: string) => {
    const disabled = current.disabled.includes(id) ? current.disabled.filter((d) => d !== id) : [...current.disabled, id];
    void update({ disabled });
  };

  return (
    <Screen title="いつもの・連続型の設定" align="top" onClose={() => go({ name: 'programs' })} closeLabel="戻る">
      <div class="segmented" role="group" aria-label="やり方">
        <button type="button" class={current.preset === 'short' ? 'segment-active' : ''} onClick={() => update({ preset: 'short' })}>
          短セット
        </button>
        <button type="button" class={current.preset === 'continuous' ? 'segment-active' : ''} onClick={() => update({ preset: 'continuous' })}>
          連続型
        </button>
      </div>

      {current.preset === 'short' ? (
        <div class="settings">
          <Stepper label="1音のハミング回数" value={current.humsPerSet} unit="回" min={1} max={20} onChange={(humsPerSet) => update({ humsPerSet })} />
          <Stepper label="1音のセット数" value={current.setsPerTone} unit="セット" min={1} max={5} onChange={(setsPerTone) => update({ setsPerTone })} />
          <div class="setting-row">
            <span>休憩</span>
            <div class="chips">
              {REST_CHOICES.map((sec) => (
                <button key={sec} type="button" class={`chip ${current.restSec === sec ? 'chip-active' : ''}`} onClick={() => update({ restSec: sec })}>
                  {sec === 0 ? 'なし' : `${sec / 60}分`}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div class="settings">
          <Stepper label="時間" value={current.continuousMin} unit="分" min={1} max={60} onChange={(continuousMin) => update({ continuousMin })} />
          <p class="note">最初の音を、1分に18回のペースで続けます。</p>
        </div>
      )}

      {ordered.length > 0 && (
        <>
          <h2>音の順番</h2>
          <ul class="tone-order">
            {ordered.map((tone, index) => (
              <li key={tone.toneId} class={current.disabled.includes(tone.toneId) ? 'off' : ''}>
                <button type="button" class="link grow" onClick={() => toggle(tone.toneId)}>
                  <span>{toneLabel(tone.site)}</span>
                  <small>{current.disabled.includes(tone.toneId) ? '使わない' : noteName(tone.hz)}</small>
                </button>
                <button type="button" class="round small" aria-label="上へ" disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button type="button" class="round small" aria-label="下へ" disabled={index === ordered.length - 1} onClick={() => move(index, 1)}>
                  ↓
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
