import { nativeImage, type NativeImage } from 'electron';

/** 16×16 solid #3d9cf0 PNG (embedded so dist-electron needs no asset copy). */
const TRAY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR42mOwnfPhPyWYYdSAUQNGDRguBgAAS7vIH3f8wp8AAAAASUVORK5CYII=';

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromDataURL(
    `data:image/png;base64,${TRAY_PNG_BASE64}`,
  );
  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }
  return image;
}
