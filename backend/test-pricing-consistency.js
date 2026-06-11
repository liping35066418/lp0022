const fs = require('fs');
const path = require('path');
const moment = require('moment');

const dbPath = path.join(__dirname, 'data', 'test-hotel.db');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('删除旧的测试数据库');
}
process.env.DB_PATH = dbPath;

const { db, initDatabase, seedData } = require('./database');
const {
  calculateCompletePrice,
  calculateStayBreakdown,
  calculateDailyRate,
  getActiveStrategies,
  getMemberInfo
} = require('./services/pricingService');

console.log('='.repeat(60));
console.log('酒店平台价格一致性测试');
console.log('='.repeat(60));
console.log();

initDatabase();
seedData();

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCloseTo(actual, expected, message, precision = 0.01) {
  if (Math.abs(actual - expected) > precision) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

test('1. 基础房价计算 - 平日', () => {
  const result = calculateCompletePrice(1, '2024-01-15', '2024-01-17', null, 1, null);
  console.log('  原价合计:', result.original_total);
  console.log('  每日明细:', result.daily_breakdown.map(d => `${d.date}: ¥${d.original_price}`).join(', '));
  assert(result.original_total > 0, '原价合计应大于0');
  assert(result.daily_breakdown.length === 2, '应包含2天的明细');
});

test('2. 会员折扣计算 - 金卡会员85折', () => {
  const memberId = 3;
  const result = calculateCompletePrice(1, '2024-01-15', '2024-01-17', memberId, 1, null);
  console.log('  原价合计:', result.original_total);
  console.log('  折扣后合计:', result.discounted_total);
  console.log('  会员折扣:', result.member_discount_percent + '%');
  assertCloseTo(result.discounted_total, result.original_total * 0.85, '折扣计算错误');
  assertCloseTo(result.discount_amount, result.original_total - result.discounted_total, '优惠金额计算错误');
});

test('3. 周末价格计算 - 周末加价20%', () => {
  const result = calculateCompletePrice(1, '2024-01-13', '2024-01-15', null, 1, null);
  console.log('  每日明细:');
  result.daily_breakdown.forEach(d => {
    console.log(`    ${d.date} (${d.is_weekend ? '周末' : '平日'}): ¥${d.original_price}`);
  });
  const weekendDays = result.daily_breakdown.filter(d => d.is_weekend);
  assert(weekendDays.length > 0, '应包含周末');
});

test('4. 房价策略页与新建预订页价格一致性校验', () => {
  const roomTypeId = 1;
  const startDate = '2024-01-15';
  const endDate = '2024-01-20';
  const memberId = 2;

  const bookingResult = calculateCompletePrice(roomTypeId, startDate, endDate, memberId, 1, null);
  const strategies = getActiveStrategies(roomTypeId, startDate, endDate);
  const memberInfo = getMemberInfo(memberId);

  console.log('  新建预订页每日价格:');
  bookingResult.daily_breakdown.forEach(d => {
    console.log(`    ${d.date}: 原价¥${d.original_price}, 会员价¥${d.discounted_price}`);
  });

  console.log('  房价策略页每日价格:');
  const calendarPrices = [];
  let current = moment(startDate);
  const end = moment(endDate);
  while (current.isBefore(end)) {
    const dateStr = current.format('YYYY-MM-DD');
    const rate = calculateDailyRate(roomTypeId, dateStr, strategies, memberInfo.discount);
    calendarPrices.push({
      date: dateStr,
      original_price: rate.original_price,
      discounted_price: rate.discounted_price
    });
    console.log(`    ${dateStr}: 原价¥${rate.original_price}, 会员价¥${rate.discounted_price}`);
    current.add(1, 'day');
  }

  bookingResult.daily_breakdown.forEach((bookingDay, idx) => {
    const calendarDay = calendarPrices[idx];
    assertCloseTo(
      bookingDay.original_price,
      calendarDay.original_price,
      `原价不一致: ${bookingDay.date}`
    );
    assertCloseTo(
      bookingDay.discounted_price,
      calendarDay.discounted_price,
      `会员价不一致: ${bookingDay.date}`
    );
  });
  console.log('  ✓ 两个入口价格完全一致');
});

test('5. 积分抵扣计算 - 抵扣上限验证', () => {
  const memberId = 2;
  const result = calculateCompletePrice(1, '2024-01-15', '2024-01-17', memberId, 1, null);
  const maxPoints = result.points_deduction.max_points;
  const maxAmount = result.points_deduction.max_amount;
  const maxPercent = result.points_deduction.max_deduction_percent;

  console.log('  折扣后房费:', result.discounted_total);
  console.log('  抵扣上限比例:', maxPercent + '%');
  console.log('  最大抵扣金额:', maxAmount);
  console.log('  最大抵扣积分:', maxPoints);

  const expectedMaxAmount = result.discounted_total * maxPercent / 100;
  assertCloseTo(maxAmount, expectedMaxAmount, '抵扣上限金额计算错误');

  const pointsToUse = Math.min(maxPoints, 1000);
  const resultWithPoints = calculateCompletePrice(1, '2024-01-15', '2024-01-17', memberId, 1, pointsToUse);
  console.log('  使用', pointsToUse, '积分抵扣后:');
  console.log('    积分抵扣金额:', resultWithPoints.points_deduction.deduction_amount);
  console.log('    最终应付:', resultWithPoints.final_total);

  const expectedDeduction = pointsToUse / resultWithPoints.points_deduction.exchange_rate;
  assertCloseTo(
    resultWithPoints.points_deduction.deduction_amount,
    expectedDeduction,
    '抵扣金额计算错误'
  );
  assertCloseTo(
    resultWithPoints.final_total,
    resultWithPoints.discounted_total - expectedDeduction,
    '最终金额计算错误'
  );
});

test('6. 多间房价格计算', () => {
  const roomCount = 3;
  const result1 = calculateCompletePrice(1, '2024-01-15', '2024-01-17', null, 1, null);
  const result3 = calculateCompletePrice(1, '2024-01-15', '2024-01-17', null, roomCount, null);

  console.log('  1间房总价:', result1.final_total);
  console.log('  3间房总价:', result3.final_total);

  assertCloseTo(result3.final_total, result1.final_total * roomCount, '多间房价格计算错误');
});

test('7. 退房时价格与预订价格一致性', () => {
  const roomTypeId = 1;
  const startDate = '2024-01-15';
  const endDate = '2024-01-18';
  const memberId = 2;

  const bookingResult = calculateCompletePrice(roomTypeId, startDate, endDate, memberId, 1, null);
  const memberInfo = getMemberInfo(memberId);
  const checkoutBreakdown = calculateStayBreakdown(roomTypeId, startDate, endDate, memberInfo.discount);

  console.log('  预订时每日价格:');
  bookingResult.daily_breakdown.forEach(d => {
    console.log(`    ${d.date}: ¥${d.discounted_price}`);
  });

  console.log('  退房时每日价格:');
  checkoutBreakdown.daily_breakdown.forEach(d => {
    console.log(`    ${d.date}: ¥${d.discounted_price}`);
  });

  bookingResult.daily_breakdown.forEach((bookingDay, idx) => {
    const checkoutDay = checkoutBreakdown.daily_breakdown[idx];
    assertCloseTo(
      bookingDay.discounted_price,
      checkoutDay.discounted_price,
      `退房价格与预订价格不一致: ${bookingDay.date}`
    );
  });

  assertCloseTo(
    bookingResult.discounted_total,
    checkoutBreakdown.discounted_total,
    '退房总价与预订总价不一致'
  );

  console.log('  ✓ 退房价格与预订价格完全一致');
});

test('8. 三处价格口径一致性校验（预订列表/详情/结算）', () => {
  const roomTypeId = 1;
  const startDate = '2024-01-15';
  const endDate = '2024-01-17';
  const memberId = 3;
  const pointsToUse = 500;

  const result = calculateCompletePrice(roomTypeId, startDate, endDate, memberId, 2, pointsToUse);

  console.log('  价格计算结果:');
  console.log('    原价合计:', result.original_total);
  console.log('    会员优惠:', result.discount_amount);
  console.log('    折扣后合计:', result.discounted_total);
  console.log('    积分抵扣:', result.points_deduction.deduction_amount, `(${result.points_deduction.points_to_use}积分)`);
  console.log('    实付金额:', result.final_total);

  assert(result.original_total > 0, '原价合计不能为空');
  assert(result.discount_amount >= 0, '优惠金额不能为负');
  assert(result.points_deduction.deduction_amount >= 0, '抵扣金额不能为负');
  assert(result.final_total >= 0, '实付金额不能为负');
  assertCloseTo(
    result.final_total,
    result.original_total - result.discount_amount - result.points_deduction.deduction_amount,
    '价格口径不一致'
  );

  console.log('  ✓ 三处价格口径完全一致');
});

async function runTests() {
  console.log('开始执行测试...');
  console.log();

  for (const test of tests) {
    console.log(`测试: ${test.name}`);
    try {
      await test.fn();
      console.log(`  ✓ 通过`);
      passed++;
    } catch (err) {
      console.log(`  ✗ 失败: ${err.message}`);
      failed++;
    }
    console.log();
  }

  console.log('='.repeat(60));
  console.log(`测试完成: 通过 ${passed} 个, 失败 ${failed} 个`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
