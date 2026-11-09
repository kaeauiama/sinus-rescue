import type { ComponentChildren } from 'preact';
import { useBack } from './back';
import { Icon, type IconName } from './icons';

interface ScreenProps {
  title?: ComponentChildren;
  note?: ComponentChildren;
  progress?: number;
  onClose?: () => void;
  // 端末の戻る操作で呼ぶ処理。省略すると onClose と同じ。どちらも無い画面では、端末の戻るはアプリを離れる。
  onBack?: () => void;
  closeLabel?: string;
  centered?: boolean;
  align?: 'middle' | 'top';
  children?: ComponentChildren;
  actions?: ComponentChildren;
  footer?: ComponentChildren;
}

// 1画面1タスクの共通レイアウト。操作は親指の届く下側に置く。
// align="top" は一覧やカードを並べるページ、既定は1問だけを中央に置く流れの画面。
export function Screen({
  title,
  note,
  progress,
  onClose,
  onBack,
  closeLabel = '閉じる',
  centered = false,
  align = 'middle',
  children,
  actions,
  footer,
}: ScreenProps) {
  useBack(onBack ?? onClose);
  return (
    <div class={`screen ${align === 'top' ? 'page' : 'flow'} ${footer ? 'with-tabs' : ''}`}>
      <header class="screen-head">
        {onClose && (
          <button type="button" class="back" onClick={onClose}>
            {closeLabel === '戻る' && <Icon name="chevronLeft" size={20} />}
            <span>{closeLabel}</span>
          </button>
        )}
        {progress != null && (
          <div class="progress" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </header>
      <main class={`stage ${align === 'top' ? 'stage-top' : ''} ${centered ? 'stage-center' : ''}`}>
        {title && <h1>{title}</h1>}
        {note && <p class="note">{note}</p>}
        {children}
      </main>
      {actions && <div class="actions">{actions}</div>}
      {footer}
    </div>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon: IconName;
}

// 画面下に固定するタブ。どのモジュールの画面かは、呼び出す側が決める。
export function TabBar({ tabs, active, onSelect }: { tabs: TabItem[]; active: string; onSelect: (id: string) => void }) {
  return (
    <nav class="tabbar" aria-label="メニュー">
      <div class="tabbar-inner">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            class="tabbar-item"
            aria-current={tab.id === active ? 'page' : undefined}
            onClick={() => onSelect(tab.id)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export type Tone = 'teal' | 'violet' | 'coral' | 'indigo' | 'amber' | 'gray';

export function IconChip({ icon, tone = 'teal' }: { icon: IconName; tone?: Tone }) {
  return (
    <span class={`icon-chip tone-${tone}`}>
      <Icon name={icon} size={18} />
    </span>
  );
}

interface ListRowProps {
  icon?: IconName;
  tone?: Tone;
  label: ComponentChildren;
  sub?: ComponentChildren;
  detail?: ComponentChildren;
  onClick?: () => void;
  role?: 'switch';
  checked?: boolean;
  danger?: boolean;
}

// カードの中の1行。アイコン、名前、右端の値、矢印の順に並べる。
export function ListRow({ icon, tone, label, sub, detail, onClick, role, checked, danger = false }: ListRowProps) {
  return (
    <button
      type="button"
      class={`list-row ${danger ? 'danger' : ''}`}
      role={role}
      aria-checked={role ? checked : undefined}
      onClick={onClick}
    >
      {icon && <IconChip icon={icon} tone={danger ? 'coral' : tone} />}
      <span class="list-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </span>
      {detail != null && <span class="list-detail">{detail}</span>}
      {role === 'switch' ? (
        <span class={`switch ${checked ? 'on' : ''}`} aria-hidden="true" />
      ) : (
        !danger && (
          <span class="list-chevron">
            <Icon name="chevronRight" size={18} />
          </span>
        )
      )}
    </button>
  );
}

export function Group({ title, note, children }: { title?: ComponentChildren; note?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="group">
      {title && <h2 class="group-title">{title}</h2>}
      <div class="card list-card">{children}</div>
      {note && <p class="group-note">{note}</p>}
    </section>
  );
}

interface BtnProps {
  primary?: boolean;
  quiet?: boolean;
  icon?: IconName;
  onClick?: () => void;
  children: ComponentChildren;
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function ScoreGrid({ value, onPick }: { value?: number | null; onPick: (score: number) => void }) {
  return (
    <div class="grid-scores">
      {SCORES.map((score) => (
        <button type="button" key={score} class={score === value ? 'chip-active' : ''} onClick={() => onPick(score)}>
          {score}
        </button>
      ))}
    </div>
  );
}

export function Btn({ primary = false, quiet = false, icon, onClick, children }: BtnProps) {
  return (
    <button type="button" class={`${primary ? 'primary' : ''} ${quiet ? 'quiet' : ''}`} onClick={onClick}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}
