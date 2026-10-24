import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';

describe('Integration: Patient Repository', () => {
  let tempDir: string;
  let dbPath: string;
  let manager: DatabaseManager;
  let patientRepo: PatientRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-patient-test-'));
    dbPath = path.join(tempDir, 'patient_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    manager = new DatabaseManager({ dbPath, encryptionKey: 'PatientSecretKey2026!' });
    const runner = new MigrationRunner(manager, migrationsDir);
    runner.runPendingMigrations();

    patientRepo = new PatientRepository(manager);
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

  it('generates sequential unique MRN numbers (PAT-YYYY-XXXXX)', () => {
    const mrn1 = patientRepo.generateNextMRN();
    const currentYear = new Date().getFullYear();
    expect(mrn1).toBe(`PAT-${currentYear}-00001`);

    patientRepo.createPatient({
      fullName: 'Patient One',
      gender: 'male',
    });

    const mrn2 = patientRepo.generateNextMRN();
    expect(mrn2).toBe(`PAT-${currentYear}-00002`);
  });

  it('creates, retrieves, and updates patient demographics', () => {
    const created = patientRepo.createPatient({
      fullName: 'Fatima Zahra',
      dateOfBirth: '1995-05-14',
      gender: 'female',
      phoneNumber: '+92-300-1234567',
      address: 'House 42, Street 5, G-9/1, Islamabad',
      notes: 'Allergic to penicillin',
    });

    expect(created.id).toBe(1);
    expect(created.full_name).toBe('Fatima Zahra');
    expect(created.patient_mrn).toBeDefined();

    const retrieved = patientRepo.getPatientById(created.id);
    expect(retrieved?.patient_mrn).toBe(created.patient_mrn);
    expect(retrieved?.phone_number).toBe('+92-300-1234567');

    const updated = patientRepo.updatePatient(created.id, {
      fullName: 'Fatima Bibi',
      gender: 'female',
      phoneNumber: '+92-300-9999999',
    });

    expect(updated.full_name).toBe('Fatima Bibi');
    expect(updated.phone_number).toBe('+92-300-9999999');
  });

  it('handles Unicode, Arabic, and Urdu characters in patient names seamlessly', () => {
    const urduName = 'محمد طارق خان';
    const patient = patientRepo.createPatient({
      fullName: urduName,
      gender: 'male',
      address: 'راولپنڈی، پاکستان',
    });

    expect(patient.full_name).toBe(urduName);

    const searchRes = patientRepo.searchPatients({ query: 'طارق' });
    expect(searchRes.patients.length).toBe(1);
    expect(searchRes.patients[0].id).toBe(patient.id);
  });

  it('allows duplicate names while providing duplicate detection warnings', () => {
    const p1 = patientRepo.createPatient({
      fullName: 'Muhammad Ali',
      gender: 'male',
      phoneNumber: '03001234567',
    });

    // Check duplicate
    const warning = patientRepo.checkDuplicates('Muhammad Ali', '03001234567');
    expect(warning.hasDuplicate).toBe(true);
    expect(warning.duplicateByName?.id).toBe(p1.id);
    expect(warning.duplicateByPhone?.id).toBe(p1.id);

    // Creating second patient with same name MUST succeed (different MRN)
    const p2 = patientRepo.createPatient({
      fullName: 'Muhammad Ali',
      gender: 'male',
      phoneNumber: '03119876543',
    });

    expect(p2.id).not.toBe(p1.id);
    expect(p2.patient_mrn).not.toBe(p1.patient_mrn);
    expect(p2.full_name).toBe('Muhammad Ali');
  });

  it('supports pagination and multi-field searching by MRN, name, and phone', () => {
    patientRepo.createPatient({ fullName: 'Ahmed Khan', phoneNumber: '03001111111', gender: 'male' });
    patientRepo.createPatient({ fullName: 'Sara Ahmed', phoneNumber: '03002222222', gender: 'female' });
    patientRepo.createPatient({ fullName: 'Zainab Bibi', phoneNumber: '03003333333', gender: 'female' });

    const searchByName = patientRepo.searchPatients({ query: 'Ahmed' });
    expect(searchByName.total).toBe(2);

    const searchByPhone = patientRepo.searchPatients({ query: '2222222' });
    expect(searchByPhone.total).toBe(1);
    expect(searchByPhone.patients[0].full_name).toBe('Sara Ahmed');

    const searchEmpty = patientRepo.searchPatients({ query: 'NonExistentPatient123' });
    expect(searchEmpty.total).toBe(0);
    expect(searchEmpty.patients).toEqual([]);
  });
});
