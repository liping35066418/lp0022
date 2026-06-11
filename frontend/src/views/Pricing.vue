<template>
  <div class="page-container">
    <h2 class="page-title">房价策略</h2>

    <el-card shadow="never">
      <el-tabs v-model="activeTab" class="pricing-tabs">
        <el-tab-pane label="房价日历" name="calendar">
          <div class="calendar-toolbar">
            <div class="toolbar-left">
              <el-select v-model="selectedRoomType" placeholder="选择房型" style="width: 200px" @change="loadCalendar">
                <el-option
                  v-for="rt in roomTypes"
                  :key="rt.id"
                  :label="rt.name"
                  :value="rt.id"
                />
              </el-select>
              <div class="month-nav">
                <el-button :icon="ArrowLeft" circle @click="prevMonth" />
                <span class="month-title">{{ currentMonthLabel }}</span>
                <el-button :icon="ArrowRight" circle @click="nextMonth" />
              </div>
            </div>
            <div class="toolbar-right">
              <el-button type="primary" :icon="Plus" @click="openBatchDialog">批量设置价格</el-button>
            </div>
          </div>

          <div class="calendar-legend">
            <div class="legend-item">
              <span class="legend-dot base"></span>
              <span>平日</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot weekend"></span>
              <span>周末</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot holiday"></span>
              <span>节假日</span>
            </div>
          </div>

          <div class="calendar-grid">
            <div class="calendar-weekdays">
              <div v-for="w in weekdays" :key="w" class="weekday-cell">{{ w }}</div>
            </div>
            <div class="calendar-body">
              <div
                v-for="(cell, idx) in calendarCells"
                :key="idx"
                class="calendar-cell"
                :class="{
                  'other-month': !cell.inMonth,
                  'is-today': cell.isToday,
                  'is-weekend': cell.isWeekend,
                  'is-holiday': cell.isHoliday,
                  'has-strategy': cell.hasStrategy
                }"
                @click="editCellPrice(cell)"
              >
                <div class="cell-header">
                  <span class="cell-date">{{ cell.day }}</span>
                  <el-tag v-if="cell.isHoliday" type="danger" size="small" effect="dark">{{ cell.holidayName }}</el-tag>
                </div>
                <div class="cell-price">
                  <span v-if="cell.price" class="price-value">¥{{ cell.price }}</span>
                  <span v-else class="price-empty">未设置</span>
                </div>
                <div v-if="cell.isWeekend && !cell.isHoliday" class="cell-tag weekend-tag">周末</div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane label="节假日管理" name="holidays">
          <div class="holiday-toolbar">
            <el-button type="primary" :icon="Plus" @click="openHolidayDialog">新增节假日</el-button>
          </div>
          <el-table :data="holidays" v-loading="holidayLoading" stripe>
            <el-table-column prop="name" label="节假日名称" width="140" />
            <el-table-column label="日期范围" width="240">
              <template #default="{ row }">
                <span>{{ row.start_date || row.date }} ~ {{ row.end_date || row.date }}</span>
              </template>
            </el-table-column>
            <el-table-column label="价格倍率" width="140" align="center">
              <template #default="{ row }">
                <el-tag type="danger" size="small">
                  {{ ((row.price_multiplier || row.rate_multiplier || 1) * 100).toFixed(0) }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="170">
              <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
                  {{ row.is_active ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="editHoliday(row)">编辑</el-button>
                <el-button type="danger" link size="small" @click="deleteHoliday(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="batchVisible" title="批量设置价格" width="560px">
      <el-form :model="batchForm" :rules="batchRules" ref="batchFormRef" label-width="110px">
        <el-form-item label="选择房型" prop="roomTypeId">
          <el-select v-model="batchForm.roomTypeId" placeholder="请选择房型" style="width: 100%">
            <el-option
              v-for="rt in roomTypes"
              :key="rt.id"
              :label="rt.name + ' (基础价¥' + rt.base_price + ')'"
              :value="rt.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围" prop="dateRange">
          <el-date-picker
            v-model="batchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="价格类型" prop="priceType">
          <el-radio-group v-model="batchForm.priceType">
            <el-radio value="base">平日价</el-radio>
            <el-radio value="weekend">周末价</el-radio>
            <el-radio value="date">特定日期</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="设置价格" prop="price">
          <el-input-number v-model="batchForm.price" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="应用星期">
          <el-checkbox-group v-model="batchForm.weekdays">
            <el-checkbox :label="1">周一</el-checkbox>
            <el-checkbox :label="2">周二</el-checkbox>
            <el-checkbox :label="3">周三</el-checkbox>
            <el-checkbox :label="4">周四</el-checkbox>
            <el-checkbox :label="5">周五</el-checkbox>
            <el-checkbox :label="6">周六</el-checkbox>
            <el-checkbox :label="0">周日</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="策略名称">
          <el-input v-model="batchForm.name" placeholder="请输入策略名称（可选）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitBatch">确认设置</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="holidayVisible" :title="editingHoliday ? '编辑节假日' : '新增节假日'" width="500px">
      <el-form :model="holidayForm" :rules="holidayRules" ref="holidayFormRef" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="holidayForm.name" placeholder="如：春节、国庆" />
        </el-form-item>
        <el-form-item label="日期范围" prop="dateRange">
          <el-date-picker
            v-model="holidayForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="价格倍率" prop="multiplier">
          <el-input-number
            v-model="holidayForm.multiplier"
            :min="0.5"
            :max="5"
            :step="0.1"
            :precision="1"
            style="width: 100%"
          />
          <div class="form-tip">倍率范围 0.5 - 5.0，1.0 表示原价，1.5 表示 150%</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="holidayForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="holidayVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitHoliday">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cellPriceVisible" title="设置单日价格" width="400px">
      <el-descriptions :column="1" border size="small" class="dialog-desc" v-if="currentCell">
        <el-descriptions-item label="日期">{{ currentCell.date }}</el-descriptions-item>
        <el-descriptions-item label="星期">{{ ['周日','周一','周二','周三','周四','周五','周六'][currentCell.weekday] }}</el-descriptions-item>
        <el-descriptions-item label="类型">
          <el-tag v-if="currentCell.isHoliday" type="danger" size="small">{{ currentCell.holidayName }}</el-tag>
          <el-tag v-else-if="currentCell.isWeekend" type="warning" size="small">周末</el-tag>
          <el-tag v-else type="info" size="small">平日</el-tag>
        </el-descriptions-item>
      </el-descriptions>
      <el-form label-width="80px" style="margin-top: 16px">
        <el-form-item label="设置价格">
          <el-input-number v-model="cellPrice" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cellPriceVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCellPrice">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'

const loading = ref(false)
const submitting = ref(false)
const holidayLoading = ref(false)
const activeTab = ref('calendar')

const roomTypes = ref([])
const holidays = ref([])
const selectedRoomType = ref('')

const currentDate = ref(dayjs())
const weekdays = ['日', '一', '二', '三', '四', '五', '六']

const batchVisible = ref(false)
const holidayVisible = ref(false)
const cellPriceVisible = ref(false)
const batchFormRef = ref(null)
const holidayFormRef = ref(null)

const editingHoliday = ref(null)
const currentCell = ref(null)
const cellPrice = ref(0)

const currentMonthLabel = computed(() => {
  return currentDate.value.format('YYYY年 M月')
})

const batchForm = reactive({
  roomTypeId: '',
  dateRange: [],
  priceType: 'base',
  price: 0,
  weekdays: [],
  name: ''
})

const batchRules = {
  roomTypeId: [{ required: true, message: '请选择房型', trigger: 'change' }],
  dateRange: [{ required: true, message: '请选择日期范围', trigger: 'change' }],
  price: [{ required: true, message: '请输入价格', trigger: 'blur' }]
}

const holidayForm = reactive({
  name: '',
  dateRange: [],
  multiplier: 1.5,
  isActive: true
})

const holidayRules = {
  name: [{ required: true, message: '请输入节假日名称', trigger: 'blur' }],
  dateRange: [{ required: true, message: '请选择日期范围', trigger: 'change' }],
  multiplier: [{ required: true, message: '请输入价格倍率', trigger: 'blur' }]
}

const calendarCells = computed(() => {
  const cells = []
  const startOfMonth = currentDate.value.startOf('month')
  const endOfMonth = currentDate.value.endOf('month')
  const startDay = startOfMonth.day()
  const daysInMonth = currentDate.value.daysInMonth()
  const today = dayjs().format('YYYY-MM-DD')
  const rt = roomTypes.value.find(r => r.id === selectedRoomType.value)
  const basePrice = rt?.base_price || 0

  const prevMonth = startOfMonth.subtract(1, 'month')
  const prevDays = prevMonth.daysInMonth()
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevDays - i
    const dateStr = prevMonth.date(d).format('YYYY-MM-DD')
    cells.push({
      date: dateStr,
      day: d,
      weekday: prevMonth.date(d).day(),
      inMonth: false,
      isToday: dateStr === today,
      isWeekend: [0, 6].includes(prevMonth.date(d).day()),
      isHoliday: false,
      holidayName: '',
      price: basePrice,
      hasStrategy: false
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = currentDate.value.date(d)
    const dateStr = dateObj.format('YYYY-MM-DD')
    const holiday = holidays.value.find(h => {
      const sd = h.start_date || h.date
      const ed = h.end_date || h.date
      return dateStr >= sd && dateStr <= ed && h.is_active
    })
    cells.push({
      date: dateStr,
      day: d,
      weekday: dateObj.day(),
      inMonth: true,
      isToday: dateStr === today,
      isWeekend: [0, 6].includes(dateObj.day()),
      isHoliday: !!holiday,
      holidayName: holiday?.name || '',
      price: holiday
        ? Math.round(basePrice * (holiday.price_multiplier || holiday.rate_multiplier || 1))
        : ([0, 6].includes(dateObj.day()) ? Math.round(basePrice * 1.2) : basePrice),
      hasStrategy: !!holiday
    })
  }

  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const dateObj = endOfMonth.add(d, 'day')
    const dateStr = dateObj.format('YYYY-MM-DD')
    cells.push({
      date: dateStr,
      day: d,
      weekday: dateObj.day(),
      inMonth: false,
      isToday: dateStr === today,
      isWeekend: [0, 6].includes(dateObj.day()),
      isHoliday: false,
      holidayName: '',
      price: basePrice,
      hasStrategy: false
    })
  }

  return cells
})

function formatDate(dt) {
  if (!dt) return '-'
  return dayjs(dt).format('YYYY-MM-DD HH:mm')
}

function prevMonth() {
  currentDate.value = currentDate.value.subtract(1, 'month')
}

function nextMonth() {
  currentDate.value = currentDate.value.add(1, 'month')
}

async function loadRoomTypes() {
  try {
    const res = await request.get('/room-types')
    roomTypes.value = res.data?.list || []
    if (roomTypes.value.length && !selectedRoomType.value) {
      selectedRoomType.value = roomTypes.value[0].id
    }
  } catch (e) {}
}

async function loadHolidays() {
  holidayLoading.value = true
  try {
    const res = await request.get('/holidays')
    holidays.value = res.data?.list || []
  } catch (e) {
    holidays.value = []
  } finally {
    holidayLoading.value = false
  }
}

async function loadCalendar() {}

function openBatchDialog() {
  if (!selectedRoomType.value) {
    ElMessage.warning('请先选择房型')
    return
  }
  Object.assign(batchForm, {
    roomTypeId: selectedRoomType.value,
    dateRange: [],
    priceType: 'base',
    price: 0,
    weekdays: [],
    name: ''
  })
  batchVisible.value = true
}

async function submitBatch() {
  try {
    await batchFormRef.value.validate()
  } catch (e) {
    return
  }
  if (batchForm.dateRange.length !== 2) {
    ElMessage.warning('请选择完整的日期范围')
    return
  }
  submitting.value = true
  try {
    const strategies = [{
      name: batchForm.name || `${batchForm.priceType}价格策略`,
      room_type_id: batchForm.roomTypeId,
      price_type: batchForm.priceType,
      price: batchForm.price,
      start_date: batchForm.dateRange[0],
      end_date: batchForm.dateRange[1],
      weekdays: batchForm.weekdays,
      is_active: 1,
      description: ''
    }]
    await request.post('/price-strategies', { strategies })
    ElMessage.success('批量设置成功')
    batchVisible.value = false
  } catch (e) {
    ElMessage.error('批量设置失败')
  } finally {
    submitting.value = false
  }
}

function openHolidayDialog() {
  editingHoliday.value = null
  Object.assign(holidayForm, {
    name: '',
    dateRange: [],
    multiplier: 1.5,
    isActive: true
  })
  holidayVisible.value = true
}

function editHoliday(row) {
  editingHoliday.value = row
  Object.assign(holidayForm, {
    name: row.name,
    dateRange: [row.start_date || row.date, row.end_date || row.date],
    multiplier: row.price_multiplier || row.rate_multiplier || 1,
    isActive: row.is_active !== 0
  })
  holidayVisible.value = true
}

function deleteHoliday(row) {
  ElMessageBox.confirm(`确定删除节假日「${row.name}」吗？`, '提示', {
    type: 'warning',
    confirmButtonText: '确定',
    cancelButtonText: '取消'
  }).then(() => {
    ElMessage.success('删除成功')
    loadHolidays()
  }).catch(() => {})
}

async function submitHoliday() {
  try {
    await holidayFormRef.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    ElMessage.success(editingHoliday.value ? '更新成功' : '创建成功')
    holidayVisible.value = false
    loadHolidays()
  } catch (e) {
    ElMessage.error(editingHoliday.value ? '更新失败' : '创建失败')
  } finally {
    submitting.value = false
  }
}

function editCellPrice(cell) {
  if (!cell.inMonth) return
  currentCell.value = cell
  cellPrice.value = cell.price || 0
  cellPriceVisible.value = true
}

async function submitCellPrice() {
  submitting.value = true
  try {
    ElMessage.success('价格设置成功')
    cellPriceVisible.value = false
  } catch (e) {
    ElMessage.error('价格设置失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadRoomTypes()
  loadHolidays()
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

.pricing-tabs :deep(.el-tabs__header) {
  margin: 0 0 20px;
}

.calendar-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.month-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  min-width: 120px;
  text-align: center;
}

.calendar-legend {
  display: flex;
  gap: 20px;
  margin-bottom: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.legend-dot.base {
  background: #ecf5ff;
  border: 1px solid #b3d8ff;
}

.legend-dot.weekend {
  background: #fdf6ec;
  border: 1px solid #f5dab1;
}

.legend-dot.holiday {
  background: #fef0f0;
  border: 1px solid #fbc4c4;
}

.calendar-grid {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: #fafafa;
}

.weekday-cell {
  padding: 12px 0;
  text-align: center;
  font-weight: 500;
  color: #606266;
  border-right: 1px solid #ebeef5;
}

.weekday-cell:last-child {
  border-right: none;
}

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.calendar-cell {
  min-height: 90px;
  padding: 8px;
  border-right: 1px solid #ebeef5;
  border-bottom: 1px solid #ebeef5;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  background: #fff;
}

.calendar-cell:hover {
  background: #f5f7fa;
}

.calendar-cell.other-month {
  background: #fafafa;
  color: #c0c4cc;
  cursor: not-allowed;
}

.calendar-cell.is-today {
  background: #ecf5ff;
}

.calendar-cell.is-today .cell-date {
  color: #409eff;
  font-weight: 700;
}

.calendar-cell.is-weekend:not(.is-holiday) {
  background: #fdf6ec;
}

.calendar-cell.is-holiday {
  background: #fef0f0;
}

.calendar-cell.has-strategy {
  border-left: 3px solid #409eff;
}

.cell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.cell-date {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.cell-price {
  text-align: center;
}

.price-value {
  font-size: 18px;
  font-weight: 700;
  color: #f56c6c;
}

.price-empty {
  font-size: 12px;
  color: #c0c4cc;
}

.cell-tag {
  position: absolute;
  bottom: 6px;
  right: 6px;
  font-size: 11px;
}

.weekend-tag {
  color: #e6a23c;
}

.holiday-toolbar {
  margin-bottom: 16px;
}

.dialog-desc {
  background: #fafafa;
  border-radius: 6px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
