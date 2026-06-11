<template>
  <div class="page-container">
    <h2 class="page-title">客房管理</h2>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="房型">
          <el-select v-model="filters.roomTypeId" placeholder="全部房型" clearable style="width: 160px">
            <el-option
              v-for="rt in roomTypes"
              :key="rt.id"
              :label="rt.name"
              :value="rt.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px">
            <el-option label="空闲" value="available" />
            <el-option label="已住" value="occupied" />
            <el-option label="打扫" value="cleaning" />
            <el-option label="维修" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="楼层">
          <el-select v-model="filters.floor" placeholder="全部楼层" clearable style="width: 140px">
            <el-option
              v-for="f in floors"
              :key="f"
              :label="`${f}楼`"
              :value="f"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadRooms">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="room-grid">
      <div
        v-for="room in rooms"
        :key="room.id"
        class="room-card"
        :class="'status-' + room.status"
        @click="handleRoomClick(room)"
      >
        <div class="room-header">
          <span class="room-no">{{ room.room_no }}</span>
          <el-tag :type="getStatusType(room.status)" size="small" effect="dark">
            {{ getStatusText(room.status) }}
          </el-tag>
        </div>
        <div class="room-body">
          <div class="room-info">
            <el-icon :size="16"><OfficeBuilding /></el-icon>
            <span>{{ room.room_type_name }}</span>
          </div>
          <div class="room-info">
            <el-icon :size="16"><Location /></el-icon>
            <span>{{ room.floor }}楼</span>
          </div>
          <div class="room-info">
            <el-icon :size="16"><Money /></el-icon>
            <span>¥{{ room.base_price }}/晚</span>
          </div>
        </div>
        <div class="room-footer" v-if="room.remark">
          <span class="remark-text">{{ room.remark }}</span>
        </div>
      </div>
    </div>

    <el-empty v-if="rooms.length === 0 && !loading" description="暂无符合条件的客房" />

    <el-dialog v-model="detailVisible" :title="`客房详情 - ${currentRoom?.room_no}`" width="500px">
      <el-descriptions :column="2" border v-if="currentRoom">
        <el-descriptions-item label="房号">{{ currentRoom.room_no }}</el-descriptions-item>
        <el-descriptions-item label="楼层">{{ currentRoom.floor }}楼</el-descriptions-item>
        <el-descriptions-item label="房型">{{ currentRoom.room_type_name }}</el-descriptions-item>
        <el-descriptions-item label="基础价">¥{{ currentRoom.base_price }}/晚</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentRoom.status)">
            {{ getStatusText(currentRoom.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="床位数">{{ currentRoom.bed_count }}张</el-descriptions-item>
        <el-descriptions-item label="最多入住">{{ currentRoom.max_guests }}人</el-descriptions-item>
        <el-descriptions-item label="面积">{{ currentRoom.area }}㎡</el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ currentRoom.remark || '无' }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" @click="openStatusDialog">切换状态</el-button>
        <el-button type="success" @click="openCheckinDialog" :disabled="currentRoom?.status !== 'available'">
          办理入住
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statusVisible" title="切换客房状态" width="420px">
      <el-form :model="statusForm" label-width="80px">
        <el-form-item label="当前状态">
          <el-tag :type="getStatusType(currentRoom?.status)" size="large">
            {{ getStatusText(currentRoom?.status) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="目标状态" required>
          <el-radio-group v-model="statusForm.status">
            <el-radio value="available">
              <span class="status-dot available"></span>空闲
            </el-radio>
            <el-radio value="occupied">
              <span class="status-dot occupied"></span>已住
            </el-radio>
            <el-radio value="cleaning">
              <span class="status-dot cleaning"></span>打扫
            </el-radio>
            <el-radio value="maintenance">
              <span class="status-dot maintenance"></span>维修
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="statusForm.remark" type="textarea" :rows="3" placeholder="请输入备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitStatus">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="checkinVisible" title="办理入住" width="520px">
      <el-form :model="checkinForm" :rules="checkinRules" ref="checkinFormRef" label-width="100px">
        <el-form-item label="客房">
          <span>{{ currentRoom?.room_no }} - {{ currentRoom?.room_type_name }}</span>
        </el-form-item>
        <el-form-item label="客人姓名" prop="guestName">
          <el-input v-model="checkinForm.guestName" placeholder="请输入客人姓名" />
        </el-form-item>
        <el-form-item label="身份证号" prop="guestIdcard">
          <el-input v-model="checkinForm.guestIdcard" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="联系电话" prop="guestPhone">
          <el-input v-model="checkinForm.guestPhone" placeholder="请输入联系电话" />
        </el-form-item>
        <el-form-item label="押金金额" prop="depositAmount">
          <el-input-number v-model="checkinForm.depositAmount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="checkinVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCheckin">确认入住</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh, OfficeBuilding, Location, Money } from '@element-plus/icons-vue'
import request from '@/api'

const loading = ref(false)
const submitting = ref(false)
const rooms = ref([])
const roomTypes = ref([])
const floors = ref([])

const filters = reactive({
  roomTypeId: '',
  status: '',
  floor: ''
})

const detailVisible = ref(false)
const statusVisible = ref(false)
const checkinVisible = ref(false)
const currentRoom = ref(null)

const statusForm = reactive({
  status: '',
  remark: ''
})

const checkinForm = reactive({
  guestName: '',
  guestIdcard: '',
  guestPhone: '',
  depositAmount: 200
})

const checkinFormRef = ref(null)
const checkinRules = {
  guestName: [{ required: true, message: '请输入客人姓名', trigger: 'blur' }],
  guestPhone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  depositAmount: [{ required: true, message: '请输入押金金额', trigger: 'blur' }]
}

function getStatusType(status) {
  const map = {
    available: 'success',
    occupied: 'danger',
    cleaning: 'warning',
    maintenance: 'info'
  }
  return map[status] || 'info'
}

function getStatusText(status) {
  const map = {
    available: '空闲',
    occupied: '已住',
    cleaning: '打扫',
    maintenance: '维修'
  }
  return map[status] || status
}

async function loadRoomTypes() {
  try {
    const res = await request.get('/room-types')
    roomTypes.value = res.data?.list || []
  } catch (e) {}
}

async function loadFloors() {
  try {
    const res = await request.get('/room-status')
    const matrix = res.data?.matrix || []
    floors.value = matrix.map(m => m.floor)
  } catch (e) {
    floors.value = [1, 2, 3, 4, 5]
  }
}

async function loadRooms() {
  loading.value = true
  try {
    const params = {}
    if (filters.roomTypeId) params.room_type_id = filters.roomTypeId
    if (filters.status) params.status = filters.status
    if (filters.floor) params.floor = filters.floor
    const res = await request.get('/rooms', { params })
    rooms.value = res.data?.list || []
  } catch (e) {
    ElMessage.error('加载客房列表失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.roomTypeId = ''
  filters.status = ''
  filters.floor = ''
  loadRooms()
}

function handleRoomClick(room) {
  currentRoom.value = room
  ElMessageBox({
    title: `客房 ${room.room_no} 操作`,
    message: '请选择要执行的操作',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '取消',
    customClass: 'room-action-dialog'
  }).catch(() => {})

  const actionButtons = document.createElement('div')
  actionButtons.className = 'room-action-buttons'
  actionButtons.innerHTML = `
    <button class="el-button el-button--default" data-action="detail">查看详情</button>
    <button class="el-button el-button--primary" data-action="status">切换状态</button>
    <button class="el-button el-button--success" data-action="checkin" ${room.status !== 'available' ? 'disabled' : ''}>办理入住</button>
  `
  setTimeout(() => {
    const dialog = document.querySelector('.room-action-dialog')
    if (dialog) {
      const content = dialog.querySelector('.el-message-box__message')
      if (content) {
        content.appendChild(actionButtons)
        actionButtons.querySelectorAll('button').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action
            ElMessageBox.close()
            if (action === 'detail') openDetailDialog()
            if (action === 'status') openStatusDialog()
            if (action === 'checkin') openCheckinDialog()
          })
        })
      }
    }
  }, 50)
}

function openDetailDialog() {
  detailVisible.value = true
}

function openStatusDialog() {
  statusForm.status = currentRoom.value?.status || ''
  statusForm.remark = ''
  statusVisible.value = true
}

function openCheckinDialog() {
  checkinForm.guestName = ''
  checkinForm.guestIdcard = ''
  checkinForm.guestPhone = ''
  checkinForm.depositAmount = 200
  checkinVisible.value = true
}

async function submitStatus() {
  if (!statusForm.status) {
    ElMessage.warning('请选择目标状态')
    return
  }
  submitting.value = true
  try {
    await request.put(`/rooms/${currentRoom.value.id}/status`, {
      status: statusForm.status,
      remark: statusForm.remark
    })
    ElMessage.success('状态更新成功')
    statusVisible.value = false
    loadRooms()
  } catch (e) {
    ElMessage.error('状态更新失败')
  } finally {
    submitting.value = false
  }
}

async function submitCheckin() {
  try {
    await checkinFormRef.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    await request.post('/checkins', {
      room_id: currentRoom.value.id,
      guest_name: checkinForm.guestName,
      guest_idcard: checkinForm.guestIdcard,
      guest_phone: checkinForm.guestPhone,
      deposit_amount: checkinForm.depositAmount
    })
    ElMessage.success('办理入住成功')
    checkinVisible.value = false
    detailVisible.value = false
    loadRooms()
  } catch (e) {
    ElMessage.error('办理入住失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadRoomTypes()
  loadFloors()
  loadRooms()
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

.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.room-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
}

.room-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.room-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
}

.room-card.status-available::before {
  background: linear-gradient(90deg, #67c23a, #85ce61);
}
.room-card.status-occupied::before {
  background: linear-gradient(90deg, #f56c6c, #f78989);
}
.room-card.status-cleaning::before {
  background: linear-gradient(90deg, #e6a23c, #ebb563);
}
.room-card.status-maintenance::before {
  background: linear-gradient(90deg, #909399, #a6a9ad);
}

.room-card.status-available:hover {
  border-color: #67c23a;
}
.room-card.status-occupied:hover {
  border-color: #f56c6c;
}
.room-card.status-cleaning:hover {
  border-color: #e6a23c;
}
.room-card.status-maintenance:hover {
  border-color: #909399;
}

.room-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.room-no {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
}

.room-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.room-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #606266;
}

.room-info .el-icon {
  color: #909399;
}

.room-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #ebeef5;
}

.remark-text {
  font-size: 12px;
  color: #909399;
}

.status-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.status-dot.available {
  background-color: #67c23a;
}
.status-dot.occupied {
  background-color: #f56c6c;
}
.status-dot.cleaning {
  background-color: #e6a23c;
}
.status-dot.maintenance {
  background-color: #909399;
}

:deep(.room-action-dialog .el-message-box) {
  width: 360px;
}

:deep(.room-action-buttons) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

:deep(.room-action-buttons .el-button) {
  width: 100%;
}
</style>
