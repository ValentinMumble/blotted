// Photos are kept whole, at their original size, and the exports draw from them. So a phone holds many of them, the
// screen only ever shows a light copy (1400 px on the long side), and an original is opened only while one export
// draws it, one at a time. Keeping a phone camera's 12 to 24 megapixel originals open is what made Safari reload.

import type {Crop} from './layout';

export interface Photo {
  id: string;
  name: string;
  /** The original file: what is kept on the device and drawn into the exports. */
  blob: Blob;
  /** The screen copy, and an object URL of it. Exports fall back to it if a phone cannot open the original. */
  preview: Blob;
  url: string;
  /** The original's pixel size, already turned the way the camera held it. */
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

/**
 * The file pickers. Buttons that open them are labels for these inputs: Safari on iPhone only opens a picker from a
 * real tap on the input or its label, not from a script's click on a hidden input.
 */
export const ADD_PHOTOS_INPUT = 'add-photos-input';
export const REPLACE_PHOTO_INPUT = 'replace-photo-input';

/** Lets a label that opens a picker also answer Enter and Space, as a button does. */
export const openPickerOnKey = (inputId: string) => (event: {key: string; preventDefault: () => void}) => {
  if ('Enter' !== event.key && ' ' !== event.key) return;
  event.preventDefault();
  document.getElementById(inputId)?.click();
};

const SCREEN_EDGE = 1400;

/** Opens an image file. Rejects when the browser cannot read it (a HEIC photo outside Safari, say). */
const loadImage = (blob: Blob): Promise<{image: HTMLImageElement; release: () => void}> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const release = () => {
      image.src = '';
      URL.revokeObjectURL(url);
    };
    image.onload = () => resolve({image, release});
    image.onerror = () => {
      release();
      reject(new Error('Unreadable image'));
    };
    image.src = url;
  });

/** A JPEG of the image, at most this many pixels on its long side, on white. */
const shrink = (
  image: HTMLImageElement,
  longEdge: number,
  quality: number,
): Promise<{blob: Blob; width: number; height: number}> => {
  const scale = Math.min(1, longEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      blob => {
        canvas.width = canvas.height = 0;
        if (blob) resolve({blob, width, height});
        else reject(new Error('Could not shrink the image'));
      },
      'image/jpeg',
      quality,
    ),
  );
};

/** A picked or kept original, whole, with its screen copy. The original is opened once, then let go. */
export const openPhoto = async (blob: Blob): Promise<Pick<Photo, 'blob' | 'preview' | 'url' | 'width' | 'height'>> => {
  const {image, release} = await loadImage(blob);
  try {
    const screen = await shrink(image, SCREEN_EDGE, 0.85);

    return {
      blob,
      preview: screen.blob,
      url: URL.createObjectURL(screen.blob),
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  } finally {
    release();
  }
};

/**
 * Opens an image for drawing and lets it go right after. Through an <img>, so the camera's turn (EXIF) is applied
 * the same way as on screen.
 */
export const withImage = async <Result>(
  blob: Blob,
  draw: (image: CanvasImageSource, width: number, height: number) => Result,
): Promise<Result> => {
  const {image, release} = await loadImage(blob);
  try {
    return draw(image, image.naturalWidth, image.naturalHeight);
  } finally {
    release();
  }
};

export const newId = (): string =>
  'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
