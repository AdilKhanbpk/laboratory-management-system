import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface LogoValidationResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
}

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Validates image buffer using magic bytes to prevent file extension spoofing.
 */
export function validateImageBuffer(buffer: Buffer): LogoValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Image file is empty.' };
  }

  if (buffer.length > MAX_LOGO_SIZE_BYTES) {
    return { valid: false, error: 'Image file size exceeds the 2 MB maximum limit.' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg' };
  }

  // WebP: 52 49 46 46 .... 57 45 42 50 ("RIFF" ... "WEBP")
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { valid: true, mimeType: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Unsupported image format. Only valid PNG, JPEG, and WebP images are allowed.',
  };
}

export class LogoService {
  private brandingDir: string;

  constructor(userDataPath: string) {
    this.brandingDir = path.join(userDataPath, 'branding');
    if (!fs.existsSync(this.brandingDir)) {
      fs.mkdirSync(this.brandingDir, { recursive: true });
    }
  }

  /**
   * Securely saves an uploaded logo base64/buffer.
   * Generates a random UUID filename and verifies file magic bytes.
   */
  public saveLogo(base64Data: string): { relativePath: string; mimeType: string } {
    // Strip optional data URL prefix (e.g. data:image/png;base64,...)
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Clean, 'base64');

    const validation = validateImageBuffer(buffer);
    if (!validation.valid || !validation.mimeType) {
      throw new Error(validation.error || 'Invalid logo image file.');
    }

    const extension = validation.mimeType === 'image/png' ? 'png' : validation.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const safeFilename = `logo_${crypto.randomUUID()}.${extension}`;
    const destinationPath = path.join(this.brandingDir, safeFilename);

    // Guard against directory traversal
    const normalizedDest = path.normalize(destinationPath);
    if (!normalizedDest.startsWith(path.normalize(this.brandingDir))) {
      throw new Error('Directory traversal attempt detected in logo storage.');
    }

    fs.writeFileSync(destinationPath, buffer);

    return {
      relativePath: path.join('branding', safeFilename).replace(/\\/g, '/'),
      mimeType: validation.mimeType,
    };
  }

  /**
   * Reads a logo file as base64 data URL for display in the frontend.
   */
  public getLogoDataUrl(relativePath: string | null | undefined): string | null {
    if (!relativePath) return null;

    // Sanitize path against directory traversal
    const safeRelative = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(path.dirname(this.brandingDir), safeRelative);

    if (!fullPath.startsWith(path.normalize(this.brandingDir))) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(fullPath);
      const validation = validateImageBuffer(buffer);
      if (!validation.valid || !validation.mimeType) {
        return null;
      }
      return `data:${validation.mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }
}

