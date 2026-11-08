import { useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { NOSE_LABELS } from '../copy';
import { useHum } from '../context';
import { customPrograms, NOSES, normalizeProgram, SETTING_PROGRAMS, type Block, type PitchMode, type Program } from '../domain/programs';
import { SETTING_SESSION, sessionSettings } from '../domain/session';
import {
  BLOCK_MAX_HUMS,
  BLOCK_MAX_SETS,
  BLOCK_REST_CHOICES,
  PROGRAM_MAX_BLOCKS,
  STEP_MAX_SEMITONES,
  STEP_MIN_SEMITONES,
} from '../rules';
import { blockText, pitchText } from './Programs';

const PITCHES: PitchMode[] = [
  { kind: 'tones' },
  { kind: 'step', semitones: 0 },
  { kind: 'hill' },
  { kind: 'glide', direction: 'up' },
  { kind: 'glide', direction: 'down' },
  { kind: 'glide', direction: 'alternate' },
];

const samePitchKind = (a: PitchMode, b: PitchMode) =>
  a.kind === b.kind && (a.kind !== 'glide' || (b.kind === 'glide' && a.direction === b.direction));

const NEW_BLOCK: Block = { nose: 'open', pitch: { kind: 'step', semitones: 0 }, hums: 5, sets: 1, restSec: 60 };

const inputValue = (event: Event) => (event.currentTarget as HTMLInputElement).value;

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

function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const set = (patch: Partial<Block>) => onChange({ ...block, ...patch });
  return (
    <div class="settings">
      <div class="setting-row">
        <span>鼻</span>
        <div class="chips">
          {NOSES.map((nose) => (
            <button type="button" key={nose} class={`chip ${block.nose === nose ? 'chip-active' : ''}`} aria-pressed={block.nose === nose} onClick={() => set({ nose })}>
              {NOSE_LABELS[nose]}
            </button>
          ))}
        </div>
      </div>
      <div class="setting-row">
        <span>高さ</span>
        <div class="chips">
          {PITCHES.map((pitch) => {
            const active = samePitchKind(block.pitch, pitch);
            return (
              <button type="button" key={pitchText(pitch)} class={`chip ${active ? 'chip-active' : ''}`} aria-pressed={active} onClick={() => set({ pitch })}>
                {pitchText(pitch)}
              </button>
            );
          })}
        </div>
      </div>
      {block.pitch.kind === 'step' && (
        <Stepper
          label="楽な高さからの半音"
          value={block.pitch.semitones}
          unit=""
          min={STEP_MIN_SEMITONES}
          max={STEP_MAX_SEMITONES}
          onChange={(semitones) => set({ pitch: { kind: 'step', semitones } })}
        />
      )}
      <Stepper label="回数" value={block.hums} unit="回" min={1} max={BLOCK_MAX_HUMS} onChange={(hums) => set({ hums })} />
      <Stepper label="繰り返し" value={block.sets} unit="セット" min={1} max={BLOCK_MAX_SETS} onChange={(sets) => set({ sets })} />
      <div class="setting-row">
        <span>休憩</span>
        <div class="chips">
          {BLOCK_REST_CHOICES.map((sec) => (
            <button type="button" key={sec} class={`chip ${block.restSec === sec ? 'chip-active' : ''}`} onClick={() => set({ restSec: sec })}>
              {sec === 0 ? 'なし' : sec >= 60 ? `${sec / 60}分` : `${sec}秒`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 自分のメニューを作る。ブロックを並べ、1つずつ開いて中身を変える。
export function ProgramEdit({ programId }: { programId?: string }) {
  const { settings, setSetting, go } = useHum();
  const existing = programId ? customPrograms(settings).find((p) => p.id === programId) : undefined;
  const [name, setName] = useState(existing?.name ?? '自分のメニュー');
  const [blocks, setBlocks] = useState<Block[]>(existing?.blocks ?? [NEW_BLOCK]);
  const [open, setOpen] = useState<number | null>(existing ? null : 0);
  const close = () => go(existing ? { name: 'program', programId: existing.id } : { name: 'programs' });

  const update = (index: number, b: Block) => setBlocks(blocks.map((x, i) => (i === index ? b : x)));
  const move = (index: number, delta: number) => {
    const next = [...blocks];
    const [b] = next.splice(index, 1);
    next.splice(index + delta, 0, b);
    setBlocks(next);
    setOpen(index + delta);
  };
  const remove = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index));
    setOpen(null);
  };
  const add = () => {
    setBlocks([...blocks, { ...NEW_BLOCK }]);
    setOpen(blocks.length);
  };

  const save = async (use: boolean) => {
    const id = existing?.id ?? crypto.randomUUID();
    const program = normalizeProgram({ id, name, blocks }) as Program;
    const others = customPrograms(settings).filter((p) => p.id !== id);
    await setSetting(SETTING_PROGRAMS, [...others, program]);
    if (use) {
      await setSetting(SETTING_SESSION, { ...sessionSettings(settings[SETTING_SESSION]), programId: id });
      go({ name: 'home' });
    } else {
      go({ name: 'program', programId: id });
    }
  };

  return (
    <Screen
      title={existing ? 'メニューを編集' : 'メニューを作る'}
      align="top"
      onClose={close}
      closeLabel="戻る"
      actions={
        <>
          <Btn primary onClick={() => save(true)}>
            保存して使う
          </Btn>
          <Btn quiet onClick={() => save(false)}>
            保存だけする
          </Btn>
        </>
      }
    >
      <label class="field">
        名前
        <input type="text" value={name} maxLength={20} onInput={(e) => setName(inputValue(e))} />
      </label>
      <h2>ブロック</h2>
      <ol class="edit-list block-list">
        {blocks.map((b, index) => (
          <li key={index}>
            <button type="button" class="link grow" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
              <span>{`${index + 1}. ${blockText(b)}`}</span>
              {b.nose === 'pinch' && <small>あとに鼻を開けて流す「んー」が入る</small>}
            </button>
            {open === index && (
              <>
                <BlockEditor block={b} onChange={(next) => update(index, next)} />
                <div class="center-row start">
                  <button type="button" class="round small" aria-label="上へ" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button type="button" class="round small" aria-label="下へ" disabled={index === blocks.length - 1} onClick={() => move(index, 1)}>
                    ↓
                  </button>
                  <button type="button" class="link danger" disabled={blocks.length === 1} onClick={() => remove(index)}>
                    このブロックを削除
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      {blocks.length < PROGRAM_MAX_BLOCKS && (
        <button type="button" class="link add" onClick={add}>
          ブロックを足す
        </button>
      )}
    </Screen>
  );
}
