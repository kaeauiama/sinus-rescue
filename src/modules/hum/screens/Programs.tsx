import { useState } from 'preact/hooks';
import { logicalDay } from '../../../platform/events';
import type { IconName } from '../../../platform/icons';
import { Btn, Group, ListRow, Screen, type Tone } from '../../../platform/ui';
import { NOSE_LABELS } from '../copy';
import { useHum } from '../context';
import {
  allPrograms,
  copyAsCustom,
  customPrograms,
  pitchContext,
  programMinutes,
  selectedProgram,
  SETTING_COMPARE_CONTACT,
  SETTING_PROGRAMS,
  type Block,
  type PitchMode,
  type Program,
} from '../domain/programs';
import { tonesForToday } from '../domain/experiment';
import { planTones, SETTING_SESSION, sessionSettings } from '../domain/session';
import { currentTones, latestProfile } from '../domain/tones';
import { PROGRAM_MAX_CUSTOM } from '../rules';

const LOOKS: Record<string, { icon: IconName; tone: Tone }> = {
  simple: { icon: 'wave', tone: 'violet' },
  continuous: { icon: 'clock', tone: 'indigo' },
  hill: { icon: 'chart', tone: 'teal' },
  slope: { icon: 'refresh', tone: 'teal' },
  build: { icon: 'layers', tone: 'coral' },
  interval: { icon: 'shuffle', tone: 'coral' },
  compare: { icon: 'list', tone: 'amber' },
};
const CUSTOM_LOOK = { icon: 'note' as IconName, tone: 'gray' as Tone };

export function pitchText(pitch: PitchMode): string {
  switch (pitch.kind) {
    case 'tones':
      return '今日の音';
    case 'step':
      return pitch.semitones === 0 ? '楽な高さ' : `楽な高さ ${pitch.semitones > 0 ? '+' : ''}${pitch.semitones}半音`;
    case 'hill':
      return '山道';
    case 'glide':
      return { up: '上へ滑らせる', down: '下へ滑らせる', alternate: '上下に滑らせる' }[pitch.direction];
  }
}

const restText = (sec: number) => (sec >= 60 ? `${sec / 60}分` : `${sec}秒`);

export function blockText(b: Block): string {
  const count = b.sets > 1 ? `${b.hums}回×${b.sets}` : `${b.hums}回`;
  return [NOSE_LABELS[b.nose], pitchText(b.pitch), count, b.restSec ? `休憩${restText(b.restSec)}` : ''].filter(Boolean).join('・');
}

function usePitchContext() {
  const { events, settings } = useHum();
  const profile = latestProfile(events);
  const tones = planTones(sessionSettings(settings[SETTING_SESSION]), tonesForToday(events, currentTones(events)), profile);
  return pitchContext(tones, profile);
}

// 規定のメニューと、自分で作ったメニューの一覧。
export function Programs() {
  const { events, settings, entry, go } = useHum();
  const ctx = usePitchContext();
  const { program: selected, locked } = selectedProgram(events, settings, logicalDay(new Date()));
  const programs = allPrograms(settings);
  const customs = programs.filter((p) => p.custom);
  const row = (p: Program) => {
    const look = LOOKS[p.id] ?? CUSTOM_LOOK;
    return (
      <ListRow
        key={p.id}
        icon={look.icon}
        tone={look.tone}
        label={p.name}
        sub={p.custom ? p.blocks.map(blockText).join(' / ') : p.description}
        detail={p.id === selected.id ? '選択中' : `約${programMinutes(p, ctx)}分`}
        onClick={() => go({ name: 'program', programId: p.id })}
      />
    );
  };

  return (
    <Screen title="ハミングのメニュー" align="top" onClose={() => go({ name: entry === 'settings' ? 'settings' : 'home' })} closeLabel="戻る">
      {locked && <p class="note">比較中は、比べる音が変わらないよう「いつもの」で行います。</p>}
      <Group title="規定のメニュー">{programs.filter((p) => !p.custom).map(row)}</Group>
      <Group title="自分のメニュー" note={customs.length ? undefined : '規定のメニューを元に作ることもできます。'}>
        {customs.map(row)}
        {customs.length < PROGRAM_MAX_CUSTOM && <ListRow icon="plus" tone="gray" label="新しく作る" onClick={() => go({ name: 'programEdit' })} />}
      </Group>
    </Screen>
  );
}

