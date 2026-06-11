<template>
  <div class="page-container">
    <h2 class="page-title">会员管理</h2>

    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="搜索">
          <el-input
            v-model="filters.keyword"
            placeholder="姓名/手机号"
            clearable
            style="width: 220px"
            :prefix-icon="Search"
            @keyup.enter="loadMembers"
          />
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="filters.level" placeholder="全部等级" clearable style="width: 140px">
            <el-option label="普通会员" value="bronze" />
            <el-option label="银卡会员" value="silver" />
            <el-option label="金卡会员" value="gold" />
            <el-option label="铂金会员" value="platinum" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="loadMembers">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
          <el-button type="success" :icon="Plus" @click="openAddDialog">新增会员</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table :data="members" v-loading="loading" stripe>
        <el-table-column label="会员信息" min-width="220">
          <template #default="{ row }">
            <div class="member-cell">
              <el-avatar :size="40" class="member-avatar" :style="{ background: getLevelBg(row.level) }">
                {{ row.name?.charAt(0) }}
              </el-avatar>
              <div class="member-info">
                <div class="member-name">{{ row.name }}</div>
                <div class="member-phone">{{ row.phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="getLevelTagType(row.level)" effect="dark" size="small" class="level-tag">
              <span class="level-icon" :style="{ background: getLevelIconBg(row.level) }"></span>
              {{ getLevelName(row.level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="points" label="积分" width="110" align="right">
          <template #default="{ row }">
            <span class="points">{{ row.points?.toLocaleString() }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="total_spent" label="累计消费(元)" width="140" align="right">
          <template #default="{ row }">
            <span class="spent">¥{{ row.total_spent?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="折扣" width="90" align="center">
          <template #default="{ row }">
            <el-tag type="warning" size="small">{{ row.discount ? (row.discount / 10).toFixed(1) : '10' }}折</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewDetail(row)">详情</el-button>
            <el-button type="warning" link size="small" @click="openEditDialog(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="formVisible" :title="isEdit ? '编辑会员' : '新增会员'" width="480px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
        </el-form-item>
        <el-form-item label="等级" prop="level">
          <el-select v-model="form.level" placeholder="请选择等级" style="width: 100%">
            <el-option
              v-for="lv in levelOptions"
              :key="lv.level"
              :label="`${lv.name} (${(lv.discount / 10).toFixed(1)}折)`"
              :value="lv.level"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="会员详情" size="500px">
      <div v-if="currentMember" class="detail-content">
        <div class="detail-header">
          <el-avatar :size="72" class="detail-avatar" :style="{ background: getLevelBg(currentMember.level) }">
            {{ currentMember.name?.charAt(0) }}
          </el-avatar>
          <div class="detail-info">
            <div class="detail-name">
              {{ currentMember.name }}
              <el-tag :type="getLevelTagType(currentMember.level)" effect="dark" size="small">
                {{ getLevelName(currentMember.level) }}
              </el-tag>
            </div>
            <div class="detail-phone">{{ currentMember.phone }}</div>
            <div class="detail-meta">
              <span>积分：<strong>{{ currentMember.points?.toLocaleString() }}</strong></span>
              <span>累计消费：<strong>¥{{ currentMember.total_spent?.toFixed(2) }}</strong></span>
            </div>
          </div>
        </div>

        <el-tabs v-model="detailTab">
          <el-tab-pane label="积分记录" name="points">
            <el-table :data="pointsRecords" size="small" stripe>
              <el-table-column prop="created_at" label="时间" width="160">
                <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.type === 'earn' ? 'success' : 'warning'" size="small">
                    {{ row.type === 'earn' ? '获取' : '消费' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="points" label="积分" width="100" align="right">
                <template #default="{ row }">
                  <span :class="{ 'text-green': row.type === 'earn', 'text-red': row.type !== 'earn' }">
                    {{ row.type === 'earn' ? '+' : '-' }}{{ row.points }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="description" label="说明" show-overflow-tooltip />
            </el-table>
            <el-empty v-if="pointsRecords.length === 0" description="暂无积分记录" :image-size="60" />
          </el-tab-pane>

          <el-tab-pane label="消费历史" name="history">
            <el-table :data="consumeHistory" size="small" stripe>
              <el-table-column prop="date" label="日期" width="130" />
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column prop="amount" label="金额(元)" width="110" align="right">
                <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" show-overflow-tooltip />
            </el-table>
            <el-empty v-if="consumeHistory.length === 0" description="暂无消费记录" :image-size="60" />
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import request from '@/api'

const loading = ref(false)
const submitting = ref(false)
const members = ref([])
const levelOptions = ref([])

const filters = reactive({
  keyword: '',
  level: ''
})

const formVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const editId = ref(null)

const detailTab = ref('points')
const currentMember = ref(null)
const pointsRecords = ref([
  { created_at: '2024-01-10 14:20:00', type: 'earn', points: 388, description: '入住消费积分' },
  { created_at: '2024-01-05 10:00:00', type: 'earn', points: 258, description: '入住消费积分' },
  { created_at: '2023-12-20 16:30:00', type: 'earn', points: 588, description: '入住消费积分' }
])
const consumeHistory = ref([
  { date: '2024-01-10', type: '房费', amount: 388, remark: '豪华大床房2晚' },
  { date: '2024-01-05', type: '房费', amount: 258, remark: '标准双人间1晚' },
  { date: '2023-12-20', type: '房费', amount: 588, remark: '商务套房1晚' }
])

const defaultForm = {
  name: '',
  phone: '',
  level: 'bronze'
}

const form = reactive({ ...defaultForm })

const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '手机号格式不正确', trigger: 'blur' }
  ],
  level: [{ required: true, message: '请选择等级', trigger: 'change' }]
}

function getLevelName(level) {
  const map = {
    bronze: '普通会员',
    silver: '银卡会员',
    gold: '金卡会员',
    platinum: '铂金会员'
  }
  return map[level] || '普通会员'
}

function getLevelTagType(level) {
  const map = {
    bronze: 'info',
    silver: '',
    gold: 'warning',
    platinum: 'primary'
  }
  return map[level] || 'info'
}

function getLevelBg(level) {
  const map = {
    bronze: 'linear-gradient(135deg, #a8a8a8, #808080)',
    silver: 'linear-gradient(135deg, #c0c0c0, #808080)',
    gold: 'linear-gradient(135deg, #ffd700, #daa520)',
    platinum: 'linear-gradient(135deg, #e5e4e2, #708090)'
  }
  return map[level] || map.bronze
}

function getLevelIconBg(level) {
  const map = {
    bronze: '#a8a8a8',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#6a7b9c'
  }
  return map[level] || '#a8a8a8'
}

function formatDate(dt) {
  if (!dt) return '-'
  return dayjs(dt).format('YYYY-MM-DD HH:mm')
}

async function loadLevelOptions() {
  try {
    const res = await request.get('/member-levels')
    levelOptions.value = res.data?.list || []
  } catch (e) {}
}

async function loadMembers() {
  loading.value = true
  try {
    const params = {}
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.level) params.level = filters.level
    const res = await request.get('/members', { params })
    members.value = res.data?.list || []
  } catch (e) {
    ElMessage.error('加载会员列表失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  filters.keyword = ''
  filters.level = ''
  loadMembers()
}

function openAddDialog() {
  isEdit.value = false
  editId.value = null
  Object.assign(form, defaultForm)
  formVisible.value = true
}

function openEditDialog(row) {
  isEdit.value = true
  editId.value = row.id
  Object.assign(form, {
    name: row.name,
    phone: row.phone,
    level: row.level
  })
  formVisible.value = true
}

function viewDetail(row) {
  currentMember.value = row
  detailVisible.value = true
}

async function submitForm() {
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }
  submitting.value = true
  try {
    if (isEdit.value) {
      await request.put(`/members/${editId.value}`, form)
      ElMessage.success('更新成功')
    } else {
      await request.post('/members', form)
      ElMessage.success('创建成功')
    }
    formVisible.value = false
    loadMembers()
  } catch (e) {
    ElMessage.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadLevelOptions()
  loadMembers()
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

.member-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.member-avatar {
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}

.member-info .member-name {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.member-info .member-phone {
  font-size: 12px;
  color: #909399;
}

.level-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.level-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.points {
  color: #e6a23c;
  font-weight: 600;
}

.spent {
  color: #f56c6c;
  font-weight: 500;
}

.text-green {
  color: #67c23a;
  font-weight: 600;
}

.text-red {
  color: #f56c6c;
  font-weight: 600;
}

.detail-content {
  padding: 0 8px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
  margin-bottom: 16px;
}

.detail-avatar {
  color: #fff;
  font-weight: 600;
  font-size: 28px;
}

.detail-info .detail-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.detail-info .detail-phone {
  color: #606266;
  margin-bottom: 8px;
}

.detail-info .detail-meta {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: #606266;
}

.detail-info .detail-meta strong {
  color: #303133;
  margin-left: 4px;
}
</style>
