/** Dense 2D grid of small unsigned integers, row-major. */
export class Grid {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    fill = 0,
  ) {
    this.data = new Uint8Array(width * height).fill(fill);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number {
    return this.data[y * this.width + x] as number;
  }

  set(x: number, y: number, value: number): void {
    this.data[y * this.width + x] = value;
  }
}
