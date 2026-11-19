import type {Crop} from './layout';

export interface Photo {
  id: string;
  name: string;
  blob: Blob;
  /** An object URL of the file, for the screen. */
  url: string;
  image: HTMLImageElement;
  /** Pixel size, already turned the way the camera held it. */
  width: number;
  height: number;
  spanX: number;
  spanY: number;
  crop: Crop;
}

export const SPANS = [
  {spanX: 1, spanY: 1, label: 'Normal'},
  {spanX: 2, spanY: 1, label: 'Wide'},
  {spanX: 1, spanY: 2, label: 'Tall'},
  {spanX: 2, spanY: 2, label: 'Big'},
] as const;

/** Opens an image file. Rejects when the browser cannot read it (a HEIC photo outside Safari, say). */
export const openImage = async (blob: Blob): Promise<Pick<Photo, 'url' | 'image' | 'width' | 'height'>> => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }

  return {url, image, width: image.naturalWidth, height: image.naturalHeight};
};

export const newId = (): string =>
  'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
