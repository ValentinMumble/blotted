// The desk behind everything, drawn like classic blotter art: a yellow border, a blue night sky and a red day sky
// split by a black zigzag, green jagged mountains with a dripping snow cap, a crescent moon and stars, a smiling sun,
// thick black outlines, and the sheet's perforation grid over it all. The sky and mountains stretch with the window;
// the moon and the sun keep their shape in the corners.

/** The points of a five-pointed star. */
const star = (centerX: number, centerY: number, radius: number) =>
  Array.from({length: 10}, (_, index) => {
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    const reach = 0 === index % 2 ? radius : radius * 0.42;

    return `${(centerX + Math.cos(angle) * reach).toFixed(1)},${(centerY + Math.sin(angle) * reach).toFixed(1)}`;
  }).join(' ');

const RAYS = 14;

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg className="scene" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <polygon className="night" points="0,0 585,0 470,1000 0,1000" />
        <polygon className="day" points="585,0 1000,0 1000,1000 470,1000" />
        <path
          className="zigzag"
          d="M555 0 L640 0 L600 22 L660 34 L604 52 L668 66 L610 84 L672 98 L616 118 L650 128 L590 130 Z"
        />
        <path
          className="mountain"
          d="M0 560 L120 455 L145 478 L190 420 L232 452 L255 438 L520 85 L800 425 L835 392 L862 432 L892 405 L1000 560 L1000 1000 L0 1000 Z"
        />
        <path
          className="snow"
          d="M520 85 L702 300 C 692 338 668 336 660 302 C 650 258 630 262 624 294 C 616 336 594 334 588 294 C 582 252 562 254 557 286 C 550 328 528 326 523 286 C 518 246 498 248 493 276 C 488 308 466 306 462 266 C 458 236 440 238 433 252 L 391 252 Z"
        />
      </svg>

      <svg className="moon" viewBox="0 0 220 200">
        <path className="moon-body" d="M112 18 A 82 82 0 1 0 112 182 A 100 100 0 0 1 112 18 Z" />
        <path className="face" d="M46 84 q 7 -5 14 0 M50 122 q 8 8 16 2 M58 98 q 6 6 0 12" />
        <polygon className="star-light" points={star(160, 58, 34)} />
        <polygon className="star-light" points={star(186, 150, 18)} />
      </svg>

      <svg className="sun" viewBox="-120 -120 240 240">
        <g className="sun-rays">
          {Array.from({length: RAYS}, (_, index) => (
            <path
              key={index}
              className="ray"
              d="M -9 -50 C -20 -78 6 -88 -6 -112 C 14 -90 20 -74 9 -50 Z"
              transform={`rotate(${(360 / RAYS) * index})`}
            />
          ))}
        </g>
        <circle className="sun-body" r="50" />
        <path className="face" d="M-24 -10 q 8 -7 16 0 M8 -10 q 8 -7 16 0 M-2 -2 q -5 12 4 14 M-20 18 q 20 18 40 0" />
      </svg>
    </div>
  );
}
