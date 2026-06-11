const { db } = require('../database');

function runMigration() {
  console.log('Running migration 001: Add pricing fields...');

  try {
    db.prepare(`
      ALTER TABLE member_levels ADD COLUMN max_deduction_percent INTEGER NOT NULL DEFAULT 30
    `).run();
    console.log('  - Added max_deduction_percent to member_levels');
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      throw e;
    }
    console.log('  - Column max_deduction_percent already exists in member_levels');
  }

  const bookingColumns = [
    { name: 'room_count', def: 'INTEGER NOT NULL DEFAULT 1' },
    { name: 'original_total', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'discount_amount', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'discounted_total', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'points_deducted', def: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'points_deduction_amount', def: 'REAL NOT NULL DEFAULT 0' },
    { name: 'member_discount_percent', def: 'REAL' },
    { name: 'member_level', def: 'TEXT' },
    { name: 'price_breakdown', def: 'TEXT' }
  ];

  for (const col of bookingColumns) {
    try {
      db.prepare(`ALTER TABLE bookings ADD COLUMN ${col.name} ${col.def}`).run();
      console.log(`  - Added ${col.name} to bookings`);
    } catch (e) {
      if (!e.message.includes('duplicate column name')) {
        throw e;
      }
      console.log(`  - Column ${col.name} already exists in bookings`);
    }
  }

  try {
    db.prepare(`
      UPDATE member_levels SET discount = 95, max_deduction_percent = 20 WHERE level = 'bronze'
    `).run();
    db.prepare(`
      UPDATE member_levels SET discount = 90, max_deduction_percent = 25 WHERE level = 'silver'
    `).run();
    db.prepare(`
      UPDATE member_levels SET discount = 85, max_deduction_percent = 30 WHERE level = 'gold'
    `).run();
    db.prepare(`
      UPDATE member_levels SET discount = 80, max_deduction_percent = 40 WHERE level = 'platinum'
    `).run();
    console.log('  - Updated member_levels discount values to percentage format');
  } catch (e) {
    console.log('  - Member levels update skipped:', e.message);
  }

  console.log('Migration 001 completed successfully.');
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
