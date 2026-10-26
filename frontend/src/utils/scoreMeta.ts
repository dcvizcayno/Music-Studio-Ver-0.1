export interface ScoreMeta {
  title: string;
  date: string;
  bpm: string;
  key: string;
}

function lineValue(abc: string | null | undefined, field: string): string | undefined {
  if (!abc) return undefined;
  const match = abc.match(new RegExp(`^${field}:[ \\t]*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

export function parseScoreMeta(options: {
  abc?: string | null;
  title?: string;
  styleTags?: string;
  createdAt?: string;
  fallbackBpm?: number;
}): ScoreMeta {
  const { abc, title, styleTags = '', createdAt, fallbackBpm } = options;
  const abcTitle = lineValue(abc, 'T');
  const abcKey = lineValue(abc, 'K');
  const abcQ = abc?.match(/^Q:[ \t]*(?:\d+\/\d+[ \t]*=[ \t]*)?(\d+)/m)?.[1];
  const styleBpm = styleTags.match(/(\d{2,3})\s*bpm/i)?.[1];
  const dateSource = createdAt ? new Date(createdAt) : new Date();
  return {
    title: title?.trim() || abcTitle || 'Untitled Song',
    date: Number.isNaN(dateSource.getTime())
      ? new Date().toLocaleDateString()
      : dateSource.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    bpm: abcQ || styleBpm || (fallbackBpm ? String(fallbackBpm) : '—'),
    key: abcKey || '—',
  };
}
