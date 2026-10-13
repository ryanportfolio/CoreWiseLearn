import type { Level, P2 } from './physics';

// Twelve pages, each teaching one idea by demonstration (the players cannot read). Level space is 40 x 25 cm, origin
// top left, y down the page. Every page must win with its `solution`, must not win blank, and must survive a wobbly
// child's copy of the solution: scripts/check-pencil-path.mjs proves all three.

/** Points along a quadratic Bezier from a through control c to b. */
function bend(a: P2, c: P2, b: P2, n = 16): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

export const LEVELS: Level[] = [
  {
    name: 'First line',
    start: [5, 3],
    cup: { x: 33, y: 23, w: 9, h: 4.5 },
    ink: 80,
    stars: [40, 61],
    solution: [[[3, 6], [29, 18.6]]],
  },
  {
    name: 'Mind the gap',
    start: [4, 3],
    cup: { x: 30, y: 23, w: 10, h: 4.5 },
    ink: 67,
    stars: [33, 51],
    noDraw: [{ x: 17, y: 0, w: 6, h: 25 }],
    solution: [bend([3, 5], [10.25, 19], [16.5, 15], 24)],
  },
  {
    name: 'Ink blot',
    start: [20, 3],
    cup: { x: 7, y: 23, w: 9, h: 4.5 },
    ink: 45,
    stars: [16, 24],
    blots: [{ x: 20, y: 20, r: 2.6 }],
    rulers: [[[24, 9], [36, 9]]],
    solution: [[[23, 6], [9, 18]]],
  },
  {
    name: 'Bounce',
    start: [5, 3],
    cup: { x: 33, y: 23, w: 9, h: 4.5 },
    ink: 47,
    stars: [24, 36],
    rulers: [[[24, 13], [24, 25]]],
    pads: [[[10, 23], [17, 23]]],
    noDraw: [{ x: 18, y: 0, w: 12, h: 25 }],
    solution: [[[3, 6], [8, 13]]],
  },
  {
    name: 'Uphill',
    start: [4, 3],
    cup: { x: 34.5, y: 16, w: 8, h: 3.5 },
    ink: 138,
    stars: [70, 106],
    rulers: [[[29.5, 16.2], [39.5, 16.2]]],
    blots: [{ x: 16, y: 24, r: 2.2 }, { x: 24, y: 24, r: 2.2 }],
    noDraw: [{ x: 12, y: 0, w: 14, h: 11 }],
    solution: [bend([2.5, 5], [9.5, 22], [29.5, 12.33], 24)],
  },
  {
    name: 'Shelf',
    start: [6, 3],
    cup: { x: 8, y: 23, w: 9, h: 4.5 },
    ink: 35,
    stars: [10, 15],
    rulers: [[[3, 8], [26, 10]], [[14, 16], [37, 14]]],
    solution: [[[30, 9], [33, 13]]],
  },
  {
    name: 'Windmill',
    start: [5, 3],
    cup: { x: 34, y: 23, w: 9, h: 4.5 },
    ink: 60,
    stars: [30, 46],
    spinners: [{ x: 20, y: 15, len: 3.4, speed: 1.2, phase: 0 }],
    solution: [[[2.9, 7.3], [27.9, 16.9]]],
  },
  {
    name: 'Short pencil',
    start: [5, 3],
    cup: { x: 34, y: 23, w: 9, h: 4.5 },
    ink: 30,
    stars: [15, 23],
    rulers: [[[2, 8], [18, 14]], [[25, 18], [31, 20]]],
    blots: [{ x: 21.5, y: 23.5, r: 2.4 }],
    solution: [[[13.9, 12.5], [25, 15.7]]],
  },
  {
    name: 'Hop',
    start: [4, 3],
    cup: { x: 34, y: 23, w: 9, h: 4.5 },
    ink: 93,
    stars: [47, 71],
    blots: [{ x: 21, y: 21.5, r: 2.4 }],
    solution: [[[3.6, 6.6], [3.86, 7.01], [4.29, 7.4], [4.9, 7.76], [5.68, 8.09], [6.64, 8.39], [7.77, 8.66], [9.07, 8.9], [10.56, 9.11], [12.21, 9.3], [14.04, 9.46], [16.04, 9.59], [18.22, 9.69], [20.57, 9.76], [23.1, 9.8]]],
  },
  {
    name: 'Turnaround',
    start: [9.5, 5.6],
    cup: { x: 7, y: 23, w: 9, h: 4.5 },
    ink: 71,
    stars: [36, 54],
    rulers: [[[8, 7], [22, 12]]],
    blots: [{ x: 15, y: 23, r: 2.4 }],
    noDraw: [{ x: 0, y: 8, w: 21, h: 8 }],
    solution: [[[16.6, 1.4], [19.21, 4], [21.37, 6.39], [23.08, 8.55], [24.36, 10.49], [25.18, 12.22], [25.56, 13.72], [25.5, 15], [24.99, 16.06], [24.04, 16.9], [22.64, 17.52], [20.8, 17.92], [18.51, 18.1], [15.78, 18.06], [12.6, 17.8]]],
  },
  {
    name: 'Two windmills',
    start: [5, 3],
    cup: { x: 34, y: 23, w: 9, h: 4.5 },
    ink: 62,
    stars: [29, 44],
    spinners: [
      { x: 15, y: 13, len: 3, speed: -1.3, phase: 0.6 },
      { x: 27, y: 17, len: 3, speed: 1.3, phase: 0 },
    ],
    noDraw: [{ x: 12, y: 0, w: 28, h: 9 }],
    solution: [[[32.9, 18.8], [1, 6.3]]],
  },
  {
    name: 'Grand tour',
    start: [4, 3],
    cup: { x: 34.5, y: 15, w: 8, h: 3.5 },
    ink: 73,
    stars: [37, 56],
    rulers: [[[29.5, 15.2], [39.5, 15.2]]],
    pads: [[[19, 23.5], [26, 22]]],
    blots: [{ x: 12, y: 24, r: 2 }, { x: 30, y: 24, r: 2 }],
    noDraw: [{ x: 22, y: 0, w: 18, h: 10 }],
    solution: [[[3.2, 8.5], [31.2, 12.1]], [[1.5, 3.7], [19.3, 24.7]]],
  },
];
