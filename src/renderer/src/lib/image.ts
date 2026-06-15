/** A rectangle in overlay (DIP / CSS pixel) coordinates. */
export type Box = { x: number; y: number; w: number; h: number }

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}
