export default function PersonAvatar({ name, photoUrl, size = 36 }) {
  const initial = String(name || '?')
    .trim()
    .charAt(0)
    .toUpperCase() || '?'
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.round(size * 0.42)),
  }

  return (
    <span className="person-avatar" style={style} aria-hidden="true">
      {photoUrl ? (
        <img src={photoUrl} alt="" />
      ) : (
        <span className="person-avatar-initial">{initial}</span>
      )}
    </span>
  )
}
