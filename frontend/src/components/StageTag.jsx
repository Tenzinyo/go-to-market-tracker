export default function StageTag({ name, colorHex, textColorHex }) {
  if (!name) return <span className="stage-tag-none">—</span>
  return (
    <span
      className="stage-tag"
      style={{
        backgroundColor: colorHex ?? '#CCCCCC',
        color: textColorHex ?? '#2B2B2B',
      }}
    >
      {name}
    </span>
  )
}
