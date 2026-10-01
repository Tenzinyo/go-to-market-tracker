const PALETTE = [
  { bg: '#dbeafe', text: '#1e40af' }, // blue
  { bg: '#d1fae5', text: '#065f46' }, // green
  { bg: '#fce7f3', text: '#9d174d' }, // pink
  { bg: '#ede9fe', text: '#4c1d95' }, // purple
  { bg: '#ffedd5', text: '#7c2d12' }, // orange
  { bg: '#fef9c3', text: '#713f12' }, // yellow
  { bg: '#e0f2fe', text: '#0c4a6e' }, // sky
  { bg: '#fae8ff', text: '#701a75' }, // fuchsia
]

export function tagColor(tag) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
