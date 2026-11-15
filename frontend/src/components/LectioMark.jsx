// Lectio's logo: a bold "L" with a green bookmark ribbon in its corner, drawn to
// the pixel from the brand artwork. It comes in two versions, picked by the
// background the mark sits on, so it always stands out:
//   on="light"  charcoal L, for white and pale surfaces (the default)
//   on="dark"   pale L and a brighter ribbon, for charcoal, ink and dark glass
// `size` is the mark's height (a number of pixels or any CSS length); the width
// follows from its 32.5 x 45 shape.
const COLOURS = {
  light: { letter: "#414142", ribbon: "#2e8b37" },
  dark: { letter: "#d9d9d9", ribbon: "#3a9542" },
};

export function LectioMark({ size = 18, className = "", on = "light" }) {
  const { letter, ribbon } = COLOURS[on] || COLOURS.light;
  return (
    <svg
      viewBox="0 0 32.5 45"
      className={className}
      style={{ display: "block", height: size, width: "auto", aspectRatio: "32.5 / 45" }}
      aria-hidden="true"
    >
      <path fill={letter} d="M0 0H13V32.5H32.5V45H0Z" />
      <path fill={ribbon} d="M19 0H32.5V25.4L25.75 20.4L19 25.4Z" />
    </svg>
  );
}
