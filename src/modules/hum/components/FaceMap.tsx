import type { SiteId } from '../domain/sites';

interface FaceMapProps {
  active?: SiteId | null;
  onPick?: (site: SiteId) => void;
}

// 副鼻腔のおおよその位置を示す図。診断のためではなく、響きを感じる場所の案内に使う。
export function FaceMap({ active = null, onPick }: FaceMapProps) {
  const zone = (site: SiteId) => ({
    class: `zone ${active === site ? 'zone-active' : ''}`,
    onClick: () => onPick?.(site),
  });
  return (
    <svg class="face" viewBox="0 0 240 280" role="img" aria-label="副鼻腔のおおよその位置を示す顔の図">
      <ellipse class="face-line" cx="120" cy="140" rx="88" ry="118" />
      <path class="face-line" d="M72 118 q16 -10 32 0" />
      <path class="face-line" d="M136 118 q16 -10 32 0" />
      <path class="face-line" d="M120 124 L108 182 q12 8 24 0" />
      <path class="face-line" d="M96 218 q24 12 48 0" />
      <g {...zone('forehead')}>
        <ellipse cx="92" cy="76" rx="26" ry="16" />
        <ellipse cx="148" cy="76" rx="26" ry="16" />
      </g>
      <g {...zone('between-eyes')}>
        <rect x="108" y="104" width="24" height="34" rx="10" />
      </g>
      <g {...zone('cheek')}>
        <ellipse cx="72" cy="162" rx="24" ry="22" />
        <ellipse cx="168" cy="162" rx="24" ry="22" />
      </g>
      <g {...zone('deep-nose')}>
        <circle class="zone-deep" cx="120" cy="158" r="13" />
      </g>
    </svg>
  );
}
