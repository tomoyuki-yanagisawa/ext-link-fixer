import { mkdir, rm } from 'node:fs/promises';
import sharp from 'sharp';

const sizes = [16, 32, 48, 128];
const outDir = 'public/theme-icons';

export async function generateThemeIcons() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const size of sizes) {
    // icon.svg はライトテーマ向け、icon-dark.svg はダークテーマ向け
    await sharp('assets/icon.svg')
      .resize(size, size)
      .png()
      .toFile(`${outDir}/icon-on-light-${size}.png`);
    await sharp('assets/icon-dark.svg')
      .resize(size, size)
      .png()
      .toFile(`${outDir}/icon-on-dark-${size}.png`);
  }
}
