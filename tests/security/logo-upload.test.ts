import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LogoService, validateImageBuffer } from '../../electron/security/logo-service';

describe('Security: Logo Upload & Image Validation', () => {
  let tempDir: string;
  let logoService: LogoService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-logo-test-'));
    logoService = new LogoService(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('validates authentic PNG magic bytes', () => {
    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validation = validateImageBuffer(pngHeader);
    expect(validation.valid).toBe(true);
    expect(validation.mimeType).toBe('image/png');
  });

  it('validates authentic JPEG magic bytes', () => {
    // Valid JPEG signature: FF D8 FF
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validation = validateImageBuffer(jpegHeader);
    expect(validation.valid).toBe(true);
    expect(validation.mimeType).toBe('image/jpeg');
  });

  it('rejects corrupt, executable, or text files disguised as images', () => {
    const fakeText = Buffer.from('<?php echo "evil script"; ?>');
    const validation = validateImageBuffer(fakeText);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('Unsupported image format');
  });

  it('rejects oversized image files exceeding 2 MB', () => {
    // 2.5 MB buffer
    const oversized = Buffer.alloc(2.5 * 1024 * 1024);
    oversized[0] = 0x89;
    oversized[1] = 0x50;
    oversized[2] = 0x4e;
    oversized[3] = 0x47;
    oversized[4] = 0x0d;
    oversized[5] = 0x0a;
    oversized[6] = 0x1a;
    oversized[7] = 0x0a;

    const validation = validateImageBuffer(oversized);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('exceeds the 2 MB maximum limit');
  });

  it('saves logo with sanitized UUID filename and retrieves data URL safely', () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const base64Data = `data:image/png;base64,${pngBytes.toString('base64')}`;

    const saved = logoService.saveLogo(base64Data);
    expect(saved.relativePath).toMatch(/^branding\/logo_[a-f0-9\-]+\.png$/);

    const dataUrl = logoService.getLogoDataUrl(saved.relativePath);
    expect(dataUrl).toContain('data:image/png;base64,');

    // Directory traversal attempt must be blocked
    const traversalAttempt = logoService.getLogoDataUrl('../../windows/system32/cmd.exe');
    expect(traversalAttempt).toBeNull();
  });
});

