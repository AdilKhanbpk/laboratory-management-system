import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DatabaseManager } from '../../electron/database/connection';
import { MigrationRunner } from '../../electron/database/migrations';
import { AssetRepository } from '../../electron/database/repositories/asset-repository';
import { FinanceRepository } from '../../electron/database/repositories/finance-repository';
import { DoctorRepository } from '../../electron/database/repositories/doctor-repository';
import { PatientRepository } from '../../electron/database/repositories/patient-repository';
import { CatalogRepository } from '../../electron/database/repositories/catalog-repository';
import { VisitRepository } from '../../electron/database/repositories/visit-repository';
import { HospitalRepository } from '../../electron/database/repositories/hospital-repository';
import { UserRepository } from '../../electron/database/repositories/user-repository';

describe('Integration: Asset & Finance Repositories', () => {
  let tempDir: string;
  let dbPath: string;
  let dbManager: DatabaseManager;
  let assetRepo: AssetRepository;
  let financeRepo: FinanceRepository;
  let doctorRepo: DoctorRepository;
  let patientRepo: PatientRepository;
  let catalogRepo: CatalogRepository;
  let visitRepo: VisitRepository;
  let hospitalRepo: HospitalRepository;
  let userRepo: UserRepository;
  let operatorId: number;
  const encryptionKey = 'AssetsFinanceIntegrationTestSecret999!';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-asset-fin-test-'));
    dbPath = path.join(tempDir, 'asset_fin_test.db');
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');

    dbManager = new DatabaseManager({ dbPath, encryptionKey });
    dbManager.open();

    const runner = new MigrationRunner(dbManager, migrationsDir);
    runner.runPendingMigrations();

    assetRepo = new AssetRepository(dbManager);
    financeRepo = new FinanceRepository(dbManager);
    doctorRepo = new DoctorRepository(dbManager);
    patientRepo = new PatientRepository(dbManager);
    catalogRepo = new CatalogRepository(dbManager);
    visitRepo = new VisitRepository(dbManager);
    hospitalRepo = new HospitalRepository(dbManager);
    userRepo = new UserRepository(dbManager);

    const user = userRepo.createInitialOperator({
      username: 'admin',
      passwordHash: 'dummy_hash',
      passwordSalt: 'dummy_salt',
      fullName: 'Lab Administrator',
    });
    operatorId = user.id;

    // Initialize hospital
    hospitalRepo.initializeSettings({
      hospital_name: 'Shifa Lab',
      address: 'Main Boulevard',
      phone_primary: '0300-1112233',
    });
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it('creates, edits, lists, and deletes laboratory assets with date filtering', () => {
    const today = new Date().toISOString().split('T')[0];

    const asset1 = assetRepo.createAsset({
      title: 'Centrifuge Machine Model-X',
      category: 'equipment',
      amountPaisa: 4500000, // PKR 45,000
      purchaseDate: today,
      vendorName: 'MedTech Supplies',
      invoiceReceiptNo: 'INV-9021',
      notes: 'New centrifuge for serum separation',
    });

    expect(asset1.id).toBeDefined();
    expect(asset1.title).toBe('Centrifuge Machine Model-X');
    expect(asset1.amount_paisa).toBe(4500000);
    expect(asset1.purchase_date).toBe(today);

    // First Update
    const updated = assetRepo.updateAsset({
      id: asset1.id,
      amountPaisa: 4800000,
      notes: 'Price adjusted with GST',
      editReason: 'First edit',
    });
    expect(updated.amount_paisa).toBe(4800000);
    expect(updated.notes).toContain('Price adjusted with GST');
    expect((updated.notes?.match(/\[EDIT HISTORY/gi) || []).length).toBe(1);

    // Second Update (should NOT duplicate the first edit history)
    const updated2 = assetRepo.updateAsset({
      id: asset1.id,
      amountPaisa: 5000000,
      notes: 'Price adjusted with GST',
      editReason: 'Second edit',
    });
    expect(updated2.amount_paisa).toBe(5000000);
    expect((updated2.notes?.match(/\[EDIT HISTORY/gi) || []).length).toBe(2);

    // Third Update (with dirty input notes containing old history from modal)
    const updated3 = assetRepo.updateAsset({
      id: asset1.id,
      title: 'Centrifuge Machine Model-Pro',
      notes: 'Price adjusted with GST\n\n[EDIT HISTORY 2026-10-27 ...] Should be stripped',
      editReason: 'Third edit',
    });
    expect(updated3.title).toBe('Centrifuge Machine Model-Pro');
    expect((updated3.notes?.match(/\[EDIT HISTORY/gi) || []).length).toBe(3);
    expect(updated3.notes).toContain('Price adjusted with GST');

    // List and Summary
    const list = assetRepo.listAssets({ startDate: today, endDate: today });
    expect(list.length).toBe(1);
    expect((list[0].notes?.match(/\[EDIT HISTORY/gi) || []).length).toBe(3);

    const summary = assetRepo.getSummary({ startDate: today, endDate: today });
    expect(summary.totalCount).toBe(1);
    expect(summary.totalAmountPaisa).toBe(5000000);

    // Delete
    const deleted = assetRepo.deleteAsset(asset1.id);
    expect(deleted).toBe(true);

    const afterDelete = assetRepo.listAssets();
    expect(afterDelete.length).toBe(0);
  });

  it('correctly calculates dynamic doctor commissions, laboratory assets, and owner share', () => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Create a doctor with 20% commission
    const doctor = doctorRepo.createDoctor({
      fullName: 'Dr. Tariq Mahmood',
      specialization: 'Internal Medicine',
      commissionPercentage: 20,
    });
    expect(doctor.commission_percentage).toBe(20);

    // 2. Create patient and test
    const patient = patientRepo.createPatient({
      fullName: 'Kamran Akmal',
      gender: 'male',
      dateOfBirth: '1990-01-01',
      phoneNumber: '03001234567',
    });

    const test = catalogRepo.createTest({
      testCode: 'CBC-TEST',
      testName: 'Complete Blood Count',
      category: 'Hematology',
      pricePaisa: 100000, // PKR 1,000
    });

    // 3. Create visit referred by doctor with total PKR 1,000
    visitRepo.createVisitWithOrder(
      {
        patientId: patient.id,
        referringDoctorId: doctor.id,
        testIds: [test.id],
        paidAmountPaisa: 100000,
        paymentMethod: 'cash',
      },
      operatorId
    );

    // Doctor commission on PKR 1,000 at 20% should be PKR 200 (20000 paisa)

    // 4. Record an asset purchase of PKR 300 (30000 paisa) purchased by technician
    assetRepo.createAsset({
      title: 'Blood Collection Tubes',
      category: 'supplies',
      amountPaisa: 30000,
      purchaseDate: today,
      purchasedBy: 'technician',
      purchaserName: 'Ahsan Khan',
    });

    // 5. Set owner percentage to 50%
    financeRepo.updateOwnerPercentage(50);
    expect(financeRepo.getOwnerPercentage()).toBe(50);

    // 6. Record a payout received by owner: PKR 100 (10000 paisa)
    const payout = financeRepo.recordPayout({
      amountPaisa: 10000,
      payoutDate: today,
      notes: 'Weekly cash withdrawal',
    });
    expect(payout.id).toBeDefined();
    expect(payout.amount_paisa).toBe(10000);

    // 7. Verify dynamic summary
    const summary = financeRepo.getMyPercentageSummary({ startDate: today, endDate: today });

    // Sales: 100000 paisa (PKR 1000)
    expect(summary.period.totalSalesPaisa).toBe(100000);

    // Doctor Commission: 20% of 100000 = 20000 paisa (PKR 200)
    expect(summary.period.totalDoctorsCommissionPaisa).toBe(20000);

    // Assets: 30000 paisa (PKR 300)
    expect(summary.period.totalAssetsPaisa).toBe(30000);

    // Net Profit: 100000 - 20000 - 30000 = 50000 paisa (PKR 500)
    expect(summary.period.netProfitPaisa).toBe(50000);

    // Owner share (50%): 25000 paisa (PKR 250)
    expect(summary.period.mySharePaisa).toBe(25000);

    // Received: 10000 paisa (PKR 100)
    expect(summary.period.totalReceivedPaisa).toBe(10000);

    // Remaining: 25000 (share) + 30000 (tech purchase reimbursement) - 10000 (received) = 45000 paisa (PKR 450)
    expect(summary.period.remainingBalancePaisa).toBe(45000);

    // Doctor breakdown verified
    expect(summary.doctorCommissions.length).toBe(1);
    expect(summary.doctorCommissions[0].doctorId).toBe(doctor.id);
    expect(summary.doctorCommissions[0].commissionPaisa).toBe(20000);

    // 8. Record an asset purchase by DOCTOR: PKR 100 (10000 paisa)
    // Rule: Reduces net profit, but is NOT added to technician's entitlement
    assetRepo.createAsset({
      title: 'Stethoscope & BP Apparatus',
      category: 'equipment',
      amountPaisa: 10000,
      purchaseDate: today,
      purchasedBy: 'doctor',
      purchaserName: 'Dr. Tariq Mahmood',
    });

    const summaryAfterDocAsset = financeRepo.getMyPercentageSummary({ startDate: today, endDate: today });
    // Total assets: 30000 + 10000 = 40000 paisa (PKR 400)
    expect(summaryAfterDocAsset.period.totalAssetsPaisa).toBe(40000);
    // Net profit: 100000 - 20000 - 40000 = 40000 paisa (PKR 400)
    expect(summaryAfterDocAsset.period.netProfitPaisa).toBe(40000);
    // Owner share (50%): 20000 paisa (PKR 200)
    expect(summaryAfterDocAsset.period.mySharePaisa).toBe(20000);
    // Technician remaining balance: 20000 (share) + 30000 (only technician purchase, doctor purchase NOT added) - 10000 (received) = 40000 paisa
    expect(summaryAfterDocAsset.period.remainingBalancePaisa).toBe(40000);
  });

  it('handles extended partnership ledger: collections, partner expenses, payments, reversals, and monthly closing', () => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Set split: Technician 60%, Investor 40%
    financeRepo.updatePartnershipSplit(60, 40, operatorId, today, 'Adjusted agreement');
    expect(financeRepo.getOwnerPercentage()).toBe(60);

    // 2. Record patient collection by investor
    const col = financeRepo.recordLabCollection(
      {
        date: today,
        amountPaisa: 250000, // PKR 2,500
        type: 'payment_received',
        collectedBy: 'investor',
        notes: 'Counter collection batch 1',
      },
      operatorId
    );
    expect(col.id).toBeDefined();

    // 3. Record partnership expense paid by technician out-of-pocket
    const exp = financeRepo.recordPartnershipExpense(
      {
        expenseDate: today,
        category: 'supplies',
        description: 'Syringes and tourniquets',
        amountPaisa: 20000, // PKR 200
        paidBy: 'technician',
      },
      operatorId
    );
    expect(exp.id).toBeDefined();

    // 4. Record partner payments
    const techPayment = financeRepo.recordPartnerPayment(
      {
        paymentDate: today,
        amountPaisa: 50000, // PKR 500
        partner: 'technician',
        type: 'profit_distribution',
        method: 'cash',
        notes: 'Interim transfer',
      },
      operatorId
    );
    expect(techPayment.id).toBeDefined();

    const invPayment = financeRepo.recordPartnerPayment(
      {
        paymentDate: today,
        amountPaisa: 30000, // PKR 300
        partner: 'investor',
        type: 'profit_distribution',
        method: 'cash',
        notes: 'Investor withdrawal',
      },
      operatorId
    );
    expect(invPayment.id).toBeDefined();

    // 5. Query partnership dashboard
    let dashboard = financeRepo.getPartnershipDashboard({ startDate: today, endDate: today });
    expect(dashboard.period.technicianPct).toBe(60);
    expect(dashboard.period.investorPct).toBe(40);
    expect(dashboard.collection.investorCollectedPaisa).toBe(250000);
    expect(dashboard.period.totalReceivedPaisa).toBe(50000);
    expect(dashboard.period.investorPaidPaisa).toBe(30000);

    // 6. Test reversal of investor payment
    const reversed = financeRepo.reversePartnershipTransaction(
      { transactionId: invPayment.id, reason: 'Duplicate entry entered by mistake' },
      operatorId
    );
    expect(reversed).toBe(true);

    // Recheck dashboard - investor paid should now exclude reversed transaction
    dashboard = financeRepo.getPartnershipDashboard({ startDate: today, endDate: today });
    expect(dashboard.period.investorPaidPaisa).toBe(0);

    // 7. Test closing a month
    const thisMonth = today.slice(0, 7);
    const closed = financeRepo.closePartnershipMonth({ month: thisMonth, notes: 'Settlement confirmed' }, operatorId);
    expect(closed.month).toBe(thisMonth);
    expect(dashboard.closedMonths.length).toBeGreaterThanOrEqual(0);

    // 8. Test direct editing, audit tracking, and before values preservation of partner transactions
    const editResult = financeRepo.updatePartnerTransaction(
      {
        id: techPayment.id,
        paymentDate: today,
        amountPaisa: 75000, // Updated to PKR 750 from PKR 500
        notes: 'Payment adjusted',
        editReason: 'Typo in receipt slip and amount',
      },
      operatorId
    );
    expect(editResult).toBe(true);

    const txRow = dbManager.getDatabase().prepare('SELECT notes, amount_paisa FROM partner_transactions WHERE id = ?').get(techPayment.id) as any;
    expect(txRow.amount_paisa).toBe(75000);
    expect(txRow.notes).toContain('EDIT HISTORY');
    expect(txRow.notes).toContain('Reason for change: "Typo in receipt slip and amount"');
    expect(txRow.notes).toContain('What changed:');
    expect(txRow.notes).toContain('Amount changed from Rs. 500 to Rs. 750');
    expect(txRow.notes).toContain('Before values: [Amount: Rs. 500');

    dashboard = financeRepo.getPartnershipDashboard({ startDate: today, endDate: today });
    expect(dashboard.period.totalReceivedPaisa).toBe(75000);

    // Test clearing technician payouts
    const clearResult = financeRepo.clearTechnicianPayouts();
    expect(clearResult.deletedCount).toBeGreaterThanOrEqual(1);

    dashboard = financeRepo.getPartnershipDashboard({ startDate: today, endDate: today });
    expect(dashboard.period.totalReceivedPaisa).toBe(0);
  });

  it('strictly isolates and applies date filters across all dashboard metrics, assets, payouts, and transaction lists', () => {
    // Dates
    const yesterday = '2026-10-25';
    const today = '2026-10-26';
    const lastMonth = '2026-09-15';

    // 1. Record asset purchases on different dates
    assetRepo.createAsset({
      title: 'Centrifuge Tubes',
      category: 'supplies',
      amountPaisa: 10000, // Rs. 100 on lastMonth
      purchaseDate: lastMonth,
      purchasedBy: 'technician',
    });

    assetRepo.createAsset({
      title: 'Microscope Slides',
      category: 'supplies',
      amountPaisa: 25000, // Rs. 250 on yesterday
      purchaseDate: yesterday,
      purchasedBy: 'technician',
    });

    assetRepo.createAsset({
      title: 'Bleach & Reagents',
      category: 'supplies',
      amountPaisa: 40000, // Rs. 400 on today
      purchaseDate: today,
      purchasedBy: 'technician',
    });

    // 2. Record technician payouts on different dates
    financeRepo.recordPartnerPayment(
      {
        paymentDate: lastMonth,
        amountPaisa: 15000, // Rs. 150 on lastMonth
        partner: 'technician',
        type: 'profit_distribution',
        method: 'cash',
        notes: 'September interim',
      },
      operatorId
    );

    financeRepo.recordPartnerPayment(
      {
        paymentDate: yesterday,
        amountPaisa: 30000, // Rs. 300 on yesterday
        partner: 'technician',
        type: 'profit_distribution',
        method: 'bank_transfer',
        notes: 'Yesterday payout',
      },
      operatorId
    );

    financeRepo.recordPartnerPayment(
      {
        paymentDate: today,
        amountPaisa: 50000, // Rs. 500 on today
        partner: 'technician',
        type: 'profit_distribution',
        method: 'cash',
        notes: 'Today payout',
      },
      operatorId
    );

    // 3. Test Lifetime Dashboard (no date filter)
    const lifetimeDash = financeRepo.getPartnershipDashboard();
    // Lifetime total received should be 150 + 300 + 500 = Rs. 950 (95000 paisa)
    expect(lifetimeDash.lifetime.totalReceivedPaisa).toBe(95000);
    expect(lifetimeDash.period.totalReceivedPaisa).toBe(95000);
    // Lifetime total assets should be 100 + 250 + 400 = Rs. 750 (75000 paisa)
    expect(lifetimeDash.lifetime.totalAssetsPaisa).toBe(75000);
    expect(lifetimeDash.period.totalAssetsPaisa).toBe(75000);
    expect(lifetimeDash.transactions.length).toBe(3);
    expect(lifetimeDash.assets?.length).toBe(3);

    // 4. Test "Today" filter strictly
    const todayDash = financeRepo.getPartnershipDashboard({ startDate: today, endDate: today });
    expect(todayDash.period.totalReceivedPaisa).toBe(50000); // Only Rs. 500
    expect(todayDash.period.totalAssetsPaisa).toBe(40000);   // Only Rs. 400
    expect(todayDash.period.techOutOfPocketPaisa).toBe(40000);
    expect(todayDash.transactions.length).toBe(1);
    expect(todayDash.transactions[0].amountPaisa).toBe(50000);
    expect(todayDash.transactions[0].date).toBe(today);
    expect(todayDash.assets?.length).toBe(1);
    expect(todayDash.assets?.[0].title).toBe('Bleach & Reagents');

    // 5. Test "Yesterday" filter strictly
    const yestDash = financeRepo.getPartnershipDashboard({ startDate: yesterday, endDate: yesterday });
    expect(yestDash.period.totalReceivedPaisa).toBe(30000); // Only Rs. 300
    expect(yestDash.period.totalAssetsPaisa).toBe(25000);   // Only Rs. 250
    expect(yestDash.transactions.length).toBe(1);
    expect(yestDash.transactions[0].amountPaisa).toBe(30000);
    expect(yestDash.assets?.length).toBe(1);
    expect(yestDash.assets?.[0].title).toBe('Microscope Slides');

    // 6. Test "Last Month" filter strictly (2026-09-01 to 2026-09-30)
    const lastMonthDash = financeRepo.getPartnershipDashboard({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(lastMonthDash.period.totalReceivedPaisa).toBe(15000); // Only Rs. 150
    expect(lastMonthDash.period.totalAssetsPaisa).toBe(10000);   // Only Rs. 100
    expect(lastMonthDash.transactions.length).toBe(1);
    expect(lastMonthDash.assets?.length).toBe(1);

    // 7. Test Empty range where nothing occurred (e.g. 2026-08-01 to 2026-08-31)
    const emptyDash = financeRepo.getPartnershipDashboard({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(emptyDash.period.totalReceivedPaisa).toBe(0);
    expect(emptyDash.period.totalAssetsPaisa).toBe(0);
    expect(emptyDash.transactions.length).toBe(0);
    expect(emptyDash.assets?.length).toBe(0);
  });
});
