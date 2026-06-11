<template>
  <div class="page-container">
    <h2 class="page-title">入住管理</h2>

    <el-card shadow="never">
      <el-tabs v-model="activeTab" class="checkin-tabs">
        <el-tab-pane label="在住中" name="active">
          <div class="tab-toolbar">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索客人姓名/电话/房号"
              clearable
              style="width: 240px"
              :prefix-icon="Search"
            />
          </div>
          <el-table :data="filteredActiveList" v-loading="loading" stripe>
            <el-table-column prop="room_no" label="房号" width="90" align="center">
              <template #default="{ row }">
                <span class="room-badge">{{ row.room_no }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="guest_name" label="客人姓名" width="110" />
            <el-table-column prop="guest_phone" label="联系电话" width="130" />
            <el-table-column label="房型" width="140">
              <template #default="{ row }">
                {{ row.room_type_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="入住时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.actual_checkin) }}
              </template>
            </el-table-column>
            <el-table-column label="预计退房" width="130">
              <template #default="{ row }">
                <span class="expected-checkout">{{ row.expected_checkout || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="deposit_amount" label="押金(元)" width="100" align="right">
              <template #default="{ row }">
                <span class="deposit">¥{{ row.deposit_amount?.toFixed(2) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="openExtendDialog(row)">续住</el-button>
                <el-button type="warning" link size="small" @click="openChargeDialog(row)">加账</el-button>
                <el-button type="success" link size="small" @click="openCheckoutDialog(row)">退房</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && filteredActiveList.length === 0" description="暂无在住客人" />
        </el-tab-pane>

        <el-tab-pane label="历史记录" name="history">
          <div class="tab-toolbar">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索客人姓名/电话/房号"
              clearable
              style="width: 240px"
              :prefix-icon="Search"
            />
          </div>
          <el-table :data="filteredHistoryList" v-loading="loading" stripe>
            <el-table-column prop="room_no" label="房号" width="90" align="center" />
            <el-table-column prop="guest_name" label="客人姓名" width="110" />
            <el-table-column prop="guest_phone" label="联系电话" width="130" />
            <el-table-column label="房型" width="140">
              <template #default="{ row }">
                {{ row.room_type_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="入住时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.actual_checkin) }}
              </template>
            </el-table-column>
            <el-table-column label="退房时间" width="170">
              <template #default="{ row }">
                {{ formatDateTime(row.actual_checkout) }}
              </template>
            </el-table-column>
            <el-table-column prop="deposit_amount" label="押金(元)" width="100" align="right">
              <template #default="{ row }">
                ¥{{ row.deposit_amount?.toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag type="info" size="small">已退房</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && filteredHistoryList.length === 0" description="暂无历史记录" />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="extendVisible" title="办理续住" width="460px">
      <el-descriptions :column="1" border v-if="currentCheckin" size="small" class="dialog-desc">
        <el-descriptions-item label="房号">{{ currentCheckin.room_no }}</el-descriptions-item>
        <el-descriptions-item label="客人">{{ currentCheckin.guest_name }}</el-descriptions-item>
      </el-descriptions>
      <el-form :model="extendForm" label-width="100px" style="margin-top: 16px">
        <el-form-item label="续住天数">
          <el-input-number v-model="extendForm.days" :min="1" :max="30" />
        </el-form-item>
        <el-form-item label="新房费">
          <span class="price-text">¥{{ extendCost.toFixed(2) }}</span>
          <span class="form-tip">（按当前房型基础价估算）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="extendVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitExtend">确认续住</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="chargeVisible" title="添加杂费" width="460px">
      <el-descriptions :column="1" border v-if="currentCheckin" size="small" class="dialog-desc">
        <el-descriptions-item label="房号">{{ currentCheckin.room_no }}</el-descriptions-item>
        <el-descriptions-item label="客人">{{ currentCheckin.guest_name }}</el-descriptions-item>
      </el-descriptions>
      <el-form :model="chargeForm" :rules="chargeRules" ref="chargeFormRef" label-width="100px" style="margin-top: 16px">
        <el-form-item label="杂费类型" prop="type">
          <el-select v-model="chargeForm.type" placeholder="请选择类型" style="width: 100%">
            <el-option label="餐饮消费" value="餐饮" />
            <el-option label="洗衣服务" value="洗衣" />
            <el-option label="电话费用" value="电话" />
            <el-option label="迷你吧" value="迷你吧" />
            <el-option label="损坏赔偿" value="赔偿" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额(元)" prop="amount">
          <el-input-number v-model="chargeForm.amount" :min="0.01" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="chargeForm.remark" type="textarea" :rows="2" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chargeVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCharge">确认加账</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="checkoutVisible" title="退房结算" width="580px">
      <div v-if="currentCheckin" class="checkout-content">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="房号">{{ currentCheckin.room_no }}</el-descriptions-item>
          <el-descriptions-item label="客人">{{ currentCheckin.guest_name }}</el-descriptions-item>
          <el-descriptions-item label="入住时间">{{ formatDateTime(currentCheckin.actual_checkin) }}</el-descriptions-item>
          <el-descriptions-item label="退房时间">{{ formatDateTime(new Date()) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">消费明细</el-divider>

        <div class="bill-section">
          <div class="bill-title">
            <el-icon><OfficeBuilding /></el-icon>
            <span>房费明细</span>
          </div>
          <el-table :data="checkoutBill.roomFees" size="small" border>
            <el-table-column prop="date" label="日期" width="130" />
            <el-table-column prop="desc" label="说明" />
            <el-table-column prop="amount" label="金额(元)" width="110" align="right">
              <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
            </el-table-column>
          </el-table>
          <div class="bill-total">
            房费小计：<span class="amount">¥{{ checkoutBill.roomTotal.toFixed(2) }}</span>
          </div>
        </div>

        <div class="bill-section">
          <div class="bill-title">
            <el-icon><Goods /></el-icon>
            <span>杂费明细</span>
          </div>
          <el-table v-if="checkoutBill.extraFees.length" :data="checkoutBill.extraFees" size="small" border>
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="desc" label="说明" />
            <el-table-column prop="amount" label="金额(元)" width="110" align="right">
              <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无杂费" :image-size="60" />
          <div class="bill-total">
            杂费小计：<span class="amount">¥{{ checkoutBill.extraTotal.toFixed(2) }}</span>
          </div>
        </div>

        <el-divider />

        <div class="checkout-summary">
          <div class="summary-row">
            <span>消费合计</span>
            <span class="amount">¥{{ checkoutBill.grandTotal.toFixed(2) }}</span>
          </div>
          <div class="summary-row">
            <span>已收押金</span>
            <span class="amount">¥{{ currentCheckin.deposit_amount?.toFixed(2) }}</span>
          </div>
          <div class="summary-row final" :class="{ refund: checkoutBill.refund > 0, supplement: checkoutBill.refund < 0 }">
            <span>{{ checkoutBill.refund >= 0 ? '应退金额' : '应补金额' }}</span>
            <span class="amount">¥{{ Math.abs(checkoutBill.refund).toFixed(2) }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="checkoutVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCheckout">确认退房</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, OfficeBuilding, Goods } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'

const loading = ref(false)
const submitting = ref(false)
const activeTab = ref('active')
const searchKeyword = ref('')
const checkins = ref([])

const activeList = ref([])
const historyList = ref([])

const extendVisible = ref(false)
const chargeVisible = ref(false)
const checkoutVisible = ref(false)
const currentCheckin = ref(null)

const extendForm = reactive({ days: 1 })
const extendCost = computed(() => (currentCheckin.value?.room_type_base_price || 300) * extendForm.days)

const chargeFormRef = ref(null)
const chargeForm = reactive({
  type: '',
  amount: 0,
  remark: ''
})
const chargeRules = {
  type: [{ required: true, message: '请选择杂费类型', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }]
}

const checkoutBill = reactive({
  roomFees: [],
  extraFees: [],
  roomTotal: 0,
  extraTotal: 0,
  grandTotal: 0,
  refund: 0
})

const filteredActiveList = computed(() => {
  if (!searchKeyword.value) return activeList.value
  const kw = searchKeyword.value.toLowerCase()
  return activeList.value.filter(c =>
    c.guest_name?.toLowerCase().includes(kw) ||
    c.guest_phone?.includes(kw) ||
    c.room_no?.includes(kw)
  )
})

const filteredHistoryList = computed(() => {
  if (!searchKeyword.value) return historyList.value
  const kw = searchKeyword.value.toLowerCase()
  return historyList.value.filter(c =>
    c.guest_name?.toLowerCase().includes(kw) ||
    c.guest_phone?.includes(kw) ||
    c.room_no?.includes(kw)
  )
})

function formatDateTime(dt) {
  if (!dt) return '-'
  return dayjs(dt).format('YYYY-MM-DD HH:mm')
}

async function loadCheckins() {
  loading.value = true
  try {
    const res = await request.get('/checkins')
    checkins.value = res.data?.list || []
    activeList.value = checkins.value.filter(c => c.status === 'checked_in')
    historyList.value = checkins.value.filter(c => c.status === 'checked_out')
  } catch (e) {
    ElMessage.error('加载入住列表失败')
  } finally {
    loading.value = false
  }
}

function openExtendDialog(row) {
  currentCheckin.value = row
  extendForm.days = 1
  extendVisible.value = true
}

function openChargeDialog(row) {
  currentCheckin.value = row
  chargeForm.type = ''
  chargeForm.amount = 0
  chargeForm.remark = ''
  chargeVisible.value = true
}

async function openCheckoutDialog(row) {
  currentCheckin.value = row
  const nights = Math.max(1, dayjs().diff(dayjs(row.actual_checkin), 'day'))
  const basePrice = 300
  const roomFees = []
  for (let i = 0; i < nights; i++) {
    const d = dayjs(row.actual_checkin).add(i, 'day')
    roomFees.push({
      date: d.format('YYYY-MM-DD'),
      desc: `${row.room_type_name || '客房'}房费`,
      amount: basePrice
    })
  }
  const roomTotal = basePrice * nights
  const extraFees = [
    { type: '餐饮', desc: '餐厅消费', amount: 128 }
  ]
  const extraTotal = extraFees.reduce((s, x) => s + x.amount, 0)
  const grandTotal = roomTotal + extraTotal
  const deposit = row.deposit_amount || 0
  Object.assign(checkoutBill, {
    roomFees,
    extraFees,
    roomTotal,
    extraTotal,
    grandTotal,
    refund: deposit - grandTotal
  })
  checkoutVisible.value = true
}

async function submitExtend() {
  submitting.value = true
  try {
    ElMessage.success('续住成功')
    extendVisible.value = false
  } catch (e) {
    ElMessage.error('续住失败')
  } finally {
    submitting.value = false
  }
}

async function submitCharge() {
  try {
    await chargeFormRef.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    ElMessage.success('加账成功')
    chargeVisible.value = false
  } catch (e) {
    ElMessage.error('加账失败')
  } finally {
    submitting.value = false
  }
}

async function submitCheckout() {
  submitting.value = true
  try {
    await request.post(`/checkins/${currentCheckin.value.id}/checkout`)
    ElMessage.success('退房成功')
    checkoutVisible.value = false
    loadCheckins()
  } catch (e) {
    ElMessage.error('退房失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadCheckins()
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

.checkin-tabs :deep(.el-tabs__header) {
  margin: 0 0 16px;
}

.tab-toolbar {
  margin-bottom: 16px;
}

.room-badge {
  display: inline-block;
  padding: 3px 10px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border-radius: 6px;
  font-weight: 600;
  font-size: 13px;
}

.deposit {
  color: #e6a23c;
  font-weight: 500;
}

.expected-checkout {
  color: #f56c6c;
}

.dialog-desc {
  background: #fafafa;
  border-radius: 6px;
}

.price-text {
  color: #f56c6c;
  font-size: 16px;
  font-weight: 600;
  margin-right: 6px;
}

.form-tip {
  color: #909399;
  font-size: 12px;
}

.bill-section {
  margin-bottom: 16px;
}

.bill-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.bill-total {
  text-align: right;
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.bill-total .amount {
  font-weight: 600;
  color: #303133;
  margin-left: 4px;
}

.checkout-summary {
  background: #fafafa;
  border-radius: 8px;
  padding: 12px 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 14px;
  color: #606266;
}

.summary-row .amount {
  font-weight: 500;
  color: #303133;
}

.summary-row.final {
  padding-top: 10px;
  margin-top: 6px;
  border-top: 1px dashed #ebeef5;
  font-size: 15px;
  font-weight: 600;
}

.summary-row.final.refund {
  color: #67c23a;
}

.summary-row.final.refund .amount {
  color: #67c23a;
  font-size: 18px;
}

.summary-row.final.supplement {
  color: #f56c6c;
}

.summary-row.final.supplement .amount {
  color: #f56c6c;
  font-size: 18px;
}
</style>
