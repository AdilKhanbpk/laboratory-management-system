import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';

describe('Integration: Doctor Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let doctorRepo: DoctorRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-doctor-test-'));
    dbPath = path.join(tempDir, 'doctor_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'DoctorSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    doctorRepo = new DoctorRepository(manager);
  });

  afterEach(() => {
    if (manager) manager.close();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('creates, retrieves, and updates doctor profiles', () => {
    const doc = doctorRepo.createDoctor({
      fullName: 'Dr. Tariq Mehmood',
      specialization: 'Consultant Hematologist',
      phoneNumber: '+92-300-5551234',
      clinicHospitalName: 'Armed Forces Institute of Pathology (AFIP)',
    });

    expect(doc.id).toBe(1);
    expect(doc.full_name).toBe('Dr. Tariq Mehmood');
    expect(doc.is_active).toBe(1);

    const updated = doctorRepo.updateDoctor(doc.id, {
      fullName: 'Prof. Dr. Tariq Mehmood',
      specialization: 'Consultant Hematologist & Oncologist',
    });

    expect(updated.full_name).toBe('Prof. Dr. Tariq Mehmood');
    expect(updated.specialization).toBe('Consultant Hematologist & Oncologist');
  });

  it('preserves historical doctor records via soft deactivation (is_active = 0)', () => {
    const doc1 = doctorRepo.createDoctor({ fullName: 'Dr. Active One' });
    const doc2 = doctorRepo.createDoctor({ fullName: 'Dr. Will Deactivate' });

    // Active listing
    const activeDocs = doctorRepo.listDoctors({ includeInactive: false });
    expect(activeDocs.length).toBe(2);

    // Deactivate doc2
    doctorRepo.setDoctorActiveStatus(doc2.id, false);

    // Default listing must hide doc2 from new visits
    const updatedActiveDocs = doctorRepo.listDoctors({ includeInactive: false });
    expect(updatedActiveDocs.length).toBe(1);
    expect(updatedActiveDocs[0].id).toBe(doc1.id);

    // But doctor record STILL exists in database for historical reports
    const recordStillExists = doctorRepo.getDoctorById(doc2.id);
    expect(recordStillExists).not.toBeNull();
    expect(recordStillExists?.is_active).toBe(0);

    // Full listing includes inactive doctor
    const allDocs = doctorRepo.listDoctors({ includeInactive: true });
    expect(allDocs.length).toBe(2);
  });

  it('detects duplicate doctor names and provides non-blocking warnings', () => {
    doctorRepo.createDoctor({
      fullName: 'Dr. Imran Khan',
      specialization: 'General Physician',
    });

    const warning = doctorRepo.checkDuplicates('Dr. Imran Khan');
    expect(warning.hasDuplicate).toBe(true);
    expect(warning.duplicateByName?.full_name).toBe('Dr. Imran Khan');

    // Adding second doctor with same name succeeds (e.g. Dr. Imran Khan from a different hospital)
    const doc2 = doctorRepo.createDoctor({
      fullName: 'Dr. Imran Khan',
      specialization: 'Pediatrician',
    });

    expect(doc2.id).toBe(2);
  });
});

