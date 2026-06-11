<template>
  <div class="page-container">
    <h2 class="page-title">预订管理</h2>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="订单号">
          <el-input
            v-model="filters.keyword"
            placeholder="订单号/会员/手机号"
            clearable
            style="width: 220px"
            @keyup.enter="loadBookings"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="待确认" value="pending" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="已入住" value="checked_in" />
            <el-option label="已完成" value="checked_out" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="入住日期"
            end-placeholder="退房日期"
            value-format="YYYY-MM-DD"
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadBookings">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
          <el-button type="success" :icon="Plus" @click="$router.push('/booking/new')">新建预订</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="bookings" v-loading="loading" stripe>
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
        <el-table-column prop="checkin_date" label="入住日期" width="120" />
        <el-table-column prop="checkout_date" label="退房日期" width="120" />
        <el-table-column prop="guest_count" label="人数" width="70" align="center" />
        <el-table-column label="房费明细" width="200" align="right">
          <template #default="{ row }">
            <div class="price-detail-cell">
              <div v-if="row.original_total && row.original_total !== row.total_price" class="original-line">
                <span class="original">¥{{ row.original_total?.toFixed(2) }}</span>
              </div>
              <div v-if="row.discount_amount > 0" class="discount-line">
                <span class="discount">-¥{{ row.discount_amount?.toFixed(2) }}优惠</span>
              </div>
              <div v-if="row.points_deduction_amount > 0" class="points-line">
                <span class="points">-¥{{ row.points_deduction_amount?.toFixed(2) }}积分</span>
              </div>
              <div class="final-line">
                <span class="final">¥{{ row.total_price?.toFixed(2) }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small" effect="dark">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">查看详情</el-button>
            <el-button
              v-if="row.status === 'pending'"
              type="success"
              link
              size="small"
              @click="confirmBooking(row)"
            >确认</el-button>
            <el-button
              v-if="row.status === 'pending' || row.status === 'confirmed'"
              type="danger"
              link
              size="small"
              @click="cancelBooking(row)"
            >取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="detailVisible" title="预订详情" width="680px">
      <div v-if="currentBooking">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ currentBooking.order_no }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentBooking.status)" effect="dark">
              {{ getStatusText(currentBooking.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="会员">
            {{ currentBooking.member_name || '散客' }}
            <span v-if="currentBooking.member_level" class="member-level-tag">
              ({{ getLevelName(currentBooking.member_level) }})
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="房型">{{ currentBooking.room_type_name }}</el-descriptions-item>
          <el-descriptions-item label="入住日期">{{ currentBooking.checkin_date }}</el-descriptions-item>
          <el-descriptions-item label="退房日期">{{ currentBooking.checkout_date }}</el-descriptions-item>
          <el-descriptions-item label="入住人数">{{ currentBooking.guest_count }}人</el-descriptions-item>
          <el-descriptions-item label="房间数量">{{ currentBooking.room_count || 1 }}间</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">价格明细</el-divider>

        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="原价合计">
            <span class="original-price">¥{{ currentBooking.original_total?.toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="会员折扣" v-if="currentBooking.member_discount_percent">
            <span class="discount-tag">{{ currentBooking.member_discount_percent }}%（{{ (currentBooking.member_discount_percent / 10).toFixed(1) }}折）</span>
          </el-descriptions-item>
          <el-descriptions-item label="会员优惠" v-if="currentBooking.discount_amount > 0">
            <span class="discount-price">-¥{{ currentBooking.discount_amount?.toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="折扣后金额" v-if="currentBooking.discounted_total">
            <span>¥{{ currentBooking.discounted_total?.toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="积分抵扣" v-if="currentBooking.points_deduction_amount > 0">
            <span class="points-price">-¥{{ currentBooking.points_deduction_amount?.toFixed(2) }}（{{ currentBooking.points_deducted }}积分）</span>
          </el-descriptions-item>
          <el-descriptions-item label="应付金额">
            <span class="final-price">¥{{ currentBooking.total_price?.toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="押金">
            <span class="price-text">¥{{ currentBooking.deposit?.toFixed(2) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ currentBooking.created_at }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left" v-if="currentBooking.price_breakdown?.daily_breakdown?.length">每日房价明细</el-divider>
        <el-table :data="currentBooking.price_breakdown?.daily_breakdown || []" size="small" border v-if="currentBooking.price_breakdown?.daily_breakdown?.length">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column label="类型" width="100" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.is_holiday" type="danger" size="small">{{ row.holiday_name || '节假日' }}</el-tag>
              <el-tag v-else-if="row.is_weekend" type="warning" size="small">周末</el-tag>
              <el-tag v-else type="info" size="small">平日</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="original_price" label="单价(元)" width="100" align="right" />
          <el-table-column label="会员价(元)" width="100" align="right" v-if="currentBooking.member_level">
            <template #default="{ row }">
              <span class="discount-price">¥{{ row.discounted_price?.toFixed(2) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import request from '@/api'

const loading = ref(false)
const bookings = ref([])
const detailVisible = ref(false)
const currentBooking = ref(null)

const filters = reactive({
  keyword: '',
  status: '',
  dateRange: []
})

function getStatusType(status) {
  const map = {
    pending: 'warning',
    confirmed: 'primary',
    checked_in: 'success',
    checked_out: 'info',
    cancelled: 'danger'
  }
  return map[status] || 'info'
}

function getStatusText(status) {
  const map = {
    pending: '待确认',
    confirmed: '已确认',
    checked_in: '已入住',
    checked_out: '已完成',
    cancelled: '已取消'
  }
  return map[status] || status
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

function parsePriceBreakdown(booking) {
  if (!booking) return booking
  try {
    if (typeof booking.price_breakdown === 'string') {
      booking.price_breakdown = JSON.parse(booking.price_breakdown)
    }
  } catch (e) {
    booking.price_breakdown = null
  }
  return booking
}

async function loadBookings() {
  loading.value = true
  try {
    const params = {}
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.status) params.status = filters.status
    const res = await request.get('/bookings', { params })
    let list = res.data?.list || []
    list = list.map(b => parsePriceBreakdown(b))
    if (filters.dateRange && filters.dateRange.length === 2) {
      const [start, end] = filters.dateRange
      list = list.filter(b => b.checkin_date >= start && b.checkout_date <= end)
    }
    bookings.value = list
  } catch (e) {
    ElMessage.error('加载预订列表失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.dateRange = []
  loadBookings()
}

function viewDetail(row) {
  currentBooking.value = parsePriceBreakdown({ ...row })
  detailVisible.value = true
}

function confirmBooking(row) {
  ElMessageBox.confirm(`确定确认预订「${row.order_no}」吗？`, '提示', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(async () => {
    try {
      await request.put(`/bookings/${row.id}/status`, { status: 'confirmed' })
      ElMessage.success('确认成功')
      loadBookings()
    } catch (e) {
      ElMessage.error('确认失败')
    }
  }).catch(() => {})
}

function cancelBooking(row) {
  ElMessageBox.confirm(`确定取消预订「${row.order_no}」吗？`, '提示', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(async () => {
    try {
      await request.put(`/bookings/${row.id}/status`, { status: 'cancelled' })
      ElMessage.success('取消成功')
      loadBookings()
    } catch (e) {
      ElMessage.error('取消失败')
    }
  }).catch(() => {})
}

onMounted(() => {
  loadBookings()
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

.price-text {
  color: #f56c6c;
  font-weight: 600;
}

.price-detail-cell {
  text-align: right;
  font-size: 12px;
  line-height: 1.6;
}

.price-detail-cell .original-line .original {
  text-decoration: line-through;
  color: #c0c4cc;
}

.price-detail-cell .discount-line .discount {
  color: #67c23a;
}

.price-detail-cell .points-line .points {
  color: #e6a23c;
}

.price-detail-cell .final-line .final {
  color: #f56c6c;
  font-weight: 600;
  font-size: 13px;
}

.member-level-tag {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}

.original-price {
  text-decoration: line-through;
  color: #c0c4cc;
}

.discount-price {
  color: #67c23a;
}

.points-price {
  color: #e6a23c;
}

.final-price {
  color: #f56c6c;
  font-size: 16px;
  font-weight: 700;
}

.discount-tag {
  color: #e6a23c;
  font-weight: 500;
}
</style>
