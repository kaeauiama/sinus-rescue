export type SiteId = 'cheek' | 'between-eyes' | 'forehead' | 'deep-nose';

export interface Site {
  id: SiteId;
  name: string;
  sinus: string;
}

// 図では副鼻腔の位置を案内するが、登録名は体感の言葉にする(「前頭洞に効く音」とは表示しない)。
export const SITES: Site[] = [
  { id: 'cheek', name: '頬', sinus: '上顎洞のあたり' },
  { id: 'between-eyes', name: '目の間', sinus: '篩骨洞のあたり' },
  { id: 'forehead', name: '額', sinus: '前頭洞のあたり' },
  { id: 'deep-nose', name: '鼻の奥', sinus: '蝶形骨洞のあたり' },
];

export function siteOf(id: SiteId): Site {
  return SITES.find((s) => s.id === id) ?? SITES[0];
}

export const toneLabel = (id: SiteId) => `${siteOf(id).name}が響く音`;
