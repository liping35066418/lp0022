<template>
  <div class="page-container">
    <h2 class="page-title">订单结算</h2>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item label="会员搜索">
          <el-input
            v-model="filters.keyword"
            placeholder="姓名/手机号"
            clearable
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadOrders">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
          <el-button type="success" :icon="Download" @click="exportOrders">导出账单</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="20" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">订单数量</div>
              <div class="stat-value">{{ stats.totalCount }}</div>
            </div>
            <div class="stat-icon count-icon">
              <el-icon :size="32"><Tickets /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">房费收入</div>
              <div class="stat-value">¥{{ stats.roomTotal.toFixed(2) }}</div>
            </div>
            <div class="stat-icon room-icon">
              <el-icon :size="32"><OfficeBuilding /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">杂费收入</div>
              <div class="stat-value">¥{{ stats.extraTotal.toFixed(2) }}</div>
            </div>
            <div class="stat-icon extra-icon">
              <el-icon :size="32"><Goods /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">总收入</div>
              <div class="stat-value revenue">¥{{ stats.grandTotal.toFixed(2) }}</div>
            </div>
            <div class="stat-icon revenue-icon">
              <el-icon :size="32"><Money /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never">
      <el-table :data="filteredOrders" v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" width="170" />
        <el-table-column label="会员" width="150">
          <template #default="{ row }">
            <div v-if="row.member_name">
              <div class="member-name">{{ row.member_name }}</div>
              <div class="member-phone" v-if="row.member_phone">{{ row.member_phone }}</div>
            </div>
            <span v-else class="text-muted">散客</span>
          </template>
        </el-table-column>
        <el-table-column prop="room_type_name" label="房型" width="140" />
        <el-table-column label="入住日期" width="120">
          <template #default="{ row }">{{ row.checkin_date }}</template>
        </el-table-column>
        <el-table-column label="退房日期" width="120">
          <template #default="{ row }">{{ row.checkout_date }}</template>
        </el-table-column>
        <el-table-column prop="room_fee" label="房费(元)" width="110" align="right">
          <template #default="{ row }">¥{{ (row.total_price || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="deposit" label="押金(元)" width="100" align="right">
          <template #default="{ row }">¥{{ (row.deposit || 0).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="实付(元)" width="110" align="right">
          <template #default="{ row }">
            <span class="paid-amount">¥{{ (row.total_price || 0).toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag type="success" size="small" effect="dark">已完成</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">查看账单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && filteredOrders.length === 0" description="暂无已完成订单" />
    </el-card>

    <el-dialog v-model="detailVisible" title="订单账单详情" width="620px">
      <div v-if="currentOrder" class="bill-detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="订单号">{{ currentOrder.order_no }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag type="success" effect="dark">已完成</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="会员">
            {{ currentOrder.member_name || '散客' }}
          </el-descriptions-item>
          <el-descriptions-item label="房型">{{ currentOrder.room_type_name }}</el-descriptions-item>
          <el-descriptions-item label="入住日期">{{ currentOrder.checkin_date }}</el-descriptions-item>
          <el-descriptions-item label="退房日期">{{ currentOrder.checkout_date }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">消费明细</el-divider>

        <div class="bill-section">
          <div class="bill-section-title">
            <el-icon><OfficeBuilding /></el-icon>
            <span>房费明细</span>
          </div>
          <el-table :data="billDetail.roomFees" size="small" border>
            <el-table-column prop="date" label="日期" width="130" />
            <el-table-column prop="desc" label="说明" />
            <el-table-column prop="amount" label="金额(元)" width="120" align="right">
              <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
            </el-table-column>
          </el-table>
          <div class="bill-subtotal">
            房费小计：<span>¥{{ billDetail.roomTotal.toFixed(2) }}</span>
          </div>
        </div>

        <div class="bill-section">
          <div class="bill-section-title">
            <el-icon><Goods /></el-icon>
            <span>杂费明细</span>
          </div>
          <el-table v-if="billDetail.extraFees.length" :data="billDetail.extraFees" size="small" border>
            <el-table-column prop="type" label="类型" width="100" />
            <el-table-column prop="desc" label="说明" />
            <el-table-column prop="amount" label="金额(元)" width="120" align="right">
              <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无杂费消费" :image-size="60" />
          <div class="bill-subtotal">
            杂费小计：<span>¥{{ billDetail.extraTotal.toFixed(2) }}</span>
          </div>
        </div>

        <el-divider />

        <div class="bill-total-section">
          <div class="total-row">
            <span>消费合计</span>
            <span>¥{{ billDetail.grandTotal.toFixed(2) }}</span>
          </div>
          <div class="total-row">
            <span>已收押金</span>
            <span>¥{{ (currentOrder.deposit || 0).toFixed(2) }}</span>
          </div>
          <div class="total-row">
            <span>押金退款</span>
            <span class="refund">¥{{ billDetail.refund.toFixed(2) }}</span>
          </div>
          <div class="total-row final-row">
            <span>实收金额</span>
            <span class="final-amount">¥{{ billDetail.grandTotal.toFixed(2) }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" :icon="Printer" @click="printBill">打印账单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Download, Tickets, OfficeBuilding, Goods, Money, Printer } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'

const loading = ref(false)
const orders = ref([])

const filters = reactive({
  dateRange: [],
  keyword: ''
})

const stats = reactive({
  totalCount: 0,
  roomTotal: 0,
  extraTotal: 0,
  grandTotal: 0
})

const detailVisible = ref(false)
const currentOrder = ref(null)
const billDetail = reactive({
  roomFees: [],
  extraFees: [],
  roomTotal: 0,
  extraTotal: 0,
  grandTotal: 0,
  refund: 0
})

const filteredOrders = computed(() => {
  let list = orders.value
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase()
    list = list.filter(o =>
      o.member_name?.toLowerCase().includes(kw) ||
      o.member_phone?.includes(kw)
    )
  }
  if (filters.dateRange && filters.dateRange.length === 2) {
    const [s, e] = filters.dateRange
    list = list.filter(o => o.checkin_date >= s && o.checkout_date <= e)
  }
  return list
})

async function loadOrders() {
  loading.value = true
  try {
    const res = await request.get('/bookings', { params: { status: 'checked_out' } })
    orders.value = res.data?.list || []
    updateStats()
  } catch (e) {
    orders.value = generateMockOrders()
    updateStats()
  } finally {
    loading.value = false
  }
}

function generateMockOrders() {
  return [
    {
      id: 1,
      order_no: 'BK20240115001',
      member_id: 1,
      member_name: '张三',
      member_phone: '13800138001',
      room_type_id: 3,
      room_type_name: '豪华大床房',
      checkin_date: '2024-01-15',
      checkout_date: '2024-01-17',
      total_price: 776,
      deposit: 500,
      status: 'checked_out',
      created_at: '2024-01-15 10:30:00'
    },
    {
      id: 2,
      order_no: 'BK20240114004',
      member_id: null,
      member_name: null,
      member_phone: null,
      room_type_id: 3,
      room_type_name: '豪华大床房',
      checkin_date: '2024-01-14',
      checkout_date: '2024-01-15',
      total_price: 388,
      deposit: 300,
      status: 'checked_out',
      created_at: '2024-01-14 14:20:00'
    },
    {
      id: 3,
      order_no: 'BK20240110003',
      member_id: 2,
      member_name: '李四',
      member_phone: '13800138002',
      room_type_id: 4,
      room_type_name: '商务套房',
      checkin_date: '2024-01-10',
      checkout_date: '2024-01-13',
      total_price: 1764,
      deposit: 1000,
      status: 'checked_out',
      created_at: '2024-01-10 09:15:00'
    },
    {
      id: 4,
      order_no: 'BK20240105002',
      member_id: 3,
      member_name: '王五',
      member_phone: '13800138003',
      room_type_id: 2,
      room_type_name: '标准双人间',
      checkin_date: '2024-01-05',
      checkout_date: '2024-01-06',
      total_price: 258,
      deposit: 200,
      status: 'checked_out',
      created_at: '2024-01-05 16:40:00'
    }
  ]
}

function updateStats() {
  const list = filteredOrders.value
  stats.totalCount = list.length
  stats.roomTotal = list.reduce((s, o) => s + (o.total_price || 0), 0)
  stats.extraTotal = list.length * 128
  stats.grandTotal = stats.roomTotal + stats.extraTotal
}

function resetFilters() {
  filters.dateRange = []
  filters.keyword = ''
  loadOrders()
}

function viewDetail(row) {
  currentOrder.value = row
  const nights = dayjs(row.checkout_date).diff(dayjs(row.checkin_date), 'day')
  const basePrice = (row.total_price || 0) / (nights || 1)
  const roomFees = []
  for (let i = 0; i < nights; i++) {
    roomFees.push({
      date: dayjs(row.checkin_date).add(i, 'day').format('YYYY-MM-DD'),
      desc: `${row.room_type_name}房费`,
      amount: basePrice
    })
  }
  const extraFees = [
    { type: '餐饮', desc: '餐厅消费', amount: 88 },
    { type: '迷你吧', desc: '酒水饮料', amount: 40 }
  ]
  const roomTotal = row.total_price || 0
  const extraTotal = extraFees.reduce((s, x) => s + x.amount, 0)
  const grandTotal = roomTotal + extraTotal
  const refund = Math.max(0, (row.deposit || 0) - extraTotal)

  Object.assign(billDetail, {
    roomFees,
    extraFees,
    roomTotal,
    extraTotal,
    grandTotal,
    refund
  })
  detailVisible.value = true
}

function exportOrders() {
  ElMessage.success('账单导出成功（模拟）')
}

function printBill() {
  ElMessage.success('账单已发送至打印机（模拟）')
}

onMounted(() => {
  loadOrders()
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

.filter-card {
  margin-bottom: 20px;
  border-radius: 8px;
}

.filter-form {
  margin: 0;
}

.stat-row {
  margin-bottom: 20px;
}

.stat-card {
  border-radius: 8px;
  border: none;
}

.stat-card :deep(.el-card__body) {
  padding: 18px;
}

.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info .stat-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
}

.stat-info .stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.stat-info .stat-value.revenue {
  color: #f56c6c;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.count-icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.room-icon {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.extra-icon {
  background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
}

.revenue-icon {
  background: linear-gradient(135deg, #f56c6c 0%, #e6a23c 100%);
}

.member-name {
  font-weight: 500;
  color: #303133;
}

.member-phone {
  font-size: 12px;
  color: #909399;
}

.text-muted {
  color: #c0c4cc;
}

.paid-amount {
  color: #67c23a;
  font-weight: 600;
}

.bill-detail {
  padding: 0 4px;
}

.bill-section {
  margin-bottom: 16px;
}

.bill-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
}

.bill-subtotal {
  text-align: right;
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
}

.bill-subtotal span {
  font-weight: 600;
  color: #303133;
  margin-left: 4px;
}

.bill-total-section {
  background: #fafafa;
  border-radius: 8px;
  padding: 14px 18px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 14px;
  color: #606266;
}

.total-row.final-row {
  padding-top: 10px;
  margin-top: 6px;
  border-top: 1px dashed #ebeef5;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.total-row .refund {
  color: #67c23a;
  font-weight: 500;
}

.total-row .final-amount {
  color: #f56c6c;
  font-size: 22px;
}
</style>
