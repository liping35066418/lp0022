<template>
  <div class="dashboard">
    <h2 class="page-title">数据概览</h2>
    
    <el-row :gutter="20" class="stat-cards">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card checkin-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">今日入住</div>
              <div class="stat-value">{{ stats.todayCheckin }}</div>
            </div>
            <div class="stat-icon">
              <el-icon :size="40"><Suitcase /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card checkout-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">今日退房</div>
              <div class="stat-value">{{ stats.todayCheckout }}</div>
            </div>
            <div class="stat-icon">
              <el-icon :size="40"><Right /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card occupied-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">在住客房</div>
              <div class="stat-value">{{ stats.occupiedRooms }}</div>
            </div>
            <div class="stat-icon">
              <el-icon :size="40"><UserFilled /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card vacant-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-info">
              <div class="stat-title">空房数量</div>
              <div class="stat-value">{{ stats.vacantRooms }}</div>
            </div>
            <div class="stat-icon">
              <el-icon :size="40"><HomeFilled /></el-icon>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-4">
      <el-col :xs="24" :sm="24" :md="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>最近预订</span>
              <el-button type="primary" link @click="$router.push('/bookings')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentBookings" stripe>
            <el-table-column prop="bookingNo" label="预订编号" width="140" />
            <el-table-column prop="guestName" label="客人姓名" width="120" />
            <el-table-column prop="roomType" label="房型" width="120" />
            <el-table-column prop="checkinDate" label="入住日期" width="120" />
            <el-table-column prop="checkoutDate" label="退房日期" width="120" />
            <el-table-column prop="status" label="状态">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="8">
        <el-card shadow="hover">
          <template #header>
            <span>客房状态统计</span>
          </template>
          <div class="room-stats">
            <div class="room-stat-item">
              <div class="stat-dot occupied"></div>
              <span>已入住</span>
              <span class="stat-num">{{ stats.occupiedRooms }}</span>
            </div>
            <div class="room-stat-item">
              <div class="stat-dot vacant"></div>
              <span>空房</span>
              <span class="stat-num">{{ stats.vacantRooms }}</span>
            </div>
            <div class="room-stat-item">
              <div class="stat-dot cleaning"></div>
              <span>清洁中</span>
              <span class="stat-num">{{ stats.cleaningRooms }}</span>
            </div>
            <div class="room-stat-item">
              <div class="stat-dot maintenance"></div>
              <span>维修中</span>
              <span class="stat-num">{{ stats.maintenanceRooms }}</span>
            </div>
            <div class="occupancy-rate">
              <div class="rate-title">入住率</div>
              <el-progress :percentage="occupancyRate" :stroke-width="16" :color="rateColor" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const stats = ref({
  todayCheckin: 8,
  todayCheckout: 5,
  occupiedRooms: 68,
  vacantRooms: 25,
  cleaningRooms: 5,
  maintenanceRooms: 2
})

const recentBookings = ref([
  { bookingNo: 'BK20240115001', guestName: '张三', roomType: '豪华大床房', checkinDate: '2024-01-15', checkoutDate: '2024-01-17', status: 'confirmed' },
  { bookingNo: 'BK20240115002', guestName: '李四', roomType: '标准双床房', checkinDate: '2024-01-15', checkoutDate: '2024-01-16', status: 'checkedin' },
  { bookingNo: 'BK20240114003', guestName: '王五', roomType: '商务套房', checkinDate: '2024-01-14', checkoutDate: '2024-01-18', status: 'checkedin' },
  { bookingNo: 'BK20240114004', guestName: '赵六', roomType: '豪华大床房', checkinDate: '2024-01-14', checkoutDate: '2024-01-15', status: 'checkedout' },
  { bookingNo: 'BK20240113005', guestName: '钱七', roomType: '标准双床房', checkinDate: '2024-01-13', checkoutDate: '2024-01-15', status: 'cancelled' }
])

const totalRooms = computed(() => {
  return stats.value.occupiedRooms + stats.value.vacantRooms + stats.value.cleaningRooms + stats.value.maintenanceRooms
})

const occupancyRate = computed(() => {
  if (totalRooms.value === 0) return 0
  return Math.round((stats.value.occupiedRooms / totalRooms.value) * 100)
})

const rateColor = computed(() => {
  if (occupancyRate.value >= 80) return '#67C23A'
  if (occupancyRate.value >= 60) return '#E6A23C'
  return '#F56C6C'
})

function getStatusType(status) {
  const map = {
    confirmed: 'primary',
    checkedin: 'success',
    checkedout: 'info',
    cancelled: 'danger'
  }
  return map[status] || 'info'
}

function getStatusText(status) {
  const map = {
    confirmed: '已确认',
    checkedin: '已入住',
    checkedout: '已退房',
    cancelled: '已取消'
  }
  return map[status] || status
}
</script>

<style scoped>
.dashboard {
  width: 100%;
}

.page-title {
  margin: 0 0 20px;
  font-size: 20px;
  color: #303133;
}

.stat-cards {
  margin-bottom: 20px;
}

.stat-card {
  border-radius: 8px;
  border: none;
}

.stat-card :deep(.el-card__body) {
  padding: 20px;
}

.stat-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-info .stat-title {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-info .stat-value {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
}

.stat-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.checkin-card .stat-icon {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.checkout-card .stat-icon {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: #fff;
}

.occupied-card .stat-icon {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #fff;
}

.vacant-card .stat-icon {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  color: #fff;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.room-stats {
  padding: 10px 0;
}

.room-stat-item {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
  color: #606266;
}

.stat-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 12px;
}

.stat-dot.occupied {
  background-color: #409EFF;
}

.stat-dot.vacant {
  background-color: #67C23A;
}

.stat-dot.cleaning {
  background-color: #E6A23C;
}

.stat-dot.maintenance {
  background-color: #F56C6C;
}

.room-stat-item span:nth-child(2) {
  flex: 1;
}

.stat-num {
  font-weight: 600;
  color: #303133;
}

.occupancy-rate {
  margin-top: 20px;
}

.rate-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
}
</style>
