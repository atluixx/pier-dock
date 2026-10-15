/** Atalho de teclado como chips: `"Ctrl Alt 2"` vira três teclas. */
export function Kbd({ keys }: { keys: string }) {
  return (
    <span className="kbd-group">
      {keys.split(" ").map((key, i) => (
        <kbd key={i} className="kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}
