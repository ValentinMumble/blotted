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

/** The moon: the outer arc, then the inner edge as a smooth profile (chin, lips, nose, brow, forehead). */
const MOON =
  'M120 14 A 88 88 0 1 0 120 186 C 116.7 184.8 104.7 182.3 100 179 C 95.3 175.7 93.7 170.7 92 166 C 90.3 161.3 91.5 154.8 90 151 C 88.5 147.2 83.5 145.3 83 143 C 82.5 140.7 87 139 87 137 C 87 135 83 132.8 83 131 C 83 129.2 86.8 128 87 126 C 87.2 124 82.2 121.7 84 119 C 85.8 116.3 97.8 113.3 98 110 C 98.2 106.7 87.8 102.7 85 99 C 82.2 95.3 81 91.8 81 88 C 81 84.2 84.7 80.7 85 76 C 85.3 71.3 81.8 66.7 83 60 C 84.2 53.3 85.8 43.7 92 36 C 98.2 28.3 115.3 17.7 120 14 Z';

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

      <svg className="moon" viewBox="-10 -10 240 220">
        <defs>
          <filter id="moon-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        {/* A fat crescent with sharp tips; its inner edge is a sleeping face in profile, with a soft dark rim. */}
        <path className="moon-glow" d={MOON} filter="url(#moon-glow)" />
        <path className="moon-body" d={MOON} />
        <path
          className="face"
          d="M57 77 Q 67 71 77 75 M58 89 Q 68 82 78 88 M62 91 l -2 4 M68 92 l 0 4.5 M74 91 l 2 4 M88 114 q -6 1 -7 -4 M84 131 q -8 3 -13 -2 M66 104 q 7 8 3 17 M86 147 q -5 3 -10 0"
        />
        <polygon className="star-light" points={star(162, 56, 34)} />
        <polygon className="star-light" points={star(190, 150, 18)} />
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
