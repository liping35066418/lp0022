<template>
  <div class="page-container">
    <h2 class="page-title">新建预订</h2>

    <el-steps :active="activeStep" finish-status="success" align-center class="booking-steps">
      <el-step title="选择房型日期" />
      <el-step title="选择会员房价" />
      <el-step title="确认订单信息" />
    </el-steps>

    <div class="step-content">
      <div v-show="activeStep === 0" class="step-panel">
        <el-card shadow="never">
          <template #header>
            <span class="step-header">第一步：选择入住日期与房型</span>
          </template>
          <el-form :model="step1" :rules="step1Rules" ref="step1Ref" label-width="110px">
            <el-row :gutter="24">
              <el-col :span="8">
                <el-form-item label="入住日期" prop="checkinDate">
                  <el-date-picker
                    v-model="step1.checkinDate"
                    type="date"
                    placeholder="选择入住日期"
                    value-format="YYYY-MM-DD"
                    :disabled-date="disabledCheckinDate"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="退房日期" prop="checkoutDate">
                  <el-date-picker
                    v-model="step1.checkoutDate"
                    type="date"
                    placeholder="选择退房日期"
                    value-format="YYYY-MM-DD"
                    :disabled-date="disabledCheckoutDate"
                    style="width: 100%"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="入住晚数">
                  <el-input :model-value="nights + ' 晚'" disabled />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="24">
              <el-col :span="8">
                <el-form-item label="房型" prop="roomTypeId">
                  <el-select v-model="step1.roomTypeId" placeholder="请选择房型" style="width: 100%" @change="onRoomTypeChange">
                    <el-option
                      v-for="rt in roomTypes"
                      :key="rt.id"
                      :label="rt.name + ' (¥' + rt.base_price + '/晚)'"
                      :value="rt.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="预订数量" prop="quantity">
                  <el-input-number v-model="step1.quantity" :min="1" :max="10" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="入住人数" prop="guestCount">
                  <el-input-number v-model="step1.guestCount" :min="1" :max="10" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <div v-if="step1.roomTypeId" class="inventory-info" :class="{ warning: inventoryAvailable < step1.quantity }">
              <el-icon :size="18"><InfoFilled /></el-icon>
              <span>
                所选日期内该房型可预订：
                <strong>{{ inventoryAvailable }}</strong> 间
                <span v-if="inventoryAvailable < step1.quantity">（库存不足，请调整数量）</span>
              </span>
            </div>
          </el-form>
        </el-card>
        <div class="step-footer">
          <el-button size="large" @click="$router.back()">取消</el-button>
          <el-button type="primary" size="large" @click="nextStep1">下一步</el-button>
        </div>
      </div>

      <div v-show="activeStep === 1" class="step-panel">
        <el-card shadow="never">
          <template #header>
            <span class="step-header">第二步：选择会员与确认房价</span>
          </template>
          <el-form :model="step2" label-width="110px">
            <el-row :gutter="24">
              <el-col :span="12">
                <el-form-item label="选择会员">
                  <el-select
                    v-model="step2.memberId"
                    placeholder="搜索并选择会员（可选）"
                    filterable
                    remote
                    :remote-method="searchMembers"
                    :loading="memberLoading"
                    clearable
                    style="width: 100%"
                    @change="onMemberChange"
                  >
                    <el-option
                      v-for="m in memberOptions"
                      :key="m.id"
                      :label="`${m.name} - ${m.phone} (${getLevelName(m.level)})`"
                      :value="m.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12" v-if="selectedMember">
                <el-form-item label="会员折扣">
                  <el-tag type="warning" size="large">
                    {{ getLevelName(selectedMember.level) }} · {{ memberDiscount }}折
                  </el-tag>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>

          <el-divider content-position="left">房价明细</el-divider>

          <div v-loading="priceLoading" class="price-breakdown">
            <div v-if="priceInfo" class="price-summary">
              <el-row :gutter="20">
                <el-col :span="6">
                  <div class="summary-item">
                    <div class="label">原价合计</div>
                    <div class="value original">¥{{ priceInfo.original_total?.toFixed(2) }}</div>
                  </div>
                </el-col>
                <el-col :span="6" v-if="priceInfo.discount_amount > 0">
                  <div class="summary-item">
                    <div class="label">会员优惠</div>
                    <div class="value discount">-¥{{ priceInfo.discount_amount?.toFixed(2) }}</div>
                  </div>
                </el-col>
                <el-col :span="6" v-if="priceInfo.points_deduction?.deduction_amount > 0">
                  <div class="summary-item">
                    <div class="label">积分抵扣</div>
                    <div class="value points">-¥{{ priceInfo.points_deduction?.deduction_amount?.toFixed(2) }}</div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="summary-item highlight">
                    <div class="label">应付合计</div>
                    <div class="value final">¥{{ finalTotal?.toFixed(2) }}</div>
                  </div>
                </el-col>
              </el-row>
            </div>

            <div v-if="selectedMember && priceInfo?.points_deduction" class="points-section">
              <el-divider content-position="left">积分抵扣</el-divider>
              <div class="points-info">
                <div class="points-row">
                  <span class="points-label">当前积分：</span>
                  <span class="points-value">{{ selectedMember.points?.toLocaleString() || 0 }} 积分</span>
                </div>
                <div class="points-row">
                  <span class="points-label">兑换比例：</span>
                  <span class="points-value">{{ priceInfo.points_deduction.exchange_rate }} 积分 = ¥1</span>
                </div>
                <div class="points-row">
                  <span class="points-label">抵扣上限：</span>
                  <span class="points-value">{{ priceInfo.points_deduction.max_deduction_percent }}%（最多抵扣 ¥{{ priceInfo.points_deduction.max_deduction_amount?.toFixed(2) }}）</span>
                </div>
                <div class="points-row points-use">
                  <span class="points-label">使用积分：</span>
                  <el-input-number
                    v-model="pointsToUse"
                    :min="0"
                    :max="priceInfo.points_deduction.max_points"
                    :step="priceInfo.points_deduction.exchange_rate"
                    @change="onPointsChange"
                  />
                  <span class="points-tip">（可抵扣 ¥{{ (pointsToUse / priceInfo.points_deduction.exchange_rate).toFixed(2) }}）</span>
                </div>
              </div>
            </div>

            <el-table :data="dailyList" border stripe size="small" v-if="dailyList.length">
              <el-table-column prop="date" label="日期" width="120" />
              <el-table-column prop="weekday" label="星期" width="80" align="center" />
              <el-table-column label="类型" width="100" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.is_holiday" type="danger" size="small">{{ row.holiday_name || '节假日' }}</el-tag>
                  <el-tag v-else-if="row.is_weekend" type="warning" size="small">周末</el-tag>
                  <el-tag v-else type="info" size="small">平日</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="original_price" label="单价(元)" width="120" align="right">
                <template #default="{ row }">
                  <span>¥{{ row.original_price?.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="会员价(元)" width="120" align="right" v-if="selectedMember">
                <template #default="{ row }">
                  <span class="discount-price">¥{{ row.discounted_price?.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="小计(元)" width="140" align="right">
                <template #default="{ row }">
                  <span class="row-subtotal">
                    ¥{{ ((selectedMember ? row.discounted_price : row.original_price) * step1.quantity)?.toFixed(2) }}
                  </span>
                </template>
              </el-table-column>
            </el-table>

            <div class="deposit-row">
              <span class="deposit-label">押金金额：</span>
              <el-input-number v-model="step2.deposit" :min="0" :precision="2" />
              <span class="deposit-tip">（建议为房费的30%-50%）</span>
            </div>
          </div>
        </el-card>
        <div class="step-footer">
          <el-button size="large" @click="activeStep = 0">上一步</el-button>
          <el-button type="primary" size="large" @click="nextStep2" :disabled="!priceInfo || inventoryAvailable < step1.quantity">下一步</el-button>
        </div>
      </div>

      <div v-show="activeStep === 2" class="step-panel">
        <el-card shadow="never">
          <template #header>
            <span class="step-header">第三步：填写客人信息并确认</span>
          </template>
          <el-form :model="step3" :rules="step3Rules" ref="step3Ref" label-width="110px">
            <el-row :gutter="24">
              <el-col :span="8">
                <el-form-item label="联系人姓名" prop="guestName">
                  <el-input v-model="step3.guestName" placeholder="请输入联系人姓名" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="联系电话" prop="guestPhone">
                  <el-input v-model="step3.guestPhone" placeholder="请输入联系电话" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="身份证号">
                  <el-input v-model="step3.guestIdcard" placeholder="可选" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="备注">
              <el-input v-model="step3.remark" type="textarea" :rows="2" placeholder="特殊需求等备注信息" />
            </el-form-item>
          </el-form>

          <el-divider content-position="left">订单信息确认</el-divider>

          <el-descriptions :column="2" border class="confirm-desc">
            <el-descriptions-item label="房型">{{ selectedRoomType?.name }}</el-descriptions-item>
            <el-descriptions-item label="数量">{{ step1.quantity }}间</el-descriptions-item>
            <el-descriptions-item label="入住日期">{{ step1.checkinDate }}</el-descriptions-item>
            <el-descriptions-item label="退房日期">{{ step1.checkoutDate }}</el-descriptions-item>
            <el-descriptions-item label="入住晚数">{{ nights }}晚</el-descriptions-item>
            <el-descriptions-item label="入住人数">{{ step1.guestCount }}人</el-descriptions-item>
            <el-descriptions-item label="会员">
              {{ selectedMember ? selectedMember.name + '(' + getLevelName(selectedMember.level) + ')' : '散客' }}
            </el-descriptions-item>
            <el-descriptions-item label="押金">¥{{ step2.deposit?.toFixed(2) }}</el-descriptions-item>
            <el-descriptions-item label="原价合计" v-if="priceInfo">
              <span class="original-price">¥{{ priceInfo.original_total?.toFixed(2) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="会员优惠" v-if="priceInfo?.discount_amount > 0">
              <span class="discount-price">-¥{{ priceInfo.discount_amount?.toFixed(2) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="积分抵扣" v-if="priceInfo?.points_deduction?.deduction_amount > 0">
              <span class="points-price">-¥{{ priceInfo.points_deduction?.deduction_amount?.toFixed(2) }}（{{ priceInfo.points_deduction?.points_to_use }}积分）</span>
            </el-descriptions-item>
            <el-descriptions-item label="应付合计" :span="2">
              <span class="final-price">¥{{ finalTotal?.toFixed(2) }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
        <div class="step-footer">
          <el-button size="large" @click="activeStep = 1">上一步</el-button>
          <el-button type="primary" size="large" :loading="submitting" @click="submitBooking">
            确认预订
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'

const router = useRouter()
const today = dayjs().format('YYYY-MM-DD')

const activeStep = ref(0)
const submitting = ref(false)
const priceLoading = ref(false)
const memberLoading = ref(false)

const roomTypes = ref([])
const memberOptions = ref([])
const inventoryAvailable = ref(99)
const priceInfo = ref(null)

const selectedMember = ref(null)
const memberDiscount = ref(100)
const pointsToUse = ref(0)

const step1Ref = ref(null)
const step3Ref = ref(null)

const step1 = reactive({
  checkinDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
  checkoutDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
  roomTypeId: '',
  quantity: 1,
  guestCount: 2
})

const step2 = reactive({
  memberId: '',
  deposit: 200
})

const step3 = reactive({
  guestName: '',
  guestPhone: '',
  guestIdcard: '',
  remark: ''
})

const step1Rules = {
  checkinDate: [{ required: true, message: '请选择入住日期', trigger: 'change' }],
  checkoutDate: [{ required: true, message: '请选择退房日期', trigger: 'change' }],
  roomTypeId: [{ required: true, message: '请选择房型', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入预订数量', trigger: 'blur' }],
  guestCount: [{ required: true, message: '请输入入住人数', trigger: 'blur' }]
}

const step3Rules = {
  guestName: [{ required: true, message: '请输入联系人姓名', trigger: 'blur' }],
  guestPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }]
}

const nights = computed(() => {
  if (!step1.checkinDate || !step1.checkoutDate) return 0
  const diff = dayjs(step1.checkoutDate).diff(dayjs(step1.checkinDate), 'day')
  return diff > 0 ? diff : 0
})

const selectedRoomType = computed(() => {
  return roomTypes.value.find(rt => rt.id === step1.roomTypeId)
})

const dailyList = computed(() => {
  return priceInfo.value?.daily_breakdown || []
})

const finalTotal = computed(() => {
  if (!priceInfo.value) return 0
  return priceInfo.value.final_total || 0
})

function disabledCheckinDate(date) {
  return dayjs(date).isBefore(dayjs(today), 'day')
}

function disabledCheckoutDate(date) {
  if (!step1.checkinDate) return disabledCheckinDate(date)
  return dayjs(date).isBefore(dayjs(step1.checkinDate).add(1, 'day'), 'day')
}

function getLevelName(level) {
  const map = {
    bronze: '普通会员',
    silver: '银卡会员',
    gold: '金卡会员',
    platinum: '铂金会员'
  }
  return map[level] || level
}

async function loadRoomTypes() {
  try {
    const res = await request.get('/room-types', { params: { status: 'active' } })
    roomTypes.value = res.data?.list || []
  } catch (e) {}
}

function onRoomTypeChange() {
  checkInventory()
  calculatePrice()
}

function onMemberChange(id) {
  pointsToUse.value = 0
  if (!id) {
    selectedMember.value = null
    memberDiscount.value = 100
  } else {
    const m = memberOptions.value.find(x => x.id === id)
    selectedMember.value = m || null
    memberDiscount.value = m?.discount ? (m.discount / 10).toFixed(1) : 100
  }
  calculatePrice()
}

function onPointsChange() {
  calculatePrice()
}

async function searchMembers(query) {
  if (!query) {
    memberOptions.value = []
    return
  }
  memberLoading.value = true
  try {
    const res = await request.get('/members', { params: { keyword: query } })
    memberOptions.value = res.data?.list || []
  } catch (e) {
    memberOptions.value = []
  } finally {
    memberLoading.value = false
  }
}

async function checkInventory() {
  const rt = roomTypes.value.find(r => r.id === step1.roomTypeId)
  inventoryAvailable.value = rt?.total_rooms || 10
}

async function calculatePrice() {
  if (!step1.roomTypeId || !step1.checkinDate || !step1.checkoutDate || nights.value <= 0) {
    priceInfo.value = null
    return
  }
  priceLoading.value = true
  try {
    const params = {
      room_type_id: step1.roomTypeId,
      start_date: step1.checkinDate,
      end_date: step1.checkoutDate,
      room_count: step1.quantity
    }
    if (step2.memberId) params.member_id = step2.memberId
    if (pointsToUse.value > 0) params.points_to_use = pointsToUse.value
    const res = await request.get('/price-strategies/calculate', { params })
    priceInfo.value = res.data
    if (priceInfo.value?.member_level) {
      memberDiscount.value = (priceInfo.value.member_discount_percent / 10).toFixed(1)
    }
  } catch (e) {
    priceInfo.value = null
  } finally {
    priceLoading.value = false
  }
}

async function nextStep1() {
  try {
    await step1Ref.value.validate()
  } catch (e) {
    return
  }
  if (nights.value <= 0) {
    ElMessage.warning('退房日期必须晚于入住日期')
    return
  }
  if (inventoryAvailable.value < step1.quantity) {
    ElMessage.warning('库存不足，请调整预订数量')
    return
  }
  await calculatePrice()
  activeStep.value = 1
}

async function nextStep2() {
  if (!priceInfo.value) {
    ElMessage.warning('请等待房价计算完成')
    return
  }
  activeStep.value = 2
}

async function submitBooking() {
  try {
    await step3Ref.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    await request.post('/bookings', {
      member_id: step2.memberId || null,
      room_type_id: step1.roomTypeId,
      checkin_date: step1.checkinDate,
      checkout_date: step1.checkoutDate,
      guest_count: step1.guestCount,
      room_count: step1.quantity,
      total_price: finalTotal.value,
      deposit: step2.deposit,
      points_to_use: pointsToUse.value > 0 ? pointsToUse.value : null,
      guest_name: step3.guestName,
      guest_phone: step3.guestPhone,
      guest_idcard: step3.guestIdcard,
      remark: step3.remark
    })
    ElMessage.success('预订创建成功')
    router.push('/bookings')
  } catch (e) {
    ElMessage.error('预订创建失败')
  } finally {
    submitting.value = false
  }
}

watch([() => step1.checkinDate, () => step1.checkoutDate], () => {
  if (step1.roomTypeId) {
    calculatePrice()
  }
})

onMounted(() => {
  loadRoomTypes()
})
</script>

<style scoped>
.page-container {
  width: 100%;
}

.page-title {
  margin: 0 0 20px;
  font-size: 20px;
  color: #303133;
}

.booking-steps {
  margin-bottom: 28px;
  background: #fff;
  padding: 24px 0;
  border-radius: 8px;
}

.step-content {
  min-height: 400px;
}

.step-header {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.inventory-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #ecf5ff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
  margin-top: 8px;
}

.inventory-info.warning {
  background: #fef0f0;
  color: #f56c6c;
}

.inventory-info strong {
  color: inherit;
  font-size: 14px;
}

.price-breakdown {
  margin-top: 8px;
}

.price-summary {
  margin-bottom: 18px;
}

.summary-item {
  text-align: center;
  padding: 14px 8px;
  background: #fafafa;
  border-radius: 8px;
}

.summary-item.highlight {
  background: linear-gradient(135deg, #fff7e6, #ffe7ba);
}

.summary-item .label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.summary-item .value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.summary-item .value.original {
  text-decoration: line-through;
  color: #c0c4cc;
}

.summary-item .value.discount {
  color: #67c23a;
}

.summary-item .value.points {
  color: #e6a23c;
}

.summary-item .value.final {
  color: #f56c6c;
  font-size: 22px;
}

.discount-price {
  color: #e6a23c;
}

.row-subtotal {
  color: #f56c6c;
  font-weight: 600;
}

.deposit-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.deposit-label {
  font-weight: 500;
  color: #303133;
}

.deposit-tip {
  font-size: 12px;
  color: #909399;
}

.confirm-desc {
  margin-top: 8px;
}

.final-price {
  color: #f56c6c;
  font-size: 20px;
  font-weight: 700;
}

.step-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding: 16px 0;
}

.step-footer .el-button {
  min-width: 110px;
}

.points-section {
  margin-top: 8px;
}

.points-info {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px 20px;
}

.points-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
}

.points-row:last-child {
  margin-bottom: 0;
}

.points-label {
  color: #606266;
  min-width: 80px;
}

.points-value {
  color: #303133;
  font-weight: 500;
}

.points-use {
  flex-wrap: wrap;
}

.points-tip {
  color: #909399;
  font-size: 13px;
}

.original-price {
  text-decoration: line-through;
  color: #c0c4cc;
}

.points-price {
  color: #e6a23c;
}
</style>