export function ProgramDetail({ programId }: { programId: string }) {
  const { events, settings, setSetting, go } = useHum();
  const ctx = usePitchContext();
  const [confirming, setConfirming] = useState(false);
  const program = allPrograms(settings).find((p) => p.id === programId);
  const { program: selected, locked } = selectedProgram(events, settings, logicalDay(new Date()));
  const back = () => go({ name: 'programs' });
  if (!program) {
    return <Screen title="このメニューは削除されています" onBack={back} actions={<Btn onClick={back}>一覧へ</Btn>} />;
  }
  const contact = Boolean(settings[SETTING_COMPARE_CONTACT]);
  const usesPinch = program.blocks.some((b) => b.nose !== 'open');

  const choose = async () => {
    const stored = sessionSettings(settings[SETTING_SESSION]);
    const preset = program.id === 'continuous' ? 'continuous' : program.id === 'simple' ? 'short' : stored.preset;
    await setSetting(SETTING_SESSION, { ...stored, preset, programId: program.id });
    go({ name: 'home' });
  };

  const copy = async () => {
    const id = crypto.randomUUID();
    await setSetting(SETTING_PROGRAMS, [...customPrograms(settings), copyAsCustom(program, id)]);
    go({ name: 'programEdit', programId: id });
  };

  const remove = async () => {
    await setSetting(SETTING_PROGRAMS, customPrograms(settings).filter((p) => p.id !== program.id));
    back();
  };

  if (confirming) {
    return (
      <Screen
        title={`「${program.name}」を削除しますか`}
        onBack={() => setConfirming(false)}
        note="これまでの記録は残ります。"
        actions={
          <>
            <Btn onClick={remove}>削除する</Btn>
            <Btn primary onClick={() => setConfirming(false)}>
              やめる
            </Btn>
          </>
        }
      />
    );
  }

  return (
    <Screen
      title={program.name}
      note={`${program.custom ? '自分で作ったメニュー' : program.description}。約${programMinutes(program, ctx)}分`}
      align="top"
      onClose={back}
      closeLabel="戻る"
      actions={
        program.id === selected.id ? undefined : (
          <Btn primary onClick={choose}>
            これにする
          </Btn>
        )
      }
    >
      {locked && <p class="note">比較が終わるまでは「いつもの」で行います。</p>}
      <Group title={program.shuffle ? '内容(順番は毎日変わる)' : '内容'}>
        {program.blocks.map((b, index) => (
          <div key={index} class="item-row">
            <span class="list-main">
              <span>{blockText(b)}</span>
              {b.nose === 'pinch' && <small>あとに鼻を開けて流す「んー」が入る</small>}
              {b.rate && <small>終わったら震え方を3段階で答える</small>}
            </span>
          </div>
        ))}
      </Group>
      {program.id === 'compare' && (
        <Group note="試験的な測り方です。音量の差は、皮膚と空気を伝わった音を合わせたもので、副鼻腔の中を測るものではありません。">
          <ListRow
            icon="mic"
            tone="amber"
            label="鼻の横に当てて測る"
            role="switch"
            checked={contact}
            onClick={() => setSetting(SETTING_COMPARE_CONTACT, !contact)}
          />
        </Group>
      )}
      <Group>
        {usesPinch && <ListRow icon="info" tone="gray" label="鼻の構えの説明" onClick={() => go({ name: 'postureGuide' })} />}
        {(program.id === 'simple' || program.id === 'continuous') && (
          <ListRow icon="sliders" tone="violet" label="回数と休憩、音の順番" onClick={() => go({ name: 'plan' })} />
        )}
        {program.custom ? (
          <>
            <ListRow icon="note" tone="gray" label="編集する" onClick={() => go({ name: 'programEdit', programId: program.id })} />
            <ListRow icon="trash" danger label="削除する" onClick={() => setConfirming(true)} />
          </>
        ) : (
          customPrograms(settings).length < PROGRAM_MAX_CUSTOM && <ListRow icon="plus" tone="gray" label="この内容から作る" onClick={copy} />
        )}
      </Group>
    </Screen>
  );
}
