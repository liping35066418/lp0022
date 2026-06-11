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
        <el-table-column prop="total_price" label="金额(元)" width="110" align="right">
          <template #default="{ row }">
            <span class="price-text">¥{{ row.total_price?.toFixed(2) }}</span>
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

    <el-dialog v-model="detailVisible" title="预订详情" width="600px">
      <el-descriptions :column="2" border v-if="currentBooking">
        <el-descriptions-item label="订单号">{{ currentBooking.order_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentBooking.status)" effect="dark">
            {{ getStatusText(currentBooking.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="会员">
          {{ currentBooking.member_name || '散客' }}
        </el-descriptions-item>
        <el-descriptions-item label="房型">{{ currentBooking.room_type_name }}</el-descriptions-item>
        <el-descriptions-item label="入住日期">{{ currentBooking.checkin_date }}</el-descriptions-item>
        <el-descriptions-item label="退房日期">{{ currentBooking.checkout_date }}</el-descriptions-item>
        <el-descriptions-item label="入住人数">{{ currentBooking.guest_count }}人</el-descriptions-item>
        <el-descriptions-item label="总金额">
          <span class="price-text">¥{{ currentBooking.total_price?.toFixed(2) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="押金">
          <span class="price-text">¥{{ currentBooking.deposit?.toFixed(2) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ currentBooking.created_at }}</el-descriptions-item>
      </el-descriptions>
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

async function loadBookings() {
  loading.value = true
  try {
    const params = {}
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.status) params.status = filters.status
    const res = await request.get('/bookings', { params })
    let list = res.data?.list || []
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
  currentBooking.value = row
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
</style>
