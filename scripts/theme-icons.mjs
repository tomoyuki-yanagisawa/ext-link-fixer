import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const sizes = [16, 32, 48, 128];

export async function generateThemeIcons() {
  await mkdir('public/theme-icons', { recursive: true });

  for (const size of sizes) {
    await sharp('assets/icon.svg')
      .resize(size, size)
      .png()
      .toFile(`public/theme-icons/light-${size}.png`);
    await sharp('assets/icon-dark.svg')
      .resize(size, size)
      .png()
      .toFile(`public/theme-icons/dark-${size}.png`);
  }
}
